// Fun identity bits shared by UI and sessions.

export const AVATARS = ['🦊', '🐸', '🦄', '🐼', '🐙', '🐵', '🐷', '🦁', '🐰', '🐯', '🐨', '🐢'] as const

export const SEAT_COLORS = ['#ff4d6d', '#2e9bff', '#2ecc71', '#ffab00'] as const
export const SEAT_NAMES = ['Red', 'Blue', 'Green', 'Yellow'] as const

const BOT_NAMES = [
  'Slidey Sam',
  'Ladder Lucy',
  'Hissy Henry',
  'Climby Cleo',
  'Bouncy Bo',
  'Lucky Lila',
  'Sir Slithers',
  'Zoomy Zed',
]

const KID_NAMES = ['Super Star', 'Rocket', 'Sparkle', 'Tiger', 'Turbo', 'Bubbles', 'Ziggy', 'Pixie']

export function randomBotName(taken: string[] = []): string {
  const free = BOT_NAMES.filter((n) => !taken.includes(n))
  const pool = free.length ? free : BOT_NAMES
  return pool[Math.floor(Math.random() * pool.length)]
}

export function randomKidName(): string {
  return KID_NAMES[Math.floor(Math.random() * KID_NAMES.length)]
}

export function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)]
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ' // no I, O, Q — easy to read aloud

export function makeRoomCode(): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return code
}
