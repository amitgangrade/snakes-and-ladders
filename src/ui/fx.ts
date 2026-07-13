// Juice: confetti, toasts, sparkles, floating emoji, screen shake.

import { h, rm, wait } from './dom'

const CANDY = ['#ff4d6d', '#2e9bff', '#2ecc71', '#ffab00', '#b06cff', '#ff8fab', '#4dd6ff', '#ffe066']

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  size: number
  color: string
  shape: 'rect' | 'dot'
  life: number
  ttl: number
}

export interface Confetti {
  burst(xPct: number, yPct: number, count?: number, power?: number): void
  rain(ms?: number): void
  stop(): void
}

export function makeConfetti(canvas: HTMLCanvasElement): Confetti {
  const ctx = canvas.getContext('2d')
  let parts: Particle[] = []
  let raf = 0
  let raining = 0

  function size() {
    const r = canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (canvas.width !== Math.round(r.width * dpr)) {
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
    }
    return { w: canvas.width, h: canvas.height, dpr }
  }

  function spawn(x: number, y: number, count: number, power: number, fromTop = false) {
    const { dpr } = size()
    for (let i = 0; i < count; i++) {
      const ang = fromTop ? Math.PI / 2 + (Math.random() - 0.5) * 0.6 : Math.random() * Math.PI * 2
      const speed = (fromTop ? 1 + Math.random() * 2 : 2 + Math.random() * power) * dpr
      parts.push({
        x,
        y,
        vx: Math.cos(ang) * speed * (fromTop ? 0.4 : 1),
        vy: Math.sin(ang) * speed - (fromTop ? 0 : 3 * dpr),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        size: (4 + Math.random() * 5) * dpr,
        color: CANDY[Math.floor(Math.random() * CANDY.length)],
        shape: Math.random() < 0.7 ? 'rect' : 'dot',
        life: 0,
        ttl: 90 + Math.random() * 60,
      })
    }
    loop()
  }

  function loop() {
    if (raf) return
    const step = () => {
      raf = 0
      if (!ctx) return
      const { w, h, dpr } = size()
      ctx.clearRect(0, 0, w, h)
      if (raining > Date.now()) {
        for (let i = 0; i < 3; i++) spawnRainDrop(w, dpr)
      }
      parts = parts.filter((p) => p.life < p.ttl && p.y < h + 40)
      for (const p of parts) {
        p.life++
        p.vy += 0.12 * dpr
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        const alpha = p.life > p.ttl - 25 ? (p.ttl - p.life) / 25 : 1
        ctx.globalAlpha = Math.max(0, alpha)
        ctx.fillStyle = p.color
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2.6, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      ctx.globalAlpha = 1
      if (parts.length || raining > Date.now()) raf = requestAnimationFrame(step)
      else ctx.clearRect(0, 0, w, h)
    }
    raf = requestAnimationFrame(step)
  }

  function spawnRainDrop(w: number, dpr: number) {
    parts.push({
      x: Math.random() * w,
      y: -10,
      vx: (Math.random() - 0.5) * 1.5 * dpr,
      vy: (1.5 + Math.random() * 2.5) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      size: (5 + Math.random() * 6) * dpr,
      color: CANDY[Math.floor(Math.random() * CANDY.length)],
      shape: Math.random() < 0.7 ? 'rect' : 'dot',
      life: 0,
      ttl: 240,
    })
  }

  return {
    burst(xPct, yPct, count = 26, power = 6) {
      const { w, h } = size()
      spawn((xPct / 100) * w, (yPct / 100) * h, count, power)
    },
    rain(ms = 2600) {
      raining = Date.now() + ms
      loop()
    },
    stop() {
      raining = 0
      parts = []
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      const { w, h } = size()
      ctx?.clearRect(0, 0, w, h)
    },
  }
}

// --------------------------------------------------------------------------

export interface FxLayer {
  toast(text: string, kind?: 'info' | 'ladder' | 'snake' | 'win' | 'turn'): void
  sparkle(xPct: number, yPct: number): void
  floatEmoji(e: string, color: string): void
}

export function makeFxLayer(layer: HTMLElement): FxLayer {
  let chain: Promise<void> = Promise.resolve()

  return {
    toast(text, kind = 'info') {
      chain = chain.then(async () => {
        const el = h('div', { class: `toast toast-${kind}` }, text)
        layer.append(el)
        await wait(rm(kind === 'win' ? 1500 : 1000))
        el.classList.add('out')
        await wait(rm(220))
        el.remove()
      })
    },
    sparkle(xPct, yPct) {
      const el = h('span', { class: 'sparkle', style: `left:${xPct}%;top:${yPct}%` }, '✦')
      el.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`)
      el.style.setProperty('--dy', `${-30 - Math.random() * 50}px`)
      el.style.color = CANDY[Math.floor(Math.random() * CANDY.length)]
      el.style.fontSize = `${12 + Math.random() * 14}px`
      layer.append(el)
      setTimeout(() => el.remove(), 800)
    },
    floatEmoji(e, color) {
      const el = h('span', { class: 'float-emoji', style: `left:${8 + Math.random() * 84}%` }, e)
      el.style.setProperty('--sway', `${(Math.random() - 0.5) * 80}px`)
      el.style.textShadow = `0 2px 0 ${color}`
      layer.append(el)
      setTimeout(() => el.remove(), 2600)
    },
  }
}

export function shakeEl(el: HTMLElement) {
  el.classList.remove('shake-hard')
  void el.offsetWidth
  el.classList.add('shake-hard')
  setTimeout(() => el.classList.remove('shake-hard'), 500)
}
