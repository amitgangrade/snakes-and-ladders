// The rainbow board: 100 cells, SVG snakes & ladders, and animated tokens.
// All coordinates come from the engine's cellOf() so gameplay and graphics
// can never disagree.

import { cellOf, LADDERS, SNAKES, type MoveScript, type Portal } from '../engine/engine'
import { SEAT_COLORS } from '../engine/names'
import { h, rm, svgEl, vibrate, wait } from './dom'
import { sound } from './sound'
import { makeConfetti, makeFxLayer, shakeEl, type Confetti, type FxLayer } from './fx'

interface Pt {
  x: number
  y: number
}

const SNAKE_SKINS: [string, string][] = [
  ['#8ce56f', '#2b9e47'],
  ['#c9a1ff', '#7b3ff2'],
  ['#ffb45e', '#ef6c15'],
  ['#5fe3d2', '#12968a'],
  ['#ff9ad5', '#e0408f'],
]

function bez(a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt {
  const u = 1 - t
  const w0 = u * u * u
  const w1 = 3 * u * u * t
  const w2 = 3 * u * t * t
  const w3 = t * t * t
  return {
    x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const easeIn = (t: number) => t * t

interface Token {
  seat: number
  avatar: string
  pos: number
  el: HTMLElement
  face: HTMLElement
}

export interface TokenView {
  seat: number
  avatar: string
  pos: number
}

export interface BoardApi {
  root: HTMLElement
  fx: FxLayer
  confetti: Confetti
  setTokens(list: TokenView[]): void
  setActiveSeat(seat: number | null): void
  animateScript(seat: number, script: MoveScript): Promise<void>
  burstAtCell(n: number): void
  shake(): void
  destroy(): void
}

export function createBoard(): BoardApi {
  const grid = h('div', { class: 'board-grid' })
  const svg = svgEl('svg', { class: 'board-svg', viewBox: '0 0 1000 1000' }) as SVGSVGElement
  const tokenLayer = h('div', { class: 'board-tokens' })
  const confettiCanvas = h('canvas', { class: 'board-confetti' }) as HTMLCanvasElement
  const fxLayer = h('div', { class: 'board-fx' })
  const inner = h('div', { class: 'board-inner' }, grid, svg, tokenLayer, confettiCanvas, fxLayer)
  const root = h('div', { class: 'board-frame' }, inner)

  const fx = makeFxLayer(fxLayer)
  const confetti = makeConfetti(confettiCanvas)
  const snakeSamples = new Map<number, Pt[]>()
  const tokens = new Map<number, Token>()

  // ---- cells ---------------------------------------------------------------
  for (let n = 1; n <= 100; n++) {
    const { col, row } = cellOf(n)
    const cell = h(
      'div',
      {
        class: `cell row-${row} ${(row + col) % 2 ? 'alt' : ''}`,
        'data-n': String(n),
        style: `--d:${(row + col) * 26}ms`,
      },
      h('span', { class: 'num' }, String(n)),
    )
    if (n === 100) {
      cell.classList.add('cell-final')
      cell.append(h('span', { class: 'final-star' }, '🏆'))
    }
    if (n === 1) {
      cell.classList.add('cell-one')
      cell.append(h('span', { class: 'go-star' }, '⭐'))
    }
    cell.style.gridRow = String(10 - row)
    cell.style.gridColumn = String(col + 1)
    grid.append(cell)
  }

  // ---- ladders -------------------------------------------------------------
  const defs = svgEl('defs')
  svg.append(defs)
  const shadow = svgEl('filter', { id: 'soft-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' })
  shadow.append(svgEl('feDropShadow', { dx: 3, dy: 6, stdDeviation: 4, 'flood-color': '#5b3b8a', 'flood-opacity': 0.28 }))
  defs.append(shadow)

  const ladderGroup = svgEl('g', { filter: 'url(#soft-shadow)' })
  svg.append(ladderGroup)
  for (const [fromS, to] of Object.entries(LADDERS)) {
    const a = cellOf(Number(fromS)) // base
    const b = cellOf(to) // top
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const nx = -dy / len
    const ny = dx / len
    const off = 14
    const g = svgEl('g', { class: 'ladder' })
    for (const s of [-1, 1]) {
      g.append(
        svgEl('line', {
          x1: a.x + nx * off * s, y1: a.y + ny * off * s,
          x2: b.x + nx * off * s, y2: b.y + ny * off * s,
          stroke: '#a3641f', 'stroke-width': 11, 'stroke-linecap': 'round',
        }),
        svgEl('line', {
          x1: a.x + nx * off * s, y1: a.y + ny * off * s,
          x2: b.x + nx * off * s, y2: b.y + ny * off * s,
          stroke: '#eab566', 'stroke-width': 5.5, 'stroke-linecap': 'round',
        }),
      )
    }
    const rungs = Math.max(3, Math.round(len / 62))
    for (let i = 0; i < rungs; i++) {
      const t = (i + 0.5) / rungs
      const px = a.x + dx * t
      const py = a.y + dy * t
      g.append(
        svgEl('line', {
          x1: px + nx * off, y1: py + ny * off, x2: px - nx * off, y2: py - ny * off,
          stroke: '#a3641f', 'stroke-width': 9, 'stroke-linecap': 'round',
        }),
        svgEl('line', {
          x1: px + nx * off, y1: py + ny * off, x2: px - nx * off, y2: py - ny * off,
          stroke: '#f6c983', 'stroke-width': 4.5, 'stroke-linecap': 'round',
        }),
      )
    }
    ladderGroup.append(g)
  }

  // ---- snakes ----------------------------------------------------------------
  const snakeGroup = svgEl('g', { filter: 'url(#soft-shadow)' })
  svg.append(snakeGroup)
  let si = 0
  for (const [fromS, to] of Object.entries(SNAKES)) {
    const head = cellOf(Number(fromS))
    const tail = cellOf(to)
    const [light, dark] = SNAKE_SKINS[si % SNAKE_SKINS.length]
    const dx = tail.x - head.x
    const dy = tail.y - head.y
    const len = Math.hypot(dx, dy)
    const nx = -dy / len
    const ny = dx / len
    const amp = Math.min(85, Math.max(42, len * 0.2)) * (si % 2 ? -1 : 1)
    const c1 = { x: head.x + dx * 0.3 + nx * amp, y: head.y + dy * 0.3 + ny * amp }
    const c2 = { x: head.x + dx * 0.7 - nx * amp, y: head.y + dy * 0.7 - ny * amp }

    const pts: Pt[] = []
    for (let i = 0; i <= 28; i++) pts.push(bez(head, c1, c2, tail, i / 28))
    snakeSamples.set(Number(fromS), pts)

    const gradId = `snake-skin-${si}`
    const grad = svgEl('linearGradient', {
      id: gradId, gradientUnits: 'userSpaceOnUse',
      x1: head.x, y1: head.y, x2: tail.x, y2: tail.y,
    })
    grad.append(
      svgEl('stop', { offset: '0', 'stop-color': light }),
      svgEl('stop', { offset: '1', 'stop-color': dark }),
    )
    defs.append(grad)

    const d = `M ${head.x} ${head.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${tail.x} ${tail.y}`
    const g = svgEl('g', { class: 'snake' })
    g.append(
      svgEl('path', { d, fill: 'none', stroke: dark, 'stroke-width': 30, 'stroke-linecap': 'round' }),
      svgEl('path', { d, fill: 'none', stroke: `url(#${gradId})`, 'stroke-width': 22, 'stroke-linecap': 'round' }),
      svgEl('path', {
        d, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.55, 'stroke-width': 6,
        'stroke-linecap': 'round', 'stroke-dasharray': '2.5 21',
      }),
    )
    // tail tip
    g.append(svgEl('circle', { cx: tail.x, cy: tail.y, r: 8, fill: dark }))

    // head with googly eyes + forked tongue, pointing away from the body
    const dirx = (head.x - pts[1].x) / Math.hypot(head.x - pts[1].x, head.y - pts[1].y)
    const diry = (head.y - pts[1].y) / Math.hypot(head.x - pts[1].x, head.y - pts[1].y)
    const hx = head.x + dirx * 14
    const hy = head.y + diry * 14
    const ang = (Math.atan2(diry, dirx) * 180) / Math.PI
    const headG = svgEl('g', { transform: `translate(${hx} ${hy}) rotate(${ang})` })
    headG.append(
      svgEl('path', {
        d: 'M 30 0 L 46 0 M 46 0 L 57 -9 M 46 0 L 57 9',
        stroke: '#ff3355', 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none',
      }),
      svgEl('ellipse', { cx: 0, cy: 0, rx: 33, ry: 26, fill: dark }),
      svgEl('ellipse', { cx: 5, cy: 0, rx: 24, ry: 18, fill: light, 'fill-opacity': 0.5 }),
      svgEl('circle', { cx: 10, cy: -12, r: 10.5, fill: '#fff' }),
      svgEl('circle', { cx: 10, cy: 12, r: 10.5, fill: '#fff' }),
      svgEl('circle', { cx: 13.5, cy: -12, r: 5, fill: '#26203c' }),
      svgEl('circle', { cx: 13.5, cy: 12, r: 5, fill: '#26203c' }),
      svgEl('circle', { cx: 15.4, cy: -13.8, r: 1.9, fill: '#fff' }),
      svgEl('circle', { cx: 15.4, cy: 10.2, r: 1.9, fill: '#fff' }),
    )
    g.append(headG)
    snakeGroup.append(g)
    si++
  }

  // ---- tokens ----------------------------------------------------------------

  function cellPct(n: number): Pt {
    const c = cellOf(n)
    return { x: c.x / 10, y: c.y / 10 }
  }

  function ensureToken(seat: number, avatar: string): Token {
    let t = tokens.get(seat)
    if (!t) {
      const face = h('div', { class: 'tface' }, avatar)
      const el = h('div', { class: 'token', style: `--tc:${SEAT_COLORS[seat]}` }, face)
      tokenLayer.append(el)
      t = { seat, avatar, pos: 0, el, face }
      tokens.set(seat, t)
    }
    if (t.avatar !== avatar) {
      t.avatar = avatar
      t.face.textContent = avatar
    }
    return t
  }

  function setLoc(t: Token, p: Pt, dx = 0, dy = 0) {
    t.el.style.left = `${p.x + dx}%`
    t.el.style.top = `${p.y + dy}%`
  }

  function layoutTokens() {
    const groups = new Map<number, Token[]>()
    for (const t of tokens.values()) {
      t.el.classList.toggle('off', t.pos < 1)
      if (t.pos < 1) continue
      const g = groups.get(t.pos) ?? []
      g.push(t)
      groups.set(t.pos, g)
    }
    const quad = [
      [-1.9, -1.9],
      [1.9, -1.9],
      [-1.9, 1.9],
      [1.9, 1.9],
    ]
    for (const [pos, g] of groups) {
      g.sort((a, b) => a.seat - b.seat)
      const p = cellPct(pos)
      g.forEach((t, i) => {
        t.el.classList.toggle('small', g.length > 1)
        if (g.length === 1) setLoc(t, p)
        else setLoc(t, p, quad[i][0], quad[i][1])
      })
    }
  }

  function hopFace(t: Token) {
    t.face.classList.remove('hop')
    void t.face.offsetWidth
    t.face.classList.add('hop')
  }

  async function rafMove(t: Token, pts: Pt[], dur: number, ease: (x: number) => number, sparkles = false) {
    t.el.classList.add('gliding')
    const start = performance.now()
    let lastSpark = 0
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / dur)
        const e = ease(k)
        const fi = e * (pts.length - 1)
        const i = Math.min(pts.length - 2, Math.floor(fi))
        const f = fi - i
        const x = pts[i].x + (pts[i + 1].x - pts[i].x) * f
        const y = pts[i].y + (pts[i + 1].y - pts[i].y) * f
        t.el.style.left = `${x / 10}%`
        t.el.style.top = `${y / 10}%`
        t.face.style.rotate = `${Math.sin(k * 14) * 13}deg`
        if (sparkles && now - lastSpark > 85) {
          lastSpark = now
          fx.sparkle(x / 10, y / 10)
        }
        if (k < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
    t.face.style.rotate = ''
    t.el.classList.remove('gliding')
  }

  async function climb(t: Token, portal: Portal) {
    const a = cellOf(portal.from)
    const b = cellOf(portal.to)
    const pts: Pt[] = []
    for (let i = 0; i <= 16; i++) {
      const k = i / 16
      pts.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
    }
    const dur = rm(500 + Math.hypot(b.x - a.x, b.y - a.y) * 1.1)
    await rafMove(t, pts, dur, easeInOut, true)
    confetti.burst(b.x / 10, b.y / 10, 20, 5)
  }

  async function slide(t: Token, portal: Portal) {
    const pts = snakeSamples.get(portal.from)
    const a = cellOf(portal.from)
    const b = cellOf(portal.to)
    const dur = rm(650 + Math.hypot(b.x - a.x, b.y - a.y) * 1.0)
    await rafMove(t, pts ?? [a, b], dur, easeIn)
  }

  async function animateScript(seat: number, script: MoveScript): Promise<void> {
    const info = tokens.get(seat)
    const t = info ?? ensureToken(seat, '❓')
    t.el.classList.add('moving')

    if (script.steps.length === 0) {
      fx.toast('Need the exact number! 🙃', 'info')
      sound.bonk()
      await wait(rm(900))
    } else {
      const hopMs = rm(235)
      let bonked = false
      for (let i = 0; i < script.steps.length; i++) {
        const cell = script.steps[i]
        t.pos = cell
        setLoc(t, cellPct(cell))
        hopFace(t)
        sound.boop(i)
        await wait(hopMs)
        if (cell === 100 && script.bounced && !bonked) {
          bonked = true
          fx.toast('BOING! Too far! 🙃', 'info')
          sound.bonk()
          vibrate(30)
          await wait(rm(420))
        }
      }
      for (const portal of script.portals) {
        if (portal.kind === 'ladder') {
          fx.toast('WHEEE! Up we go! 🪜✨', 'ladder')
          sound.ladder()
          await climb(t, portal)
        } else {
          fx.toast('SSSNAKE! Slide down! 🐍', 'snake')
          sound.snake()
          vibrate([50, 40, 60])
          shakeEl(inner)
          await slide(t, portal)
        }
        t.pos = portal.to
        await wait(rm(160))
      }
    }

    t.el.classList.remove('moving')
    layoutTokens()
  }

  return {
    root,
    fx,
    confetti,
    setTokens(list: TokenView[]) {
      const seen = new Set<number>()
      for (const v of list) {
        const t = ensureToken(v.seat, v.avatar)
        t.pos = v.pos
        seen.add(v.seat)
      }
      for (const [seat, t] of tokens) {
        if (!seen.has(seat)) {
          t.el.remove()
          tokens.delete(seat)
        }
      }
      layoutTokens()
    },
    setActiveSeat(seat: number | null) {
      for (const [s, t] of tokens) t.el.classList.toggle('active', s === seat)
    },
    animateScript,
    burstAtCell(n: number) {
      const p = cellPct(n)
      confetti.burst(p.x, p.y, 32, 7)
    },
    shake: () => shakeEl(inner),
    destroy() {
      confetti.stop()
    },
  }
}
