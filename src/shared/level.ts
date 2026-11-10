// Levels earned by using Claude in Takode. Hard on purpose: each level needs
// a lot more than the last. MAX_LEVEL can be raised later; the curve continues.

export const MAX_LEVEL = 100

/** Tokens reported by Claude Code for one reply. */
export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface UsageStats extends TokenUsage {
  replies: number
  /** Experience points; see xpOf. */
  xp: number
  since: number
}

export const EMPTY_STATS = (): UsageStats => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, replies: 0, xp: 0, since: Date.now() })

/** Reads the `usage` block of a stream-json result. */
export function usageFrom(raw: any): TokenUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    input: n(raw.input_tokens),
    output: n(raw.output_tokens),
    cacheRead: n(raw.cache_read_input_tokens),
    cacheWrite: n(raw.cache_creation_input_tokens)
  }
}

/** Everything sent to Claude plus everything it wrote. */
export const totalTokens = (u: TokenUsage): number => u.input + u.output + u.cacheRead + u.cacheWrite

/** Cache reads cost about a tenth of other tokens, so they count a tenth. */
export const xpOf = (u: TokenUsage): number => Math.round(u.input + u.output + u.cacheWrite + u.cacheRead / 10)

const BASE = 500_000
const POWER = 2.3

/** XP needed in total to reach `level` (level 1 needs nothing). */
export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(BASE * Math.pow(level - 1, POWER))
}

export interface LevelInfo {
  level: number
  /** XP earned inside this level, and the size of the level. */
  into: number
  span: number
  /** 0..1 progress to the next level (1 at the top). */
  progress: number
  maxed: boolean
}

export function levelFor(xp: number, max = MAX_LEVEL): LevelInfo {
  let level = 1
  while (level < max && xp >= xpForLevel(level + 1)) level++
  const maxed = level >= max
  const start = xpForLevel(level)
  const span = maxed ? 1 : xpForLevel(level + 1) - start
  const into = maxed ? 1 : xp - start
  return { level, into, span, progress: maxed ? 1 : Math.min(1, into / span), maxed }
}

export type Tier =
  | 'hatchling'
  | 'swimmer'
  | 'explorer'
  | 'navigator'
  | 'diver'
  | 'captain'
  | 'admiral'
  | 'kraken'
  | 'leviathan'
  | 'abyss'
  | 'legend'

/** A new title every ten levels, and one of its own at the top. */
export const TIER_STARTS: { tier: Tier; level: number }[] = [
  { tier: 'hatchling', level: 1 },
  { tier: 'swimmer', level: 10 },
  { tier: 'explorer', level: 20 },
  { tier: 'navigator', level: 30 },
  { tier: 'diver', level: 40 },
  { tier: 'captain', level: 50 },
  { tier: 'admiral', level: 60 },
  { tier: 'kraken', level: 70 },
  { tier: 'leviathan', level: 80 },
  { tier: 'abyss', level: 90 },
  { tier: 'legend', level: 100 }
]

export function tierOf(level: number): Tier {
  let tier: Tier = 'hatchling'
  for (const t of TIER_STARTS) if (level >= t.level) tier = t.tier
  return tier
}

/**
 * Each level has a colour of its own. Hues step by the golden angle so
 * neighbouring levels look clearly different; colours get richer as levels rise.
 */
export function levelColor(level: number): { main: string; second: string } {
  const hue = Math.round((level * 137.508) % 360)
  const sat = Math.min(95, 62 + level * 0.33)
  const light = 66 - Math.min(10, level * 0.1)
  return {
    main: `hsl(${hue} ${sat}% ${light}%)`,
    second: `hsl(${(hue + 40) % 360} ${sat}% ${light - 8}%)`
  }
}

/** 1234 → "1.2K", 3_400_000 → "3.4M". */
export function compact(n: number): string {
  const abs = Math.abs(n)
  const fmt = (v: number, unit: string): string => `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`
  if (abs >= 1e9) return fmt(n / 1e9, 'B')
  if (abs >= 1e6) return fmt(n / 1e6, 'M')
  if (abs >= 1e3) return fmt(n / 1e3, 'K')
  return String(Math.round(n))
}

/** Rough token count for text being typed: about 4 characters per token, 2 for Thai and other non-Latin text. */
export function estimateTokens(text: string): number {
  if (!text.trim()) return 0
  const latin = text.replace(/[^\u0000-ɏ]/g, '').length
  const other = text.length - latin
  return Math.max(1, Math.round(latin / 4 + other / 2))
}

/**
 * XP that counts: levels belong to an account, so without one (guest) there is no
 * level, no XP and no rewards. Whatever was saved stays and comes back on sign-in.
 */
export const activeXp = (state: { auth: { mode: string }; stats: { xp: number } }): number =>
  state.auth.mode === 'account' ? state.stats.xp : 0
