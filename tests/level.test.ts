import { activeXp } from '../src/shared/level'
import { describe, expect, it } from 'vitest'
import { parseStreamLine } from '../src/main/claude'
import { compact, estimateTokens, levelColor, levelFor, MAX_LEVEL, tierOf, usageFrom, xpForLevel, xpOf } from '../src/shared/level'

describe('levels', () => {
  it('gets steadily harder up to level 100', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(500_000)
    for (let n = 2; n < MAX_LEVEL; n++) {
      // Each level needs more XP than the one before it.
      expect(xpForLevel(n + 1) - xpForLevel(n)).toBeGreaterThan(xpForLevel(n) - xpForLevel(n - 1))
    }
    expect(MAX_LEVEL).toBe(100)
    expect(xpForLevel(10)).toBeGreaterThan(70_000_000)
    expect(xpForLevel(100)).toBeGreaterThan(19_000_000_000)
    expect(xpForLevel(100)).toBeLessThan(20_000_000_000)
  })

  it('finds the level and progress for an XP total', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, progress: 0, maxed: false })
    expect(levelFor(250_000).progress).toBeCloseTo(0.5)
    expect(levelFor(xpForLevel(10)).level).toBe(10)
    expect(levelFor(xpForLevel(10) - 1).level).toBe(9)
    expect(levelFor(1e13)).toMatchObject({ level: 100, maxed: true, progress: 1 })
    // Raising the cap later keeps counting on the same curve.
    expect(levelFor(1e14, 150).level).toBeGreaterThan(100)
  })

  it('names a tier every ten levels and gives each level its own colour', () => {
    expect([1, 9, 10, 25, 50, 79, 80, 99, 100].map(tierOf)).toEqual([
      'hatchling', 'hatchling', 'swimmer', 'explorer', 'captain', 'kraken', 'leviathan', 'abyss', 'legend'
    ])
    const colours = new Set(Array.from({ length: 100 }, (_, i) => levelColor(i + 1).main))
    expect(colours.size).toBe(100)
  })
})

describe('tokens', () => {
  const raw = { input_tokens: 9, cache_creation_input_tokens: 30_837, cache_read_input_tokens: 10_000, output_tokens: 38 }

  it('reads the usage Claude Code reports and turns it into XP', () => {
    const usage = usageFrom(raw)!
    expect(usage).toEqual({ input: 9, output: 38, cacheRead: 10_000, cacheWrite: 30_837 })
    expect(xpOf(usage)).toBe(9 + 38 + 30_837 + 1_000)
    expect(usageFrom(null)).toBeNull()
  })

  it('attaches the usage to the end-of-reply item', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 900, usage: raw })
    expect(parseStreamLine(line).items[0].tokens).toEqual({ input: 9, output: 38, cacheRead: 10_000, cacheWrite: 30_837 })
  })

  it('writes big numbers short and estimates what is being typed', () => {
    expect([999, 1234, 45_600, 3_400_000, 1_500_000_000].map(compact)).toEqual(['999', '1.2K', '45.6K', '3.4M', '1.5B'])
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('Add a dark mode toggle')).toBe(6)
    expect(estimateTokens('เพิ่มปุ่มสลับโหมดมืด')).toBe(10)
  })
})

describe('levels need an account', () => {
  it('counts no XP for a guest but keeps the saved XP for later', () => {
    expect(activeXp({ auth: { mode: 'guest' }, stats: { xp: 5_000_000 } })).toBe(0)
    expect(activeXp({ auth: { mode: 'account' }, stats: { xp: 5_000_000 } })).toBe(5_000_000)
  })
})
