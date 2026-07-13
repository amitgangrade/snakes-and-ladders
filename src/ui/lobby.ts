// Lobby: local seat setup (humans + bots) or online room with a shareable code.

import qrcode from 'qrcode-generator'
import { AVATARS, SEAT_COLORS, randomAvatar } from '../engine/names'
import type { Nav, Screen } from '../main'
import type { Session, SessionError } from '../net/session'
import { clear, h } from './dom'
import { sound } from './sound'

const ERROR_TEXT: Record<SessionError, string> = {
  'not-found': "Hmm, we can't find that room 🤔 Check the code and try again!",
  full: 'That room is already full 😅 Ask them to make space, or start your own!',
  started: 'That game has already started 🏁 Ask for a new room!',
  'host-left': 'The room closed because the host left 😢',
  disconnected: 'Lost the connection 😢 Try joining again!',
}

export function lobbyScreen(nav: Nav, session: Session): Screen {
  const online = session.mode !== 'local'
  const isBoss = session.mode !== 'guest' // local device or room host
  let started = false

  const seatGrid = h('div', { class: 'seat-grid' })
  const startBtn = h('button', { class: 'btn btn-big btn-green start-btn' }, '🚦 Start the game!') as HTMLButtonElement
  const ruleBtn = h('button', { class: 'chip-btn' }) as HTMLButtonElement
  const note = h('p', { class: 'lobby-note' })

  startBtn.addEventListener('click', () => {
    sound.tap()
    session.start()
  })
  ruleBtn.addEventListener('click', () => {
    if (!isBoss) return
    sound.tap()
    session.setRules({ bounce: !session.snap().rules.bounce })
  })

  function shareLink(): string {
    const params = new URLSearchParams(location.search)
    params.set('room', session.code)
    return `${location.origin}${location.pathname}?${params.toString()}`
  }

  function renderSeats() {
    const snap = session.snap()
    clear(seatGrid)
    const mySeat = session.mySeat()

    snap.seats.forEach((seat, i) => {
      const card = h('div', { class: 'seat-card', style: `--sc:${SEAT_COLORS[i]}` })
      if (seat) {
        const chips = h('div', { class: 'seat-chips' })
        if (online && i === 0) chips.append(h('span', { class: 'chip' }, '👑 host'))
        if (seat.kind === 'bot') chips.append(h('span', { class: 'chip' }, '🤖 bot'))
        if (online && i === mySeat) chips.append(h('span', { class: 'chip' }, 'YOU'))
        if (online && seat.kind === 'human' && !seat.connected)
          chips.append(h('span', { class: 'chip chip-off' }, '💤'))

        const avatar = h(
          'button',
          {
            class: 'seat-avatar',
            'aria-label': 'Change hero',
            onClick: () => {
              if (!isBoss || online) return
              sound.tap()
              const next = AVATARS[(AVATARS.indexOf(seat.avatar as never) + 1) % AVATARS.length]
              session.setSeat(i, { ...seat, avatar: next })
            },
          },
          seat.avatar,
        )

        card.append(chips, avatar)

        if (!online && seat.kind === 'human') {
          const input = h('input', {
            class: 'seat-name-input',
            maxlength: '14',
            value: seat.name,
            'aria-label': `Player ${i + 1} name`,
          }) as HTMLInputElement
          input.addEventListener('change', () =>
            session.setSeat(i, { ...seat, name: input.value.trim() || seat.name }),
          )
          card.append(input)
        } else {
          card.append(h('div', { class: 'seat-name' }, seat.name))
        }

        if (isBoss && i !== 0 && (!online || seat.kind === 'bot')) {
          card.append(
            h(
              'button',
              {
                class: 'chip-btn danger',
                onClick: () => {
                  sound.tap()
                  session.setSeat(i, null)
                },
              },
              '✖ remove',
            ),
          )
        }
      } else {
        card.classList.add('seat-empty')
        if (!online && isBoss) {
          card.append(
            h(
              'button',
              {
                class: 'chip-btn',
                onClick: () => {
                  sound.tap()
                  session.setSeat(i, {
                    name: `Player ${i + 1}`,
                    avatar: randomAvatar(),
                    kind: 'human',
                    peerId: null,
                    connected: true,
                  })
                },
              },
              '🧒 Add kid',
            ),
            h('button', { class: 'chip-btn', onClick: () => (sound.tap(), session.addBot(i)) }, '🤖 Add bot'),
          )
        } else if (online && isBoss) {
          card.append(
            h('div', { class: 'seat-waiting' }, 'Waiting for a friend'),
            h('div', { class: 'pulse-dots' }, h('i'), h('i'), h('i')),
            h('button', { class: 'chip-btn', onClick: () => (sound.tap(), session.addBot(i)) }, '🤖 Add bot'),
          )
        } else {
          card.append(
            h('div', { class: 'seat-waiting' }, 'Waiting'),
            h('div', { class: 'pulse-dots' }, h('i'), h('i'), h('i')),
          )
        }
      }
      seatGrid.append(card)
    })

    const seated = snap.seats.filter(Boolean).length
    startBtn.disabled = seated < 2
    startBtn.textContent = seated < 2 ? '👋 Need at least 2 players' : '🚦 Start the game!'
    ruleBtn.textContent = `↩️ Bounce at 100: ${snap.rules.bounce ? 'ON' : 'OFF'}`
    ruleBtn.classList.toggle('readonly', !isBoss)
    note.textContent = online
      ? isBoss
        ? 'Friends can join with the code or the link 👆'
        : 'Waiting for the host to start… 🍿'
      : 'Add kids to pass-and-play, or bots to race against!'
  }

  // ---- header (online only): code tiles + share buttons + QR
  let head: HTMLElement | null = null
  if (online) {
    const tiles = h('div', { class: 'code-tiles' })
    ;[...session.code].forEach((ch, i) =>
      tiles.append(h('span', { class: 'code-tile', style: `--i:${i}` }, ch)),
    )
    const copyBtn = h('button', { class: 'chip-btn' }, '📋 Copy invite link') as HTMLButtonElement
    copyBtn.addEventListener('click', async () => {
      sound.tap()
      try {
        await navigator.clipboard.writeText(shareLink())
        copyBtn.textContent = '✅ Copied!'
      } catch {
        window.prompt('Copy this link:', shareLink())
      }
      setTimeout(() => (copyBtn.textContent = '📋 Copy invite link'), 1800)
    })
    const actions = h('div', { class: 'lobby-actions' }, copyBtn)
    if (navigator.share) {
      const shareBtn = h('button', { class: 'chip-btn' }, '📤 Share')
      shareBtn.addEventListener('click', () => {
        void navigator.share({ title: 'Snakes & Ladders 🐍🪜', text: `Join my game! Room ${session.code}`, url: shareLink() }).catch(() => {})
      })
      actions.append(shareBtn)
    }

    const qr = qrcode(0, 'L')
    qr.addData(shareLink())
    qr.make()
    const qrCard = h('div', { class: 'qr-card', html: qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) })

    head = h(
      'div',
      { class: 'lobby-head' },
      h('div', { class: 'room-code-label' }, 'Room code'),
      tiles,
      actions,
      qrCard,
    )
  }

  const spinner = h(
    'div',
    { class: 'lobby-connecting' },
    h('div', { class: 'spinner' }),
    h('p', {}, `Looking for room ${session.code}…`),
  )

  const body = h('div', { class: 'lobby-body' }, seatGrid, h('div', { class: 'rule-row' }, ruleBtn), isBoss ? startBtn : note)
  if (isBoss) body.append(note)

  const backBtn = h(
    'button',
    {
      class: 'chip-btn back-btn',
      onClick: () => {
        sound.tap()
        session.destroy()
        nav.home()
      },
    },
    '‹ Back',
  )

  const el = h(
    'div',
    { class: 'screen screen-lobby' },
    backBtn,
    h('h2', { class: 'screen-title' }, online ? '🌐 Online room' : '🎮 Who is playing?'),
    head,
    session.mode === 'guest' && session.snap().seq === 0 ? spinner : null,
    body,
  )

  function sync() {
    const snap = session.snap()
    if (snap.seq > 0) spinner.remove()
    if (snap.phase !== 'lobby') {
      if (!started) {
        started = true
        nav.game(session)
      }
      return
    }
    renderSeats()
  }

  const unsubChange = session.onChange(sync)
  const unsubErr = session.onError((err) => {
    session.destroy()
    window.alert(ERROR_TEXT[err])
    nav.home()
  })

  renderSeats()

  return {
    el,
    dispose() {
      unsubChange()
      unsubErr()
    },
  }
}
