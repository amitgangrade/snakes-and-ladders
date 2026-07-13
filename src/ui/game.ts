// Game screen: board + dice + player cards. Moves arrive as scripts (from the
// authority) and are played back through an animation queue so every device
// watches the same show.

import { SEAT_COLORS } from '../engine/names'
import type { Nav, Screen } from '../main'
import type { LastMove, Session } from '../net/session'
import { createBoard, type TokenView } from './board'
import { createDice } from './dice'
import { clear, h, rm, vibrate, wait } from './dom'
import { makeConfetti, type Confetti } from './fx'
import { sound } from './sound'

const EMOJIS = ['👍', '😂', '😮', '🎉', '😭', '❤️']

export function gameScreen(nav: Nav, session: Session): Screen {
  const board = createBoard()
  const dice = createDice()
  const cardsEl = h('div', { class: 'pcards' })
  const label = h('div', { class: 'dice-label' })
  const eventLine = h('div', { class: 'event-line' }, 'Good luck, have fun! 🍀')

  let lastMoveSeen = session.snap().lastMove?.id ?? 0
  let queue: LastMove[] = []
  let animating = false
  // what the board currently shows — cards read this while a move is playing
  // back, so they never spoil where the dice will land
  let shownPos = [...session.snap().pos]
  let overlay: HTMLElement | null = null
  let overlayConfetti: Confetti | null = null
  let lastTurnToast = -1
  let lastEmojiSent = 0
  let disposed = false

  // ---- helpers -------------------------------------------------------------

  function tokenViews(): TokenView[] {
    const snap = session.snap()
    return snap.seats.flatMap((s, seat) =>
      s ? [{ seat, avatar: s.avatar, pos: snap.pos[seat] }] : [],
    )
  }

  function canTap(): boolean {
    return session.canRoll() && !animating && queue.length === 0
  }

  function refreshPanel() {
    const snap = session.snap()
    const busy = animating || queue.length > 0
    const pos = busy ? shownPos : snap.pos

    // player cards
    clear(cardsEl)
    const leaderPos = Math.max(...snap.seats.map((s, i) => (s ? pos[i] : 0)))
    snap.seats.forEach((seat, i) => {
      if (!seat) return
      const card = h('div', { class: 'pcard', style: `--sc:${SEAT_COLORS[i]}` })
      if (snap.phase === 'playing' && snap.turn === i) card.classList.add('turn')
      if (!seat.connected) card.classList.add('offline')
      if (leaderPos > 0 && pos[i] === leaderPos) card.append(h('span', { class: 'crown' }, '👑'))
      const nameRow = h('div', { class: 'pcard-name' }, seat.name)
      if (session.mode !== 'local' && session.mySeat() === i) nameRow.append(h('span', { class: 'chip' }, 'YOU'))
      if (seat.kind === 'bot') nameRow.append(h('span', { class: 'chip chip-bot' }, '🤖'))
      if (!seat.connected) nameRow.append(h('span', { class: 'chip chip-off' }, '💤'))
      const info = h(
        'div',
        { class: 'pcard-info' },
        nameRow,
        h('div', { class: 'pcard-cell' }, pos[i] === 0 ? 'Ready to hop in!' : `Square ${pos[i]}`),
      )
      card.append(h('div', { class: 'pcard-avatar' }, seat.avatar), info)
      if (session.mode === 'host' && seat.kind === 'human' && !seat.connected) {
        card.append(
          h(
            'button',
            { class: 'chip-btn', onClick: () => (sound.tap(), session.botTakeover(i)) },
            '🤖 Let a bot play',
          ),
        )
      }
      cardsEl.append(card)
    })

    // dice + label
    board.setActiveSeat(snap.phase === 'playing' ? snap.turn : null)
    dice.setEnabled(canTap())
    label.classList.remove('excited')
    if (animating) return // the move playback owns the label right now
    if (snap.phase === 'over') {
      const w = snap.winner !== null ? snap.seats[snap.winner] : null
      label.textContent = w ? `🏆 ${w.name} wins!` : ''
      return
    }
    const turnSeat = snap.seats[snap.turn]
    if (!turnSeat) return
    if (canTap()) {
      label.textContent =
        session.mode === 'local' ? `👉 ${turnSeat.name}, tap the dice!` : '👉 TAP THE DICE!'
      label.classList.add('excited')
    } else if (turnSeat.kind === 'bot') {
      label.textContent = `🤖 ${turnSeat.name} is thinking…`
    } else if (!turnSeat.connected) {
      label.textContent = `😴 Waiting for ${turnSeat.name} to come back…`
    } else {
      label.textContent = `Waiting for ${turnSeat.avatar} ${turnSeat.name}…`
    }
  }

  function announceTurn() {
    const snap = session.snap()
    if (snap.phase !== 'playing' || snap.turn === lastTurnToast) return
    lastTurnToast = snap.turn
    const seat = snap.seats[snap.turn]
    if (!seat) return
    if (session.mode === 'local') {
      if (seat.kind === 'human') {
        board.fx.toast(`${seat.avatar} ${seat.name}'s turn!`, 'turn')
        sound.chime()
      }
    } else if (session.canRoll()) {
      board.fx.toast('YOUR TURN! 🎲', 'turn')
      sound.chime()
      vibrate(40)
    }
  }

  // ---- move playback -------------------------------------------------------

  async function playMove(m: LastMove) {
    const seat = session.snap().seats[m.seat]
    const name = seat?.name ?? 'Player'
    const avatar = seat?.avatar ?? '🎲'
    label.classList.remove('excited')
    label.textContent = `${avatar} ${name} is rolling…`
    await dice.roll(m.roll)
    eventLine.textContent = `${avatar} ${name} rolled a ${m.roll}!`
    await board.animateScript(m.seat, m)
    if (m.win) {
      board.fx.toast(`🏆 ${name} WINS!`, 'win')
      sound.win()
      vibrate([80, 40, 80, 40, 160])
      board.burstAtCell(100)
      board.confetti.rain(3200)
      await wait(rm(1500))
    } else if (m.extra) {
      board.fx.toast('⭐ SIX! Roll again!', 'turn')
      sound.six()
      await wait(rm(350))
    }
  }

  async function pump() {
    if (animating) return
    animating = true
    refreshPanel()
    while (queue.length) {
      const m = queue.shift()!
      await playMove(m)
      shownPos[m.seat] = m.end
      if (disposed) return
    }
    animating = false
    board.setTokens(tokenViews())
    refreshPanel()
    announceTurn()
    maybeFinish()
  }

  // ---- win overlay ---------------------------------------------------------

  function maybeFinish() {
    const snap = session.snap()
    if (snap.phase !== 'over' || animating || queue.length || overlay) return
    const winner = snap.winner
    const w = winner !== null ? snap.seats[winner] : null

    const rows = snap.seats
      .map((s, i) => ({ s, i, pos: snap.pos[i] }))
      .filter((r) => r.s)
      .sort((a, b) => (a.i === winner ? -1 : b.i === winner ? 1 : b.pos - a.pos))
    const medals = ['🏆', '🥈', '🥉', '🎖️']
    const standings = h(
      'div',
      { class: 'standings' },
      ...rows.map((r, rank) =>
        h(
          'div',
          { class: 'stand-row', style: `--sc:${SEAT_COLORS[r.i]}` },
          h('span', {}, `${medals[rank]} ${r.s!.avatar} ${r.s!.name}`),
          h('span', { class: 'stand-pos' }, r.i === winner ? '100 🎉' : `${r.pos}`),
        ),
      ),
    )

    const buttons = h('div', { class: 'overlay-buttons' })
    if (session.mode !== 'guest') {
      buttons.append(
        h(
          'button',
          { class: 'btn btn-big btn-green', onClick: () => (sound.tap(), session.playAgain()) },
          '🔁 Play again!',
        ),
      )
    } else {
      buttons.append(h('p', { class: 'lobby-note' }, 'Ask the host to play again! 🍿'))
    }
    buttons.append(
      h(
        'button',
        {
          class: 'btn btn-purple',
          onClick: () => {
            sound.tap()
            session.destroy()
            nav.home()
          },
        },
        '🏠 Home',
      ),
    )

    const canvas = h('canvas', { class: 'overlay-confetti' }) as HTMLCanvasElement
    overlay = h(
      'div',
      { class: 'overlay' },
      canvas,
      h(
        'div',
        { class: 'overlay-card' },
        h('div', { class: 'win-avatar' }, w?.avatar ?? '🏆'),
        h('div', { class: 'win-title' }, `${w?.name ?? 'Somebody'} WINS!`),
        standings,
        buttons,
      ),
    )
    document.body.append(overlay)
    overlayConfetti = makeConfetti(canvas)
    overlayConfetti.rain(6000)
  }

  function closeOverlay() {
    overlayConfetti?.stop()
    overlayConfetti = null
    overlay?.remove()
    overlay = null
  }

  function showMessageOverlay(text: string) {
    closeOverlay()
    overlay = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'overlay-card' },
        h('div', { class: 'win-avatar' }, '😢'),
        h('div', { class: 'win-title small' }, text),
        h(
          'button',
          {
            class: 'btn btn-big btn-purple',
            onClick: () => {
              sound.tap()
              session.destroy()
              nav.home()
            },
          },
          '🏠 Home',
        ),
      ),
    )
    document.body.append(overlay)
  }

  // ---- session wiring --------------------------------------------------------

  const onSnapChange = () => {
    const snap = session.snap()
    const lm = snap.lastMove
    if (lm && lm.id > lastMoveSeen) {
      lastMoveSeen = lm.id
      queue.push(lm)
      void pump()
    }
    if (snap.phase === 'playing' && overlay) {
      // host pressed play-again
      closeOverlay()
      lastTurnToast = -1
      eventLine.textContent = 'New game! Good luck! 🍀'
    }
    if (!animating) {
      shownPos = [...snap.pos]
      board.setTokens(tokenViews())
      refreshPanel()
      announceTurn()
    } else {
      refreshPanel()
    }
    maybeFinish()
  }
  const unsubChange = session.onChange(onSnapChange)
  const unsubFx = session.onFx((fx) => board.fx.floatEmoji(fx.e, SEAT_COLORS[fx.seat]))
  const unsubErr = session.onError((err) => {
    if (err === 'host-left') showMessageOverlay('The host left the game')
  })

  dice.onTap(() => {
    if (!canTap()) return
    sound.tap()
    session.roll()
  })

  // time-based roll locks expire without a snapshot, so poll lightly
  const ticker = setInterval(() => {
    if (!animating) refreshPanel()
  }, 500)

  // ---- layout ----------------------------------------------------------------

  const leaveBtn = h('button', { class: 'chip-btn leave-btn' }, '🚪 Leave') as HTMLButtonElement
  let confirmLeave = 0
  leaveBtn.addEventListener('click', () => {
    sound.tap()
    if (Date.now() < confirmLeave) {
      session.destroy()
      closeOverlay()
      nav.home()
      return
    }
    confirmLeave = Date.now() + 2600
    leaveBtn.textContent = '❓ Really leave?'
    setTimeout(() => {
      if (Date.now() >= confirmLeave) leaveBtn.textContent = '🚪 Leave'
    }, 2700)
  })

  const topbar = h(
    'div',
    { class: 'game-topbar' },
    leaveBtn,
    session.mode !== 'local' ? h('span', { class: 'room-chip' }, `Room ${session.code}`) : h('span'),
  )

  const dicePanel = h('div', { class: 'dice-zone' }, dice.el, label, eventLine)

  const side = h('div', { class: 'side-panel' }, cardsEl, dicePanel)
  if (session.mode !== 'local') {
    const bar = h('div', { class: 'emoji-bar' })
    for (const e of EMOJIS) {
      bar.append(
        h(
          'button',
          {
            class: 'emoji-btn',
            onClick: () => {
              if (Date.now() - lastEmojiSent < 600) return
              lastEmojiSent = Date.now()
              session.sendEmoji(e)
            },
          },
          e,
        ),
      )
    }
    side.append(bar)
  }

  const el = h(
    'div',
    { class: 'screen screen-game' },
    topbar,
    h('div', { class: 'game-wrap' }, board.root, side),
  )

  // initial paint
  board.setTokens(tokenViews())
  refreshPanel()
  announceTurn()

  return {
    el,
    dispose() {
      disposed = true
      clearInterval(ticker)
      unsubChange()
      unsubFx()
      unsubErr()
      closeOverlay()
      board.destroy()
    },
  }
}
