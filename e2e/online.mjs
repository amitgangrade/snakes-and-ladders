// End-to-end online multiplayer test (two browser pages).
//
//   npm run dev          # in one terminal
//   node e2e/online.mjs  # BroadcastChannel transport (offline, fast)
//   NET=real node e2e/online.mjs   # true trystero/nostr + WebRTC transport
//
// Uses the system Edge via Playwright's msedge channel — no browser download.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = (process.env.URL || 'http://localhost:5173/') + (process.env.NET === 'real' ? '' : '?net=bc')
const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 880 } })

const A = await ctx.newPage() // host
const B = await ctx.newPage() // guest
for (const [tag, p] of [['A', A], ['B', B]]) {
  p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message))
  p.on('console', (m) => m.type() === 'error' && console.log(`[${tag} console]`, m.text()))
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}${name}.png` })
  console.log('shot', name)
}

// ---- host creates a room
await A.goto(BASE)
await A.fill('.name-input', 'Maya')
await A.click('text=Create online room')
await A.waitForSelector('.code-tile')
const code = await A.$$eval('.code-tile', (els) => els.map((e) => e.textContent).join(''))
console.log('room code:', code)

// ---- guest joins with the code
await B.goto(BASE)
await B.fill('.name-input', 'Leo')
await B.click('text=Join with a code')
await B.fill('.code-input', code)
await B.click('text=GO!')

// lobby sync both ways
await A.waitForSelector('.seat-card:has-text("Leo")', { timeout: 15000 })
await B.waitForSelector('.seat-card:has-text("Maya")', { timeout: 15000 })
console.log('lobby synced')
await shot(A, '20-lobby-host')
await shot(B, '21-lobby-guest')

// duplicate-hello regression check: exactly one Leo seat
await A.waitForTimeout(3500)
const leoSeats = await A.$$eval('.seat-card', (els) => els.filter((e) => e.textContent.includes('Leo')).length)
if (leoSeats !== 1) throw new Error(`expected 1 Leo seat, saw ${leoSeats}`)

// ---- host adds a bot and starts
await A.click('button:has-text("🤖 Add bot")')
await A.waitForTimeout(400)
await A.click('.start-btn')
await A.waitForSelector('.dice', { timeout: 10000 })
await B.waitForSelector('.dice', { timeout: 10000 })
console.log('both in game')

// ---- host rolls a forced 5
await A.waitForSelector('.dice.ready', { timeout: 20000 })
await A.evaluate(() => (window.__snlNextRoll = 5))
await A.click('.dice')
await B.waitForFunction(
  () => [...document.querySelectorAll('.pcard-cell')].some((e) => e.textContent === 'Square 5'),
  { timeout: 20000 },
)
console.log('guest saw host land on square 5')

// ---- guest rolls: forced 4 on the HOST (authority) -> ladder 4 -> 14
await B.waitForSelector('.dice.ready', { timeout: 30000 })
await A.evaluate(() => (window.__snlNextRoll = 4))
await B.click('.dice')
await A.waitForFunction(
  () => [...document.querySelectorAll('.pcard-cell')].some((e) => e.textContent === 'Square 14'),
  { timeout: 25000 },
)
console.log('guest rolled via intent, rode ladder 4->14, host agrees')
await shot(B, '22-game-guest')

// ---- emoji from guest shows on host
await B.click('.emoji-btn >> nth=1')
await A.waitForSelector('.float-emoji', { timeout: 8000 })
console.log('emoji floated across')

// ---- guest drops; host swaps in a bot
await B.close()
await A.waitForSelector('.chip-off', { timeout: 20000 })
console.log('host saw guest disconnect')
await shot(A, '23-guest-offline')
await A.click('button:has-text("Let a bot play")')
await A.waitForFunction(() => ![...document.querySelectorAll('.pcard .chip-off')].length, { timeout: 10000 })
console.log('seat handed to bot, game continues')

// ---- late joiner is denied politely
const C = await ctx.newPage()
let denyMsg = ''
C.on('dialog', async (d) => {
  denyMsg = d.message()
  await d.dismiss()
})
await C.goto(BASE)
await C.fill('.name-input', 'Zoe')
await C.click('text=Join with a code')
await C.fill('.code-input', code)
await C.click('text=GO!')
await C.waitForTimeout(4000)
console.log('late join deny message:', denyMsg || '(none!)')
if (!denyMsg.includes('started')) throw new Error('expected a "game already started" dialog')
await C.close()

// ---- fresh room: host leaves mid-game, guest gets told
const D = await ctx.newPage() // host 2
const E = await ctx.newPage() // guest 2
await D.goto(BASE)
await D.fill('.name-input', 'Ava')
await D.click('text=Create online room')
await D.waitForSelector('.code-tile')
const code2 = await D.$$eval('.code-tile', (els) => els.map((e) => e.textContent).join(''))
await E.goto(BASE)
await E.fill('.name-input', 'Sam')
await E.click('text=Join with a code')
await E.fill('.code-input', code2)
await E.click('text=GO!')
await D.waitForSelector('.seat-card:has-text("Sam")', { timeout: 15000 })
await D.click('.start-btn')
await E.waitForSelector('.dice', { timeout: 10000 })
await D.close()
await E.waitForSelector('.overlay:has-text("host left")', { timeout: 20000 })
console.log('guest notified that the host left')
await E.close()

await browser.close()
console.log('online flow OK')
