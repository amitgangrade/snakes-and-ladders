// 3D CSS dice with a multi-phase tension roll:
// wind-up shake + rattle -> long decelerating tumble with ticks -> landing pop.

import { h, rm, vibrate, wait } from './dom'
import { sound } from './sound'

const FACE_ROT: Record<number, [number, number]> = {
  1: [0, 0],
  2: [0, -90],
  3: [-90, 0],
  4: [90, 0],
  5: [0, 90],
  6: [0, 180],
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export interface Dice {
  el: HTMLElement
  roll(value: number): Promise<void>
  setEnabled(on: boolean): void
  onTap(cb: () => void): void
}

export function createDice(): Dice {
  const cube = h('div', { class: 'cube' })
  for (let f = 1; f <= 6; f++) {
    const face = h('div', { class: `face face-${f}` })
    for (let i = 0; i < 9; i++) {
      face.append(h('span', { class: PIPS[f].includes(i) ? 'pip' : 'pip off' }))
    }
    cube.append(face)
  }
  const ring = h('div', { class: 'dice-ring' })
  const el = h('div', { class: 'dice', role: 'button', tabindex: '0', 'aria-label': 'Roll the dice' }, cube, ring)

  let tapCb: (() => void) | null = null
  let busy = false
  let spinFlip = 0

  el.addEventListener('click', () => {
    if (!busy) tapCb?.()
  })
  el.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && !busy) {
      ev.preventDefault()
      tapCb?.()
    }
  })

  function scheduleTicks(total: number) {
    let t = 60
    let gap = 55
    while (t < total * 0.9) {
      setTimeout(() => sound.tick(), t)
      gap *= 1.22
      t += gap
    }
  }

  async function roll(value: number) {
    busy = true
    el.classList.remove('landed')
    el.classList.add('rolling')
    vibrate(20)
    sound.rattle()
    cube.classList.add('windup')
    await wait(rm(430))
    cube.classList.remove('windup')

    const [fx, fy] = FACE_ROT[value]
    spinFlip = (spinFlip + 1) % 2
    const rx = fx + 360 * (3 + spinFlip)
    const ry = fy + 360 * (2 + (1 - spinFlip))
    const dur = rm(1350)
    scheduleTicks(dur)
    const anim = cube.animate(
      [
        { transform: cube.style.transform || 'rotateX(-16deg) rotateY(22deg)' },
        { transform: `rotateX(${rx}deg) rotateY(${ry}deg)` },
      ],
      { duration: dur, easing: 'cubic-bezier(.15,.72,.18,1)', fill: 'forwards' },
    )
    await anim.finished.catch(() => {})
    cube.style.transform = `rotateX(${fx}deg) rotateY(${fy}deg)`
    anim.cancel()

    el.classList.add('landed')
    sound.pop()
    vibrate(45)
    await wait(rm(400))
    el.classList.remove('rolling')
    busy = false
  }

  return {
    el,
    roll,
    setEnabled(on: boolean) {
      el.classList.toggle('ready', on)
      el.setAttribute('aria-disabled', on ? 'false' : 'true')
    },
    onTap(cb) {
      tapCb = cb
    },
  }
}
