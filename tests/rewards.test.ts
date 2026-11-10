import { describe, expect, it } from 'vitest'
import { MAX_LEVEL } from '../src/shared/level'
import { isUnlocked, LEVEL_UP_EFFECTS, nextRewards, REWARDS, rewardsAt, RING_STYLES, unlockLevel } from '../src/shared/rewards'
import { REWARD_ACCENTS, THEMES } from '../src/renderer/src/themes'

describe('rewards', () => {
  it('always has something within five levels', () => {
    const levels = [1, ...new Set(REWARDS.map((r) => r.level))]
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(5)
    expect(levels.at(-1)).toBe(MAX_LEVEL)
  })

  it('only promises things the app really has', () => {
    for (const r of REWARDS) {
      if (r.kind === 'theme') expect(THEMES.map((t) => t.id)).toContain(r.id)
      if (r.kind === 'accent') expect(REWARD_ACCENTS).toContain(r.id)
      if (r.kind === 'ring') expect(RING_STYLES).toContain(r.id)
      if (r.kind === 'effect') expect([...LEVEL_UP_EFFECTS, 'ripple', 'aura', 'rgbFrame']).toContain(r.id)
      expect(r.name.en && r.name.th).toBeTruthy()
    }
  })

  it('unlocks things at their level, and level 100 brings the RGB set', () => {
    expect(unlockLevel('theme', 'midnight')).toBe(0)
    expect(isUnlocked('theme', 'reef', 4)).toBe(false)
    expect(isUnlocked('theme', 'reef', 5)).toBe(true)
    expect(rewardsAt(100).map((r) => r.id)).toEqual(expect.arrayContaining(['rgb', 'fireworks', 'rgbFrame', 'legend']))
    expect(nextRewards(1)).toMatchObject({ level: 2 })
    expect(nextRewards(97)?.level).toBe(100)
    expect(nextRewards(100)).toBeNull()
  })
})
