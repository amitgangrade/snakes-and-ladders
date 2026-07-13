// Visual tour: plays two scripted local games (ladder, snake, bounce-free win,
// play-again) and screenshots every key moment into e2e/out/.
//
//   npm run dev        # in one terminal
//   node e2e/tour.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.URL || 'http://localhost:5173/'
const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 880 } })
page.on('console', (m) => m.type() === 'error' && console.log('[console.error]', m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}${name}.png` })
  console.log('shot', name)
}
const wait = (ms) => page.waitForTimeout(ms)
const forceRoll = (n) => page.evaluate((v) => (window.__snlNextRoll = v), n)
const waitDiceReady = () => page.waitForSelector('.dice.ready', { timeout: 30000 })

// ---------- home ----------
await page.goto(BASE)
await wait(1400)
await shot('01-home')

// ---------- local lobby ----------
await page.fill('.name-input', 'Maya')
await page.click('text=Play on this device')
await wait(500)
await shot('02-lobby-local')

// replace the default bot with a second kid for deterministic turns
await page.click('.chip-btn.danger') // remove bot
await wait(200)
await page.click('button:has-text("🧒 Add kid")')
await wait(300)

// ---------- game A: ladder, then snake ----------
await page.click('.start-btn')
await wait(900)
await shot('04-game-start')

// P1 rolls 1 -> square 1 -> ladder to 38
await waitDiceReady()
await forceRoll(1)
await page.click('.dice')
await wait(950)
await shot('05-dice-tumbling')
await wait(1750)
await shot('06-ladder-climb')
await wait(2200)

// P2 rolls 2
await waitDiceReady()
await forceRoll(2)
await page.click('.dice')
await wait(3200)

// P1 rolls 6 (-> 44, extra) then 3 (-> 47 snake -> 26)
await waitDiceReady()
await forceRoll(6)
await page.click('.dice')
await wait(1500)
await shot('07-six-toast')
await waitDiceReady()
await forceRoll(3)
await page.click('.dice')
await wait(3400)
await shot('08-snake-slide')
await wait(1600)
await shot('09-after-snake')

// ---------- game B: ride to victory ----------
await page.click('.leave-btn')
await page.click('.leave-btn') // confirm
await wait(500)
await page.click('text=Play on this device')
await wait(400)
await page.click('.chip-btn.danger')
await page.click('button:has-text("🧒 Add kid")')
await wait(200)
await page.click('.start-btn')
await wait(600)

// P1: 1 (->38 L), P2: 2, P1: 6,6,1 (->67 via 51 L), P2: 3, P1: 4 (->71 L ->91),
// P2: 3, P1: 3 (->94), P2: 3, P1: 6 (->100 WIN)
const seq = [1, 2, 6, 6, 1, 3, 4, 3, 3, 3, 6]
for (const r of seq) {
  await waitDiceReady()
  await forceRoll(r)
  await page.click('.dice')
  await wait(300)
}
await page.waitForSelector('.overlay', { timeout: 60000 })
await wait(1200)
await shot('10-win-overlay')

// win overlay on a phone
await page.setViewportSize({ width: 390, height: 844 })
await wait(400)
await shot('11-win-mobile')
await page.setViewportSize({ width: 1280, height: 880 })

// play again resets the board
await page.click('text=Play again!')
await wait(900)
const cells = await page.$$eval('.pcard-cell', (els) => els.map((e) => e.textContent))
console.log('after play-again, cards say:', cells.join(' | '))
if (!cells.every((c) => c === 'Ready to hop in!')) throw new Error('play-again did not reset positions')

// ---------- mobile pass ----------
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(BASE)
await wait(900)
await shot('12-home-mobile')
await page.click('text=Play on this device')
await wait(400)
await page.click('.start-btn')
await wait(800)
await shot('13-game-mobile')

await browser.close()
console.log('tour OK ->', OUT)
