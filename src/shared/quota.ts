// Claude usage limits, as Claude Code reports them with each reply.

export interface QuotaWindow {
  /** "five_hour", "seven_day", ... */
  key: string
  /** Share of the limit used, 0 to 1. */
  used: number
  /** When this window starts over (ms since epoch). */
  resetsAt: number
}

export interface Quota {
  windows: QuotaWindow[]
  /** False when Claude is currently refusing requests because a limit was hit. */
  allowed: boolean
  updatedAt: number
}

const ORDER = ['five_hour', 'seven_day']

/** Reads the `rate_limit_info` of a stream-json "rate_limit_event". */
export function parseQuota(info: any, now = Date.now()): Quota | null {
  const raw = info?.unifiedWindows
  if (!raw || typeof raw !== 'object') return null
  const windows = Object.entries(raw as Record<string, any>)
    .filter(([, w]) => typeof w?.utilization === 'number' && typeof w?.resetsAt === 'number')
    .map(([key, w]) => ({ key, used: Math.max(0, Math.min(1, w.utilization)), resetsAt: w.resetsAt * 1000 }))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.key)
      const ib = ORDER.indexOf(b.key)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.key.localeCompare(b.key)
    })
  return windows.length ? { windows, allowed: info.status !== 'rejected', updatedAt: now } : null
}

/** A window whose reset time has passed starts again from zero. */
export const usedNow = (w: QuotaWindow, now = Date.now()): number => (now >= w.resetsAt ? 0 : w.used)

export function quotaLevel(used: number): 'ok' | 'warn' | 'high' {
  return used >= 0.85 ? 'high' : used >= 0.6 ? 'warn' : 'ok'
}

/** "2h 10m", "45m" or "3d 4h" until `resetsAt`; empty once it has passed. */
export function timeLeft(resetsAt: number, now = Date.now()): { days: number; hours: number; minutes: number } | null {
  const ms = resetsAt - now
  if (ms <= 0) return null
  const total = Math.ceil(ms / 60_000)
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 }
}
