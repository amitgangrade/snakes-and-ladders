// All game audio is synthesized with WebAudio — no sound files to load.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = localStorage.getItem('snl.sound') === 'off'

function ac(): AudioContext | null {
  if (muted) return null
  try {
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface ToneOpts {
  f0: number
  f1?: number
  dur: number
  at?: number
  type?: OscillatorType
  vol?: number
}

function tone({ f0, f1, dur, at = 0, type = 'sine', vol = 0.2 }: ToneOpts) {
  const c = ac()
  if (!c || !master) return
  const t = c.currentTime + at
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f0, t)
  if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function noise({ dur, at = 0, vol = 0.15, f0 = 3000, f1 }: { dur: number; at?: number; vol?: number; f0?: number; f1?: number }) {
  const c = ac()
  if (!c || !master) return
  const t = c.currentTime + at
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 0.9
  bp.frequency.setValueAtTime(f0, t)
  if (f1) bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp)
  bp.connect(g)
  g.connect(master)
  src.start(t)
  src.stop(t + dur + 0.05)
}

const PENTA = [523, 587, 659, 784, 880]

export const sound = {
  isMuted: () => muted,
  toggle(): boolean {
    muted = !muted
    localStorage.setItem('snl.sound', muted ? 'off' : 'on')
    if (!muted) sound.tap()
    return muted
  },

  tap: () => tone({ f0: 700, f1: 520, dur: 0.07, type: 'triangle', vol: 0.15 }),
  tick: () => tone({ f0: 1500, dur: 0.02, type: 'square', vol: 0.05 }),
  rattle() {
    for (let i = 0; i < 9; i++) {
      noise({ dur: 0.03, at: i * 0.042, vol: 0.1, f0: 2200 + Math.random() * 2200 })
    }
  },
  pop() {
    tone({ f0: 480, f1: 960, dur: 0.13, vol: 0.25 })
    noise({ dur: 0.05, vol: 0.1, f0: 4000 })
  },
  boop(i: number) {
    tone({ f0: PENTA[i % PENTA.length] * (1 + Math.floor(i / PENTA.length) * 0.25), dur: 0.09, vol: 0.16 })
  },
  bonk: () => tone({ f0: 220, f1: 130, dur: 0.2, type: 'square', vol: 0.16 }),
  ladder() {
    tone({ f0: 360, f1: 1300, dur: 0.6, type: 'sawtooth', vol: 0.1 })
    tone({ f0: 1568, dur: 0.1, at: 0.25, vol: 0.12 })
    tone({ f0: 2093, dur: 0.1, at: 0.4, vol: 0.12 })
    tone({ f0: 2637, dur: 0.14, at: 0.55, vol: 0.12 })
  },
  snake() {
    noise({ dur: 0.8, vol: 0.2, f0: 5200, f1: 420 })
    tone({ f0: 520, f1: 150, dur: 0.7, type: 'triangle', vol: 0.2 })
    tone({ f0: 200, f1: 148, dur: 0.28, at: 0.55, type: 'sawtooth', vol: 0.16 })
  },
  six() {
    tone({ f0: 880, dur: 0.11, type: 'triangle', vol: 0.2 })
    tone({ f0: 1175, dur: 0.22, at: 0.11, type: 'triangle', vol: 0.2 })
  },
  chime() {
    tone({ f0: 660, dur: 0.12, vol: 0.14 })
    tone({ f0: 990, dur: 0.25, at: 0.1, vol: 0.14 })
  },
  win() {
    const notes = [523, 659, 784, 1046, 1318, 1568]
    notes.forEach((f, i) => tone({ f0: f, dur: 0.14, at: i * 0.09, type: 'triangle', vol: 0.2 }))
    ;[523, 659, 784].forEach((f) => tone({ f0: f * 2, dur: 0.9, at: 0.62, vol: 0.1 }))
    for (let i = 0; i < 6; i++) noise({ dur: 0.06, at: 0.7 + i * 0.13, vol: 0.08, f0: 3000 + Math.random() * 3000 })
  },
}
