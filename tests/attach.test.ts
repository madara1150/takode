import { describe, expect, it } from 'vitest'
import { activeMention, buildPrompt, insertMention, mentionsIn, rankFiles, safeName, splitMentions } from '../src/shared/attach'

describe('@file mentions', () => {
  it('finds paths and ignores emails', () => {
    expect(mentionsIn('fix @app/main.js and @src/a.ts, mail me@x.com')).toEqual(['app/main.js', 'src/a.ts'])
    expect(mentionsIn('(see @README.md)')).toEqual(['README.md'])
  })
  it('knows the mention being typed', () => {
    expect(activeMention('look at @app/ma', 15)).toEqual({ start: 8, query: 'app/ma' })
    expect(activeMention('hello @', 7)).toEqual({ start: 6, query: '' })
    expect(activeMention('a@b', 3)).toBeNull()
    expect(activeMention('@x done', 7)).toBeNull()
  })
  it('replaces the typed part with the chosen path', () => {
    expect(insertMention('fix @ma please', 7, 'app/main.js')).toEqual({ text: 'fix @app/main.js please', caret: 17 })
    expect(insertMention('@', 1, 'a.ts')).toEqual({ text: '@a.ts ', caret: 6 })
  })
  it('splits text for display', () => {
    expect(splitMentions('see @a.ts now')).toEqual([{ text: 'see ' }, { text: '@a.ts', mention: true }, { text: ' now' }])
  })
})

describe('rankFiles', () => {
  const files = ['src/app/main.ts', 'app/xxx.js', 'docs/main-guide.md', 'tests/maintain.test.ts', 'package.json']
  it('puts file name matches first', () => {
    expect(rankFiles(files, 'main')[0]).toBe('src/app/main.ts')
    expect(rankFiles(files, 'app/x')).toEqual(['app/xxx.js'])
    expect(rankFiles(files, 'pkjs')).toEqual(['package.json'])
    expect(rankFiles(files, 'zzz')).toEqual([])
  })
})

describe('buildPrompt', () => {
  it('tells Claude where the files are', () => {
    const p = buildPrompt('read this', [{ name: 'spec.pdf', path: '/x/ab-spec.pdf', size: 1 }], ['app/xxx.js'])
    expect(p).toContain('read this')
    expect(p).toContain('/x/ab-spec.pdf')
    expect(p).toContain('- app/xxx.js')
    expect(buildPrompt('hi', [], [])).toBe('hi')
  })
  it('makes names safe', () => {
    expect(safeName('../a/b:c.txt')).toBe('_a_b_c.txt')
  })
})
