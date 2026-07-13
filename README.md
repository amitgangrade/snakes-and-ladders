# 🐍🪜 Snakes & Ladders — play with friends, no server required

A super-colorful Snakes & Ladders for kids, for up to 4 players — each on
their own phone or computer. One person creates a room and shares a 4-letter
code (or a link / QR code); everyone else hops in. Hosted entirely as a static
site (GitHub Pages) — there is **no backend**: devices talk to each other
directly over WebRTC, exactly like the sibling [Ludo](../Ludo) project.

Tap the dice and feel the tension build: it rattles, tumbles in 3D, ticks
slower and slower… then POP! Heroes hop square by square, ladders whoosh you
up with sparkles, snakes hiss and wiggle you down, and winning rains confetti.
All sounds are synthesized in the browser — no audio files, works offline.

## Play

1. Open the site, pick your hero (🦊 🐸 🦄 🐼 …), type your name.
2. **Create online room** → share the code, the invite link, or the QR code.
3. Friends open the link (or **Join with a code**) on their devices.
4. The host can fill empty seats with silly bots — **Slidey Sam**,
   **Ladder Lucy**, **Hissy Henry** — then taps **Start**.
5. On your turn: **TAP THE DICE!** First to land exactly on 100 wins. 🏆

Solo or one device? **Play on this device** does pass-and-play with any mix
of kids and bots.

### Rules

- Roll the die, hop forward. Ladders take you up; snakes slide you down.
- Roll a **6** and you roll again. ⭐
- You need the **exact** number to land on 100 — roll too many and you
  **bounce back** (BOING!). The host can switch bouncing off in the lobby,
  in which case an overshoot just stays put.
- If someone's tab closes mid-game, the game waits for them: they can reopen
  the invite link and type the **same name** to reclaim their seat, or the
  host can hand the seat to a bot with one tap.

## Host your own copy (free, ~2 minutes)

1. Push this folder to a new GitHub repository:

   ```bash
   git init
   git add .
   git commit -m "Snakes & Ladders"
   gh repo create snakes-and-ladders --public --source . --push   # or add a remote + push manually
   ```

2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub
   Actions**.
3. Push to `main` (or re-run the *Deploy to GitHub Pages* workflow). Your game
   is live at `https://<you>.github.io/<repo>/`.

The included [workflow](.github/workflows/deploy.yml) tests, builds, and
publishes on every push.

## How it works without a server

- **Signaling:** [Trystero](https://github.com/dmotz/trystero) brokers WebRTC
  connections through public [Nostr](https://nostr.com) relays — used only
  for the initial handshake.
- **Game state:** the room creator's device is the authority. Guests send
  tiny intents ("roll!"); the host validates, computes the move (dice value,
  every hop, ladders/snakes, bounce), and broadcasts versioned snapshots.
  Every device plays back the same move script, so everyone watches the same
  show. Bots run on the host device too.
- **NAT traversal:** most connections are direct P2P (STUN); restrictive
  networks fall back to the free
  [Open Relay](https://www.metered.ca/tools/openrelay/) TURN service. If your
  players can't connect, having one of them on Wi-Fi almost always fixes it.

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # engine rule tests (vitest)
npm run build      # type-check + production build to dist/
```

Local two-tab multiplayer without touching the network: open
`http://localhost:5173/?net=bc` in two tabs (BroadcastChannel transport —
same session code, no relays).

With the dev server running (uses the system Edge, no browser download):

```bash
npm run e2e             # two-player online flow: join, roll, portals, emoji,
                        # disconnect -> bot, late-join deny, host-left notice
NET=real npm run e2e    # same flow over the real nostr/WebRTC transport
npm run e2e:tour        # scripted games with screenshots into e2e/out/
```

### Code layout

```
src/engine/    pure rules: board math, move scripts, no I/O  (unit-tested)
src/net/       transports (Trystero / BroadcastChannel), host authority,
               guest session, reconnect-by-name, bot takeover
src/ui/        screens, SVG board (hand-drawn snakes & ladders), 3D dice,
               animation director, WebAudio synth sounds, confetti
tests/         rule matrix: portals, bounce, exact win, extra turns
```

### The board

Squares 1–100 snake bottom-left → top-left. Ladders: 1→38, 4→14, 9→31,
21→42, 28→84, 36→44, 51→67, 71→91, 80→100. Snakes: 16→6, 47→26, 49→11,
56→37, 62→19, 64→43, 87→24, 93→73, 95→75, 98→78. Board graphics are drawn
from the same `cellOf()` math the rules use, so the picture can never
disagree with the game.
