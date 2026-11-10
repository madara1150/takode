import { describe, expect, it } from 'vitest'
import { iconDef, iconsUnlockedAt, REPO_ICONS, repoIcon, unlockedIconCount } from '../src/shared/repoIcon'

describe('repository icons', () => {
  it('has lots of icons with unique ids and valid paths', () => {
    expect(REPO_ICONS.length).toBeGreaterThanOrEqual(55)
    expect(new Set(REPO_ICONS.map((d) => d.id)).size).toBe(REPO_ICONS.length)
    for (const d of REPO_ICONS) expect(d.path).toMatch(/^M[\d.\s\-]/)
    expect(REPO_ICONS.every((d) => !/NaN|Infinity/.test(d.path))).toBe(true)
  })
  it('unlocks a few at the start, more as you level up, and the legend at 100', () => {
    expect(unlockedIconCount(1)).toBe(6)
    expect(unlockedIconCount(50)).toBeGreaterThan(unlockedIconCount(10))
    expect(unlockedIconCount(100)).toBe(REPO_ICONS.length)
    expect(iconsUnlockedAt(100).map((d) => d.id)).toContain('legend')
    // Never more than three levels without a new icon.
    const levels = [...new Set(REPO_ICONS.map((d) => d.level))].sort((a, b) => a - b)
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(3)
  })
  it('picks a starter shape automatically and keeps a chosen one', () => {
    expect(iconDef(repoIcon({ id: 'abc' }).shape).level).toBe(1)
    expect(repoIcon({ id: 'abc', icon: { shape: 'kraken', level: 7 } })).toEqual({ shape: 'kraken', level: 7 })
    expect(repoIcon({ id: 'abc', icon: { shape: 'nope', level: 500 } }).shape).not.toBe('nope')
  })
})
