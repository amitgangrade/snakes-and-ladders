import { describe, expect, it } from 'vitest'
import {
  computeMove,
  cellOf,
  nextSeat,
  LADDERS,
  SNAKES,
  DEFAULT_RULES,
} from '../src/engine/engine'

const R = DEFAULT_RULES // bounce: true
const NO_BOUNCE = { bounce: false }

describe('board geometry', () => {
  it('is a serpentine: 1 bottom-left, 10 bottom-right, 11 above 10, 100 top-left', () => {
    expect(cellOf(1)).toMatchObject({ col: 0, row: 0 })
    expect(cellOf(10)).toMatchObject({ col: 9, row: 0 })
    expect(cellOf(11)).toMatchObject({ col: 9, row: 1 })
    expect(cellOf(20)).toMatchObject({ col: 0, row: 1 })
    expect(cellOf(100)).toMatchObject({ col: 0, row: 9 })
  })

  it('no square is both snake head and ladder base, no chains', () => {
    for (const k of Object.keys(LADDERS)) expect(SNAKES[+k]).toBeUndefined()
    for (const v of Object.values(LADDERS)) {
      expect(SNAKES[v]).toBeUndefined()
      expect(LADDERS[v]).toBeUndefined()
    }
    for (const v of Object.values(SNAKES)) {
      expect(SNAKES[v]).toBeUndefined()
      expect(LADDERS[v]).toBeUndefined()
    }
  })
})

describe('computeMove', () => {
  it('walks square by square', () => {
    const m = computeMove(5, 3, R)
    expect(m.steps).toEqual([6, 7, 8])
    expect(m.end).toBe(8)
    expect(m.win).toBe(false)
    expect(m.extra).toBe(false)
  })

  it('starts from off-board position 0', () => {
    const m = computeMove(0, 3, R)
    expect(m.steps).toEqual([1, 2, 3])
    expect(m.end).toBe(3)
  })

  it('climbs a ladder on exact landing (1 -> 38)', () => {
    const m = computeMove(0, 1, R)
    expect(m.portals).toEqual([{ kind: 'ladder', from: 1, to: 38 }])
    expect(m.end).toBe(38)
  })

  it('slides down a snake (16 -> 6)', () => {
    const m = computeMove(12, 4, R)
    expect(m.portals).toEqual([{ kind: 'snake', from: 16, to: 6 }])
    expect(m.end).toBe(6)
  })

  it('does not trigger portals for squares passed through', () => {
    const m = computeMove(14, 3, R) // passes 16 (snake head), lands 17
    expect(m.portals).toEqual([])
    expect(m.end).toBe(17)
  })

  it('wins on exact 100', () => {
    const m = computeMove(97, 3, R)
    expect(m.steps).toEqual([98, 99, 100])
    expect(m.win).toBe(true)
    expect(m.extra).toBe(false)
  })

  it('wins via the 80 -> 100 ladder', () => {
    const m = computeMove(78, 2, R)
    expect(m.portals).toEqual([{ kind: 'ladder', from: 80, to: 100 }])
    expect(m.win).toBe(true)
  })

  it('bounces back when overshooting 100', () => {
    const m = computeMove(99, 4, R) // 100, 99, 98, 97
    expect(m.steps).toEqual([100, 99, 98, 97])
    expect(m.bounced).toBe(true)
    expect(m.end).toBe(97)
    expect(m.win).toBe(false)
  })

  it('a bounce can land on a snake (99 + 3 -> 98 -> 78)', () => {
    const m = computeMove(99, 3, R)
    expect(m.steps).toEqual([100, 99, 98])
    expect(m.portals).toEqual([{ kind: 'snake', from: 98, to: 78 }])
    expect(m.end).toBe(78)
  })

  it('stays put on overshoot when bounce rule is off', () => {
    const m = computeMove(99, 4, NO_BOUNCE)
    expect(m.steps).toEqual([])
    expect(m.end).toBe(99)
    expect(m.portals).toEqual([])
  })

  it('rolling a 6 grants an extra turn', () => {
    expect(computeMove(10, 6, R).extra).toBe(true)
  })

  it('no extra turn when the 6 wins the game', () => {
    const m = computeMove(94, 6, R)
    expect(m.win).toBe(true)
    expect(m.extra).toBe(false)
  })

  it('overshoot with a 6 still grants the extra turn (no-bounce rule)', () => {
    const m = computeMove(99, 6, NO_BOUNCE)
    expect(m.end).toBe(99)
    expect(m.extra).toBe(true)
  })
})

describe('nextSeat', () => {
  const seats = [{}, null, {}, {}] // seats 0, 2, 3 occupied
  it('skips empty seats', () => {
    expect(nextSeat(seats, 0)).toBe(2)
    expect(nextSeat(seats, 2)).toBe(3)
    expect(nextSeat(seats, 3)).toBe(0)
  })
  it('returns current seat when alone', () => {
    expect(nextSeat([{}, null, null, null], 0)).toBe(0)
  })
})
