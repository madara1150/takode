import { describe, expect, it } from 'vitest'
import { emptyProgress, mergeProgress, toProgress } from '../src/shared/progress'

const p = (xp: number, updatedAt: number, unlocks: string[] = [], codes: string[] = []) => ({
  ...emptyProgress(),
  stats: { ...emptyProgress().stats, xp },
  unlocks,
  redeemed: codes.map((code, i) => ({ code, at: i, xp: 0, unlocks: [] })),
  updatedAt
})

describe('progress per account', () => {
  it('the newer stats win; unlocks and redeemed codes from both are kept', () => {
    const m = mergeProgress(p(100, 10, ['theme:reef'], ['A']), p(900, 20, ['effect:rgbFrame'], ['B', 'A']))
    expect(m.stats.xp).toBe(900)
    expect(m.unlocks.sort()).toEqual(['effect:rgbFrame', 'theme:reef'])
    expect(m.redeemed.map((r) => r.code).sort()).toEqual(['A', 'B'])
    expect(m.updatedAt).toBe(20)
    expect(mergeProgress(p(500, 30), p(900, 20)).stats.xp).toBe(500)
  })
  it('accepts an empty answer for a new account and cleans odd values', () => {
    const fresh = toProgress({ stats: null, unlocks: [], redeemed: [], updatedAt: 0 })!
    expect(fresh.stats.xp).toBe(0)
    const odd = toProgress({ stats: { xp: -5, input: 'x' }, unlocks: ['theme:reef', 7, 'DROP TABLE'], updatedAt: 3 })!
    expect(odd.stats.xp).toBe(0)
    expect(odd.unlocks).toEqual(['theme:reef'])
    expect(toProgress(null)).toBeNull()
  })
  it('never takes more XP than the top level needs', () => {
    expect(toProgress({ stats: { xp: 1e18 } })!.stats.xp).toBeLessThan(1e15)
  })
})
