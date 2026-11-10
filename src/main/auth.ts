// Signs in to the account server and keeps the session token encrypted on disk.
// The password is only sent to the server and never stored.
import { safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { AUTH_PATHS, normalizeCode, toAccount, toRedeemReward, type Account, type RedeemReward } from '../shared/auth'

let tokenFile = ''
let memoryToken: string | null = null

export function initAuth(file: string): void {
  tokenFile = file
}

function saveToken(token: string | null): void {
  memoryToken = token
  if (!token) return rmSync(tokenFile, { force: true })
  // Without OS encryption the token stays in memory only and the user signs in again next time.
  if (safeStorage.isEncryptionAvailable()) writeFileSync(tokenFile, safeStorage.encryptString(token), { mode: 0o600 })
}

function loadToken(): string | null {
  if (memoryToken) return memoryToken
  if (!existsSync(tokenFile) || !safeStorage.isEncryptionAvailable()) return null
  try {
    memoryToken = safeStorage.decryptString(readFileSync(tokenFile))
  } catch {
    rmSync(tokenFile, { force: true })
  }
  return memoryToken
}

async function request(
  server: string,
  path: string,
  opts: { body?: unknown; token?: string; method?: string; errors?: Record<number, string> } = {}
): Promise<any> {
  let res: Response
  try {
    res = await fetch(server + path, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: {
        Accept: 'application/json',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15_000)
    })
  } catch {
    throw new Error('AUTH_OFFLINE')
  }
  const data = await res.json().catch(() => ({}))
  if (opts.errors?.[res.status]) throw new Error(opts.errors[res.status])
  if (res.status === 401) throw new Error('AUTH_INVALID')
  if (res.status === 409) throw new Error('AUTH_EXISTS')
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Server answered ${res.status}`)
  return data
}

function session(data: any): { token: string; account: Account } {
  const account = toAccount(data?.account)
  if (typeof data?.token !== 'string' || !data.token || !account) throw new Error('AUTH_BAD_REPLY')
  return { token: data.token, account }
}

export async function login(server: string, email: string, password: string): Promise<Account> {
  const s = session(await request(server, AUTH_PATHS.login, { body: { email: email.trim(), password } }))
  saveToken(s.token)
  return s.account
}

export async function register(server: string, name: string, email: string, password: string): Promise<Account> {
  const s = session(await request(server, AUTH_PATHS.register, { body: { name: name.trim(), email: email.trim(), password } }))
  saveToken(s.token)
  return s.account
}

/**
 * Checks the saved session. Returns the fresh account, null if the server says
 * the session is over, or undefined if the server cannot be reached (stay signed in).
 */
export async function restore(server: string): Promise<Account | null | undefined> {
  const token = loadToken()
  if (!token) return null
  try {
    return toAccount((await request(server, AUTH_PATHS.me, { token }))?.account)
  } catch (err) {
    if ((err as Error).message === 'AUTH_INVALID') {
      saveToken(null)
      return null
    }
    return undefined
  }
}

export async function logout(server: string): Promise<void> {
  const token = loadToken()
  saveToken(null)
  if (token && server) await request(server, AUTH_PATHS.logout, { method: 'POST', token }).catch(() => undefined)
}

/** Asks the server what a code gives. The server decides and remembers who used it. */
export async function redeem(server: string, code: string): Promise<RedeemReward> {
  const token = loadToken()
  if (!token) throw new Error('REDEEM_SIGN_IN')
  const data = await request(server, AUTH_PATHS.redeem, {
    body: { code: normalizeCode(code) },
    token,
    errors: { 400: 'REDEEM_INVALID', 404: 'REDEEM_INVALID', 409: 'REDEEM_USED', 410: 'REDEEM_EXPIRED', 429: 'REDEEM_SLOW_DOWN' }
  })
  const reward = toRedeemReward(data)
  if (!reward.xp && !reward.unlocks.length && !reward.message) throw new Error('AUTH_BAD_REPLY')
  return reward
}

/** The account's progress on the server; null when the server does not keep progress (404). */
export async function fetchProgress(server: string): Promise<unknown | null> {
  const token = loadToken()
  if (!token) return null
  try {
    return await request(server, AUTH_PATHS.progress, { token, errors: { 404: 'NOT_SUPPORTED', 405: 'NOT_SUPPORTED', 501: 'NOT_SUPPORTED' } })
  } catch (err) {
    if ((err as Error).message === 'NOT_SUPPORTED') return null
    throw err
  }
}

export async function saveProgress(server: string, progress: unknown): Promise<boolean> {
  const token = loadToken()
  if (!token) return false
  try {
    await request(server, AUTH_PATHS.progress, { method: 'PUT', body: progress, token, errors: { 404: 'NOT_SUPPORTED', 405: 'NOT_SUPPORTED', 501: 'NOT_SUPPORTED' } })
    return true
  } catch {
    return false
  }
}
