// Pure Snakes & Ladders rules — no DOM, no network, fully testable.

export const FINAL = 100
export const SEAT_COUNT = 4

/** base square -> top square */
export const LADDERS: Record<number, number> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
}

/** head square -> tail square */
export const SNAKES: Record<number, number> = {
  16: 6,
  47: 26,
  49: 11,
  56: 37,
  62: 19,
  64: 43,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
}

export type PortalKind = 'ladder' | 'snake'
export interface Portal {
  kind: PortalKind
  from: number
  to: number
}

export interface MoveScript {
  roll: number
  /** squares visited one by one (empty = blocked, no exact roll) */
  steps: number[]
  /** true when the move overshot 100 and walked back */
  bounced: boolean
  portals: Portal[]
  start: number
  end: number
  win: boolean
  /** rolled a 6 and did not win -> roll again */
  extra: boolean
}

export interface Rules {
  /** overshooting 100 bounces back; when false you simply stay put */
  bounce: boolean
}

export const DEFAULT_RULES: Rules = { bounce: true }

/**
 * Board coordinates: square 1 is bottom-left, rows snake left/right
 * (boustrophedon), square 100 is top-left. Returns 0-based column/row
 * (row 0 = bottom) plus the center point in a 0..1000 viewBox.
 */
export function cellOf(n: number): { col: number; row: number; x: number; y: number } {
  const row = Math.floor((n - 1) / 10)
  let col = (n - 1) % 10
  if (row % 2 === 1) col = 9 - col
  return { col, row, x: col * 100 + 50, y: (9 - row) * 100 + 50 }
}

export function computeMove(pos: number, roll: number, rules: Rules): MoveScript {
  const steps: number[] = []
  let bounced = false
  const target = pos + roll

  if (target > FINAL) {
    if (!rules.bounce) {
      // no exact roll — stay put (still get the extra turn on a 6)
      return { roll, steps, bounced, portals: [], start: pos, end: pos, win: false, extra: roll === 6 }
    }
    for (let s = pos + 1; s <= FINAL; s++) steps.push(s)
    const back = 2 * FINAL - target // e.g. 99 + 4 -> 97
    for (let s = FINAL - 1; s >= back; s--) steps.push(s)
    bounced = true
  } else {
    for (let s = pos + 1; s <= target; s++) steps.push(s)
  }

  let end = steps.length ? steps[steps.length - 1] : pos
  const portals: Portal[] = []
  if (steps.length) {
    // follow chains defensively (the shipped board has none)
    for (let guard = 0; guard < 8; guard++) {
      const ladder = LADDERS[end]
      const snake = SNAKES[end]
      if (ladder !== undefined) {
        portals.push({ kind: 'ladder', from: end, to: ladder })
        end = ladder
      } else if (snake !== undefined) {
        portals.push({ kind: 'snake', from: end, to: snake })
        end = snake
      } else break
    }
  }

  const win = end === FINAL
  return { roll, steps, bounced, portals, start: pos, end, win, extra: roll === 6 && !win }
}

/** next occupied seat after `cur` (seats array may have null gaps) */
export function nextSeat(seats: readonly (unknown | null)[], cur: number): number {
  for (let i = 1; i <= SEAT_COUNT; i++) {
    const s = (cur + i) % SEAT_COUNT
    if (seats[s] != null) return s
  }
  return cur
}

export function rollDie(): number {
  // test hook: lets e2e scripts force the next roll (never set in normal play)
  const g = globalThis as { __snlNextRoll?: number }
  if (typeof g.__snlNextRoll === 'number') {
    const v = g.__snlNextRoll
    delete g.__snlNextRoll
    return Math.min(6, Math.max(1, Math.floor(v)))
  }
  return 1 + Math.floor(Math.random() * 6)
}
