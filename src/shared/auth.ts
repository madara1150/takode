// Accounts. Takode talks to your own server with the small JSON API below;
// until there is one, people can use the app without an account.
//
//   POST {server}/auth/register  { name, email, password } → 201 { token, account }   409 if the email is taken
//   POST {server}/auth/login     { email, password }       → 200 { token, account }   401 if wrong
//   GET  {server}/auth/me        Authorization: Bearer <token> → 200 { account }     401 if the token is no longer valid
//   POST {server}/auth/logout    Authorization: Bearer <token> → 204
//   GET/PUT {server}/me/progress  level progress of the account (see shared/progress.ts)
//   POST {server}/redeem         Authorization: Bearer <token>, { code }
//        → 200 { xp?, unlocks?: ["effect:rgbFrame", "theme:abyss", ...], message? }
//        404 unknown code · 409 already used by this account · 410 expired or used up
//
// account = { id, name, email, avatarUrl? }. Errors may carry { error: "message" }.

export interface Account {
  id: string
  name: string
  email: string
  avatarUrl?: string
}

export interface AuthState {
  /** signedOut shows the login screen; guest uses the app without an account. */
  mode: 'signedOut' | 'guest' | 'account'
  account?: Account
  /** Base address of the account server, e.g. https://api.example.com */
  server: string
}

export const AUTH_PATHS = {
  register: '/auth/register',
  login: '/auth/login',
  me: '/auth/me',
  logout: '/auth/logout',
  redeem: '/redeem',
  progress: '/me/progress'
} as const

/** What a redeemed code gives. */
export interface RedeemReward {
  xp: number
  /** "kind:id" from shared/rewards.ts, e.g. "effect:rgbFrame". */
  unlocks: string[]
  message?: string
}

export interface RedeemedCode extends RedeemReward {
  code: string
  at: number
}

const UNLOCK = /^(theme|accent|ring|effect|title):[\w#-]{1,40}$/
/** Most XP one code may give, so a typo on the server cannot jump straight to the top. */
export const MAX_REDEEM_XP = 50_000_000_000

/** Keeps only what Takode understands from the server's answer. */
export function toRedeemReward(data: any): RedeemReward {
  const xp = Number(data?.xp)
  return {
    xp: Number.isFinite(xp) && xp > 0 ? Math.min(Math.round(xp), MAX_REDEEM_XP) : 0,
    unlocks: Array.isArray(data?.unlocks) ? [...new Set(data.unlocks.filter((u: unknown) => typeof u === 'string' && UNLOCK.test(u)))] as string[] : [],
    message: typeof data?.message === 'string' ? data.message.slice(0, 300) : undefined
  }
}

/** Codes are compared without spaces or case: "  welcome-500 " = "WELCOME-500". */
export const normalizeCode = (code: string): string => code.replace(/\s+/g, '').toUpperCase()

/**
 * Cleans up a server address. Passwords are only sent over HTTPS, except to
 * this computer (localhost) while developing. Returns null when unusable.
 */
export function normalizeServer(input: string): string | null {
  const text = input.trim().replace(/\/+$/, '')
  if (!text) return null
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.toString().replace(/\/+$/, '')
  return null
}

export const isEmail = (text: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())

export const PASSWORD_MIN = 8

/** Reads an account object from a server reply, ignoring anything unexpected. */
export function toAccount(raw: any): Account | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.email !== 'string') return null
  return {
    id: raw.id,
    email: raw.email,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : raw.email.split('@')[0],
    avatarUrl: typeof raw.avatarUrl === 'string' && /^https:\/\//.test(raw.avatarUrl) ? raw.avatarUrl : undefined
  }
}
