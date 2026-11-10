import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stripAiAttribution } from '../src/shared/attribution'
import { MAX_REDEEM_XP, normalizeCode, toRedeemReward } from '../src/shared/auth'
import { isUnlocked, setExtraUnlocks } from '../src/shared/rewards'
import { parseSkill, SkillStore, slugify } from '../src/main/skills'

describe('redeem codes', () => {
  afterEach(() => setExtraUnlocks([]))
  it('keeps only rewards Takode understands', () => {
    expect(toRedeemReward({ xp: 500000, unlocks: ['effect:rgbFrame', 'bad', 'theme:abyss', 'effect:rgbFrame', 3], message: 'hi' })).toEqual({
      xp: 500000,
      unlocks: ['effect:rgbFrame', 'theme:abyss'],
      message: 'hi'
    })
    expect(toRedeemReward({ xp: -5 }).xp).toBe(0)
    expect(toRedeemReward({ xp: 1e15 }).xp).toBe(MAX_REDEEM_XP)
  })
  it('ignores spaces and case in codes', () => {
    expect(normalizeCode('  welcome 500 ')).toBe('WELCOME500')
  })
  it('redeemed rewards count as unlocked at any level', () => {
    expect(isUnlocked('effect', 'rgbFrame', 1)).toBe(false)
    setExtraUnlocks(['effect:rgbFrame'])
    expect(isUnlocked('effect', 'rgbFrame', 1)).toBe(true)
    expect(isUnlocked('ring', 'rgb', 1)).toBe(false)
  })
})

describe('skills', () => {
  const root = (): string => mkdtempSync(path.join(os.tmpdir(), 'takode-skills-'))
  it('reads SKILL.md front matter', () => {
    expect(parseSkill('---\nname: thai\ndescription: "Use for Thai"\n---\n# Hi')).toEqual({ name: 'thai', description: 'Use for Thai', body: '# Hi' })
    expect(slugify('Review Thai Copy!')).toBe('review-thai-copy')
  })
  it('saves, lists, turns off and on, and builds a plugin only when something is on', () => {
    const dir = root()
    const store = new SkillStore(dir)
    expect(store.pluginDir()).toBeNull()
    const slug = store.save({ name: 'Thai copy', description: 'Use when writing Thai UI text', body: 'Write naturally.' })
    expect(slug).toBe('thai-copy')
    expect(readFileSync(path.join(dir, 'skills', slug, 'SKILL.md'), 'utf8')).toContain('name: thai-copy')
    expect(JSON.parse(readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).name).toBe('takode')
    expect(store.pluginDir()).toBe(dir)
    store.setEnabled(slug, false)
    expect(store.list()[0].enabled).toBe(false)
    expect(store.pluginDir()).toBeNull()
    store.setEnabled(slug, true)
    store.save({ slug, name: '', description: 'Changed', body: 'New body' })
    expect(store.get(slug)).toEqual({ description: 'Changed', body: 'New body' })
    expect(store.save({ name: 'Thai copy', description: 'x', body: 'y' })).toBe('thai-copy-2')
  })
  it('imports a folder with its extra files', () => {
    const src = root()
    mkdirSync(path.join(src, 'scripts'))
    writeFileSync(path.join(src, 'SKILL.md'), '---\nname: pdf-tools\ndescription: Use for PDFs\n---\nRun scripts/x.sh')
    writeFileSync(path.join(src, 'scripts', 'x.sh'), 'echo')
    const store = new SkillStore(root())
    const slug = store.import(src)
    expect(store.list()).toEqual([{ slug, name: 'pdf-tools', description: 'Use for PDFs', enabled: true, extraFiles: 1 }])
  })
  it('refuses a skill without a description', () => {
    expect(() => new SkillStore(root()).save({ name: 'x', description: ' ', body: 'y' })).toThrow('SKILL_NEEDS_DESCRIPTION')
  })
})

describe('hide AI', () => {
  it('removes co-author and generated-with lines', () => {
    const msg = 'Add login\n\nDetails here.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n'
    expect(stripAiAttribution(msg)).toBe('Add login\n\nDetails here.')
    expect(stripAiAttribution('Co-Authored-By: Somchai <s@x.com>')).toBe('Co-Authored-By: Somchai <s@x.com>')
  })
})
