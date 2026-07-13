// Game sessions. One authoritative state (Snap) lives on the host (or on the
// only device in local mode); guests send intents and receive snapshots.

import {
  computeMove,
  nextSeat,
  rollDie,
  DEFAULT_RULES,
  SEAT_COUNT,
  type MoveScript,
  type Rules,
} from '../engine/engine'
import { makeRoomCode, randomAvatar, randomBotName } from '../engine/names'
import type { Transport } from './transport'
import { makeBcTransport } from './bc'
import { makeTrysteroTransport } from './trystero'

export interface Profile {
  name: string
  avatar: string
}

export interface SeatInfo {
  name: string
  avatar: string
  kind: 'human' | 'bot'
  /** transport peer id for remote humans, null for bots & local humans */
  peerId: string | null
  connected: boolean
}

export type Phase = 'lobby' | 'playing' | 'over'

export interface LastMove extends MoveScript {
  id: number
  seat: number
}

export interface Snap {
  seq: number
  phase: Phase
  rules: Rules
  seats: (SeatInfo | null)[]
  turn: number
  starter: number
  pos: number[]
  winner: number | null
  lastMove: LastMove | null
}

export type SessionMode = 'local' | 'host' | 'guest'
export type SessionError = 'not-found' | 'full' | 'started' | 'host-left' | 'disconnected'

export interface FxEvent {
  type: 'emoji'
  seat: number
  e: string
}

export interface Session {
  mode: SessionMode
  code: string
  snap(): Snap
  /** seat index owned by this device (guest/host). null in local mode. */
  mySeat(): number | null
  /** may this device roll right now? */
  canRoll(): boolean
  roll(): void
  sendEmoji(e: string): void
  onChange(cb: () => void): () => void
  onFx(cb: (fx: FxEvent) => void): () => void
  onError(cb: (err: SessionError) => void): () => void
  /** host / local only — no-ops for guests */
  start(): void
  playAgain(): void
  setRules(rules: Rules): void
  setSeat(i: number, info: SeatInfo | null): void
  addBot(i: number): void
  botTakeover(i: number): void
  destroy(): void
}

/** how long the presentation of a move roughly takes (dice + hops + slides) */
export function estimateMs(m: MoveScript): number {
  return 2800 + m.steps.length * 240 + m.portals.length * 1700 + (m.win ? 600 : 0)
}

function makeTransport(): Transport {
  const useBc = new URLSearchParams(location.search).get('net') === 'bc'
  return useBc ? makeBcTransport() : makeTrysteroTransport()
}

function emptySnap(): Snap {
  return {
    seq: 0,
    phase: 'lobby',
    rules: { ...DEFAULT_RULES },
    seats: [null, null, null, null],
    turn: 0,
    starter: 0,
    pos: [0, 0, 0, 0],
    winner: null,
    lastMove: null,
  }
}

class Emitter<T> {
  private cbs: ((v: T) => void)[] = []
  on(cb: (v: T) => void): () => void {
    this.cbs.push(cb)
    return () => {
      this.cbs = this.cbs.filter((c) => c !== cb)
    }
  }
  emit(v: T) {
    for (const cb of [...this.cbs]) cb(v)
  }
}

// ---------------------------------------------------------------------------
// Authority (used by local + host sessions)
// ---------------------------------------------------------------------------

function createAuthority(mode: 'local' | 'host', code: string, transport: Transport | null): Session {
  const snap = emptySnap()
  const changed = new Emitter<void>()
  const fx = new Emitter<FxEvent>()
  const errors = new Emitter<SessionError>()
  let moveId = 0
  let unlockAt = 0
  let botTimer: ReturnType<typeof setTimeout> | null = null
  let pendingRoll: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  function bump() {
    snap.seq++
    transport?.send('snap', snap)
    changed.emit()
  }

  function seatOfPeer(peer: string): number {
    return snap.seats.findIndex((s) => s?.peerId === peer)
  }

  function seatedCount(): number {
    return snap.seats.filter(Boolean).length
  }

  function doRoll(seat: number) {
    if (destroyed) return
    if (snap.phase !== 'playing' || snap.winner !== null) return
    if (seat !== snap.turn || !snap.seats[seat]) return
    const early = unlockAt - Date.now()
    if (early > 0) {
      // a guest's animations can finish a beat before our time lock expires —
      // hold the roll instead of dropping it (re-validated when it fires)
      if (!pendingRoll) {
        pendingRoll = setTimeout(() => {
          pendingRoll = null
          doRoll(seat)
        }, early + 40)
      }
      return
    }

    const script = computeMove(snap.pos[seat], rollDie(), snap.rules)
    snap.pos[seat] = script.end
    snap.lastMove = { ...script, id: ++moveId, seat }
    if (script.win) {
      snap.phase = 'over'
      snap.winner = seat
    } else if (!script.extra) {
      snap.turn = nextSeat(snap.seats, seat)
    }
    unlockAt = Date.now() + estimateMs(script)
    bump()
    scheduleBot()
  }

  function scheduleBot() {
    if (botTimer) clearTimeout(botTimer)
    botTimer = null
    if (snap.phase !== 'playing') return
    const seat = snap.seats[snap.turn]
    if (!seat) return
    const wait = Math.max(0, unlockAt - Date.now())
    if (seat.kind === 'bot' || (seat.kind === 'human' && !seat.connected && mode === 'host')) {
      // bots roll by themselves; disconnected humans hold the game until the
      // host swaps them for a bot (botTakeover) — so only schedule for bots
      if (seat.kind !== 'bot') return
      botTimer = setTimeout(() => doRoll(snap.turn), wait + 900 + Math.random() * 900)
    }
  }

  // -- transport wiring (host mode only)
  if (transport) {
    transport.onMessage((kind, data, from) => {
      if (destroyed) return
      if (kind === 'hello') {
        const d = data as Profile
        const name = String(d?.name ?? 'Player').slice(0, 16) || 'Player'
        const avatar = String(d?.avatar ?? '🦊').slice(0, 4)
        // hello retries until the first snapshot arrives — never seat a peer twice
        if (seatOfPeer(from) >= 0) {
          transport.send('snap', snap, from)
          return
        }
        // reclaim: same name rejoining after a disconnect (any phase)
        const back = snap.seats.findIndex(
          (s) => s && s.kind === 'human' && !s.connected && s.name === name,
        )
        if (back >= 0) {
          snap.seats[back] = { ...snap.seats[back]!, peerId: from, connected: true }
          bump()
          return
        }
        if (snap.phase !== 'lobby') {
          transport.send('deny', { reason: 'started' }, from)
          return
        }
        const free = snap.seats.findIndex((s) => s === null)
        if (free < 0) {
          transport.send('deny', { reason: 'full' }, from)
          return
        }
        snap.seats[free] = { name, avatar, kind: 'human', peerId: from, connected: true }
        bump()
      } else if (kind === 'intent') {
        const d = data as { type?: string }
        const seat = seatOfPeer(from)
        if (seat < 0) return
        if (d?.type === 'roll') doRoll(seat)
      } else if (kind === 'fx') {
        const d = data as FxEvent
        if (d?.type === 'emoji') fx.emit(d)
      } else if (kind === 'bye') {
        const seat = seatOfPeer(from)
        if (seat < 0) return
        if (snap.phase === 'lobby') snap.seats[seat] = null
        else snap.seats[seat] = { ...snap.seats[seat]!, connected: false }
        bump()
      }
    })
    transport.onPeerLeave((peer) => {
      if (destroyed) return
      const seat = seatOfPeer(peer)
      if (seat < 0) return
      if (snap.phase === 'lobby') snap.seats[seat] = null
      else snap.seats[seat] = { ...snap.seats[seat]!, connected: false }
      bump()
    })
    // late joiners ask with hello; also re-send state when someone connects so
    // a rejoining guest that already had a seat sees the world immediately
    transport.onPeerJoin(() => {
      if (!destroyed && snap.seq > 0) transport.send('snap', snap)
    })
  }

  const session: Session = {
    mode,
    code,
    snap: () => snap,
    mySeat() {
      if (mode === 'local') return null
      return seatOfPeer(transport!.selfId) >= 0 ? seatOfPeer(transport!.selfId) : 0
    },
    canRoll() {
      if (snap.phase !== 'playing' || snap.winner !== null) return false
      const seat = snap.seats[snap.turn]
      if (!seat) return false
      if (Date.now() < unlockAt) return false
      if (mode === 'local') return seat.kind === 'human'
      return seat.peerId === transport!.selfId
    },
    roll() {
      if (!session.canRoll()) return
      doRoll(snap.turn)
    },
    sendEmoji(e: string) {
      const seat = mode === 'local' ? snap.turn : session.mySeat() ?? 0
      const ev: FxEvent = { type: 'emoji', seat, e }
      transport?.send('fx', ev)
      fx.emit(ev)
    },
    onChange: (cb) => changed.on(() => cb()),
    onFx: (cb) => fx.on(cb),
    onError: (cb) => errors.on(cb),
    start() {
      if (snap.phase !== 'lobby' || seatedCount() < 2) return
      snap.phase = 'playing'
      snap.starter = snap.seats[0] ? 0 : nextSeat(snap.seats, 0)
      snap.turn = snap.starter
      unlockAt = 0
      bump()
      scheduleBot()
    },
    playAgain() {
      if (snap.phase !== 'over') return
      snap.pos = [0, 0, 0, 0]
      snap.winner = null
      snap.lastMove = null
      snap.phase = 'playing'
      snap.starter = nextSeat(snap.seats, snap.starter)
      snap.turn = snap.starter
      unlockAt = 0
      bump()
      scheduleBot()
    },
    setRules(rules: Rules) {
      if (snap.phase !== 'lobby') return
      snap.rules = { ...rules }
      bump()
    },
    setSeat(i: number, info: SeatInfo | null) {
      if (i < 0 || i >= SEAT_COUNT) return
      snap.seats[i] = info
      bump()
    },
    addBot(i: number) {
      if (snap.seats[i]) return
      const taken = snap.seats.filter(Boolean).map((s) => s!.name)
      snap.seats[i] = {
        name: randomBotName(taken),
        avatar: randomAvatar(),
        kind: 'bot',
        peerId: null,
        connected: true,
      }
      bump()
      scheduleBot()
    },
    botTakeover(i: number) {
      const s = snap.seats[i]
      if (!s || s.kind !== 'human' || s.connected) return
      snap.seats[i] = { ...s, name: s.name, kind: 'bot', peerId: null, connected: true }
      bump()
      scheduleBot()
    },
    destroy() {
      destroyed = true
      if (botTimer) clearTimeout(botTimer)
      if (pendingRoll) clearTimeout(pendingRoll)
      transport?.send('bye', {})
      transport?.leave()
    },
  }
  return session
}

// ---------------------------------------------------------------------------
// Guest
// ---------------------------------------------------------------------------

function createGuest(code: string, profile: Profile): Session {
  const transport = makeTransport()
  let snap = emptySnap()
  const changed = new Emitter<void>()
  const fx = new Emitter<FxEvent>()
  const errors = new Emitter<SessionError>()
  let hostPeer: string | null = null
  let helloTimer: ReturnType<typeof setInterval> | null = null
  let notFoundTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  function stopHello() {
    if (helloTimer) clearInterval(helloTimer)
    helloTimer = null
    if (notFoundTimer) clearTimeout(notFoundTimer)
    notFoundTimer = null
  }

  transport.onMessage((kind, data, from) => {
    if (destroyed) return
    if (kind === 'snap') {
      const s = data as Snap
      if (hostPeer === null) hostPeer = from
      if (from !== hostPeer) return
      if (s.seq <= snap.seq) return
      // only adopt the world once we actually have a seat in it — otherwise
      // keep saying hello until the host seats us or denies us
      if (!s.seats.some((x) => x?.peerId === transport.selfId)) return
      stopHello()
      snap = s
      changed.emit()
    } else if (kind === 'deny') {
      const d = data as { reason?: string }
      stopHello()
      errors.emit(d?.reason === 'started' ? 'started' : 'full')
    } else if (kind === 'fx') {
      const d = data as FxEvent
      if (d?.type === 'emoji') fx.emit(d)
    }
  })
  transport.onPeerLeave((peer) => {
    if (!destroyed && peer === hostPeer) errors.emit('host-left')
  })
  transport.onPeerJoin(() => {
    // a peer appeared (possibly the host) — say hello right away
    if (!destroyed && snap.seq === 0) transport.send('hello', profile)
  })

  void transport.join(code).then(() => {
    if (destroyed) return
    transport.send('hello', profile)
    helloTimer = setInterval(() => transport.send('hello', profile), 1500)
    notFoundTimer = setTimeout(() => {
      if (snap.seq === 0) {
        stopHello()
        errors.emit('not-found')
      }
    }, 12000)
  })

  function mySeat(): number | null {
    const i = snap.seats.findIndex((s) => s?.peerId === transport.selfId)
    return i >= 0 ? i : null
  }

  return {
    mode: 'guest',
    code,
    snap: () => snap,
    mySeat,
    canRoll() {
      if (snap.phase !== 'playing' || snap.winner !== null) return false
      return snap.turn === mySeat()
    },
    roll() {
      transport.send('intent', { type: 'roll' }, hostPeer ?? undefined)
    },
    sendEmoji(e: string) {
      const seat = mySeat()
      if (seat === null) return
      const ev: FxEvent = { type: 'emoji', seat, e }
      transport.send('fx', ev)
      fx.emit(ev)
    },
    onChange: (cb) => changed.on(() => cb()),
    onFx: (cb) => fx.on(cb),
    onError: (cb) => errors.on(cb),
    start() {},
    playAgain() {},
    setRules() {},
    setSeat() {},
    addBot() {},
    botTakeover() {},
    destroy() {
      destroyed = true
      stopHello()
      transport.send('bye', {})
      transport.leave()
    },
  }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function createLocalSession(profile: Profile): Session {
  const s = createAuthority('local', '', null)
  s.setSeat(0, { name: profile.name, avatar: profile.avatar, kind: 'human', peerId: null, connected: true })
  s.addBot(1)
  return s
}

export function createHostSession(profile: Profile): Session {
  const code = makeRoomCode()
  const transport = makeTransport()
  const s = createAuthority('host', code, transport)
  s.setSeat(0, {
    name: profile.name,
    avatar: profile.avatar,
    kind: 'human',
    peerId: transport.selfId,
    connected: true,
  })
  void transport.join(code)
  return s
}

export function createGuestSession(code: string, profile: Profile): Session {
  return createGuest(code.toUpperCase(), profile)
}
