// Home screen: hero picker + the three ways to play.

import { AVATARS, randomKidName } from '../engine/names'
import {
  createGuestSession,
  createHostSession,
  createLocalSession,
  type Profile,
} from '../net/session'
import type { Nav, Screen } from '../main'
import { h } from './dom'
import { sound } from './sound'

const LOGO_COLORS = ['#ff4d6d', '#ff9f1c', '#ffd23e', '#2ecc71', '#2e9bff', '#9257ff', '#e0408f']

function logo(): HTMLElement {
  const make = (word: string, offset: number) => {
    const row = h('div', { class: 'logo-row' })
    ;[...word].forEach((ch, i) => {
      row.append(
        h(
          'span',
          {
            class: 'lt',
            style: `--i:${offset + i};color:${LOGO_COLORS[(offset + i) % LOGO_COLORS.length]}`,
          },
          ch,
        ),
      )
    })
    return row
  }
  return h(
    'div',
    { class: 'logo' },
    h('div', { class: 'logo-line' }, h('span', { class: 'logo-deco' }, '🐍'), make('SNAKES', 0)),
    h(
      'div',
      { class: 'logo-line' },
      h('span', { class: 'logo-amp' }, '&'),
      make('LADDERS', 7),
      h('span', { class: 'logo-deco flip' }, '🪜'),
    ),
  )
}

export function homeScreen(nav: Nav, joinCode?: string): Screen {
  let avatarIdx = Math.max(0, AVATARS.indexOf(localStorage.getItem('snl.avatar') as never))
  const placeholder = randomKidName()

  const avatarBig = h('div', { class: 'avatar-big' }, AVATARS[avatarIdx])
  const nameInput = h('input', {
    class: 'name-input',
    maxlength: '14',
    placeholder,
    value: localStorage.getItem('snl.name') ?? '',
    'aria-label': 'Your name',
  }) as HTMLInputElement

  function cycle(dir: number) {
    sound.tap()
    avatarIdx = (avatarIdx + dir + AVATARS.length) % AVATARS.length
    avatarBig.textContent = AVATARS[avatarIdx]
    avatarBig.classList.remove('swap')
    void avatarBig.offsetWidth
    avatarBig.classList.add('swap')
  }

  function profile(): Profile {
    const name = nameInput.value.trim() || placeholder
    localStorage.setItem('snl.name', name)
    localStorage.setItem('snl.avatar', AVATARS[avatarIdx])
    return { name, avatar: AVATARS[avatarIdx] }
  }

  const codeInput = h('input', {
    class: 'code-input',
    maxlength: '4',
    placeholder: 'CODE',
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Room code',
  }) as HTMLInputElement
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '')
  })

  const joinRow = h(
    'div',
    { class: 'join-row hidden' },
    codeInput,
    h('button', { class: 'btn btn-purple', onClick: () => joinNow(codeInput.value) }, 'GO!'),
  )

  function joinNow(code: string) {
    if (code.length !== 4) {
      codeInput.focus()
      codeInput.classList.add('nope')
      setTimeout(() => codeInput.classList.remove('nope'), 400)
      return
    }
    sound.tap()
    nav.lobby(createGuestSession(code, profile()))
  }

  const menu = h(
    'div',
    { class: 'menu' },
    joinCode &&
      h(
        'button',
        { class: 'btn btn-big btn-green', onClick: () => joinNow(joinCode) },
        `🚀 Join room ${joinCode}`,
      ),
    h(
      'button',
      {
        class: 'btn btn-big btn-red',
        onClick: () => {
          sound.tap()
          nav.lobby(createLocalSession(profile()))
        },
      },
      '🎮 Play on this device',
    ),
    h(
      'button',
      {
        class: 'btn btn-big btn-blue',
        onClick: () => {
          sound.tap()
          nav.lobby(createHostSession(profile()))
        },
      },
      '🌐 Create online room',
    ),
    h(
      'button',
      {
        class: 'btn btn-big btn-yellow',
        onClick: () => {
          sound.tap()
          joinRow.classList.toggle('hidden')
          if (!joinRow.classList.contains('hidden')) codeInput.focus()
        },
      },
      '🔑 Join with a code',
    ),
    joinRow,
  )

  const el = h(
    'div',
    { class: 'screen screen-home' },
    logo(),
    h('p', { class: 'tagline' }, 'Climb the ladders… dodge the sssnakes! 🎲'),
    h(
      'div',
      { class: 'hero-card' },
      h('div', { class: 'hero-label' }, 'Pick your hero!'),
      h(
        'div',
        { class: 'avatar-picker' },
        h('button', { class: 'av-btn', 'aria-label': 'Previous hero', onClick: () => cycle(-1) }, '‹'),
        avatarBig,
        h('button', { class: 'av-btn', 'aria-label': 'Next hero', onClick: () => cycle(1) }, '›'),
      ),
      nameInput,
    ),
    menu,
    h(
      'p',
      { class: 'foot' },
      'Up to 4 friends • No servers, no sign-ups — just magic ✨',
    ),
  )

  return { el, dispose() {} }
}
