import { describe, expect, it } from 'vitest'
import { parseStreamLine } from '../src/main/claude'
import { parseQuota, quotaLevel, timeLeft, usedNow } from '../src/shared/quota'

// What Claude Code sends with a reply.
const info = {
  status: 'allowed',
  resetsAt: 1794289800,
  rateLimitType: 'five_hour',
  unifiedWindows: {
    seven_day: { utilization: 0.1, resetsAt: 1794740400 },
    five_hour: { utilization: 0.14, resetsAt: 1794289800 }
  }
}

describe('claude usage', () => {
  it('reads each limit with its reset time, shortest window first', () => {
    const quota = parseQuota(info, 1000)!
    expect(quota).toMatchObject({ allowed: true, updatedAt: 1000 })
    expect(quota.windows).toEqual([
      { key: 'five_hour', used: 0.14, resetsAt: 1794289800000 },
      { key: 'seven_day', used: 0.1, resetsAt: 1794740400000 }
    ])
    expect(parseQuota({ ...info, status: 'rejected' })!.allowed).toBe(false)
    expect(parseQuota({})).toBeNull()
  })

  it('comes out of the reply stream', () => {
    const parsed = parseStreamLine(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: info, session_id: 's' }))
    expect(parsed.items).toEqual([])
    expect(parsed.quota?.windows[0].used).toBe(0.14)
  })

  it('counts a window as empty once its reset time has passed', () => {
    const w = { key: 'five_hour', used: 0.9, resetsAt: 10_000 }
    expect(usedNow(w, 9_999)).toBe(0.9)
    expect(usedNow(w, 10_000)).toBe(0)
  })

  it('says how long until a reset and how full a limit is', () => {
    expect(timeLeft(130 * 60_000, 0)).toEqual({ days: 0, hours: 2, minutes: 10 })
    expect(timeLeft((2 * 1440 + 61) * 60_000, 0)).toEqual({ days: 2, hours: 1, minutes: 1 })
    expect(timeLeft(5, 10)).toBeNull()
    expect([0.2, 0.6, 0.85].map(quotaLevel)).toEqual(['ok', 'warn', 'high'])
  })
})
