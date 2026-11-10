// Level progress belongs to an account. Each account has its own on this computer,
// and when the account server supports it, the same progress follows the account
// to other computers.
//
//   GET {server}/me/progress   Authorization: Bearer <token>
//        → 200 { stats, unlocks, redeemed, updatedAt }   (fields may be empty for a new account)
//        → 404 when the server does not keep progress (Takode then keeps it on this computer only)
//   PUT {server}/me/progress   same body → 200 or 204
//
// stats = { input, output, cacheRead, cacheWrite, replies, xp, since }. The newest
// stats win (updatedAt); unlocks and redeemed codes from both sides are kept.
import type { RedeemedCode } from './auth'
import { EMPTY_STATS, MAX_LEVEL, xpForLevel, type UsageStats } from './level'

export interface Progress {
  stats: UsageStats
  /** Rewards from redeem codes, as "kind:id". */
  unlocks: string[]
  redeemed: RedeemedCode[]
  /** Last change (ms); 0 = never changed. */
  updatedAt: number
}

export const emptyProgress = (): Progress => ({ stats: EMPTY_STATS(), unlocks: [], redeemed: [], updatedAt: 0 })

/** One account on one server. */
export const accountKey = (server: string, accountId: string): string => `${server}|${accountId}`

const num = (v: unknown, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : 0

/** Keeps only what Takode understands from a server reply; null when it is not progress at all. */
export function toProgress(data: any): Progress | null {
  if (!data || typeof data !== 'object') return null
  const s = data.stats ?? {}
  const stats: UsageStats = {
    input: num(s.input),
    output: num(s.output),
    cacheRead: num(s.cacheRead),
    cacheWrite: num(s.cacheWrite),
    replies: num(s.replies),
    // Never beyond what level 100 needs, whatever the server says.
    xp: num(s.xp, Math.ceil(xpForLevel(MAX_LEVEL) * 1.5)),
    since: num(s.since) || Date.now()
  }
  const unlocks = Array.isArray(data.unlocks) ? data.unlocks.filter((u: unknown): u is string => typeof u === 'string' && /^[a-z]+:[\w#-]{1,40}$/.test(u)) : []
  const redeemed = Array.isArray(data.redeemed)
    ? data.redeemed
        .filter((r: any) => typeof r?.code === 'string')
        .map((r: any) => ({ code: String(r.code).slice(0, 64), at: num(r.at), xp: num(r.xp), unlocks: Array.isArray(r.unlocks) ? r.unlocks.filter((u: unknown) => typeof u === 'string') : [], message: typeof r.message === 'string' ? r.message : undefined }))
    : []
  return { stats, unlocks, redeemed, updatedAt: num(data.updatedAt) }
}

/** Newest stats win; unlocks and redeemed codes from both are kept. */
export function mergeProgress(local: Progress, remote: Progress): Progress {
  const newer = remote.updatedAt > local.updatedAt ? remote : local
  const codes = new Map<string, RedeemedCode>()
  for (const r of [...remote.redeemed, ...local.redeemed]) if (!codes.has(r.code)) codes.set(r.code, r)
  return {
    stats: { ...newer.stats },
    unlocks: [...new Set([...local.unlocks, ...remote.unlocks])],
    redeemed: [...codes.values()].sort((a, b) => b.at - a.at),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt)
  }
}

export const sameProgress = (a: Progress, b: Progress): boolean => JSON.stringify(a) === JSON.stringify(b)
