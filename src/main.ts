import './ui/style.css'
import type { Session } from './net/session'
import { h } from './ui/dom'
import { sound } from './ui/sound'
import { homeScreen } from './ui/home'
import { lobbyScreen } from './ui/lobby'
import { gameScreen } from './ui/game'

export interface Screen {
  el: HTMLElement
  dispose(): void
}

export interface Nav {
  home(): void
  lobby(session: Session): void
  game(session: Session): void
}

const app = document.getElementById('app')!
let current: Screen | null = null

function show(screen: Screen) {
  current?.dispose()
  app.replaceChildren(screen.el)
  current = screen
  window.scrollTo(0, 0)
}

const nav: Nav = {
  home() {
    // drop the ?room param so refresh doesn't re-join, but keep ?net for testing
    const params = new URLSearchParams(location.search)
    params.delete('room')
    const qs = params.toString()
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''))
    show(homeScreen(nav))
  },
  lobby: (s) => show(lobbyScreen(nav, s)),
  game: (s) => show(gameScreen(nav, s)),
}

// dreamy animated background, shared by all screens
document.body.prepend(
  h(
    'div',
    { class: 'sky', 'aria-hidden': 'true' },
    h('div', { class: 'sun' }),
    h('div', { class: 'cloud c1' }),
    h('div', { class: 'cloud c2' }),
    h('div', { class: 'cloud c3' }),
  ),
)

// global sound toggle
const soundBtn = h(
  'button',
  { class: 'icon-btn sound-btn', 'aria-label': 'Toggle sound' },
  sound.isMuted() ? '🔇' : '🔊',
)
soundBtn.addEventListener('click', () => {
  const muted = sound.toggle()
  soundBtn.textContent = muted ? '🔇' : '🔊'
})
document.body.append(soundBtn)

const room = new URLSearchParams(location.search).get('room')
show(homeScreen(nav, room ? room.toUpperCase().slice(0, 4) : undefined))
