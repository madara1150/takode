import { describe, expect, it } from 'vitest'
import { pullRequestArgs } from '../src/main/github'
import { fillTemplate, splitList, toBranchName } from '../src/shared/template'
import { agentPrompt, parsePrDraft } from '../src/shared/prompts'
import { DEFAULT_ACTIONS, normalizeRepo } from '../src/shared/types'

describe('templates', () => {
  it('fills known tokens and leaves unknown ones alone', () => {
    expect(fillTemplate('{user}/{date}-{name}', { user: 'mali', date: '2026-11-10', name: 'allegro' })).toBe(
      'mali/2026-11-10-allegro'
    )
    expect(fillTemplate('[{name}] {ticket}', { name: 'allegro' })).toBe('[allegro] {ticket}')
  })

  it('turns a filled pattern into a valid branch name', () => {
    expect(toBranchName('feature/Fix login bug!')).toBe('feature/Fix-login-bug')
    expect(toBranchName('/takode//allegro/')).toBe('takode/allegro')
    expect(toBranchName('a..b')).toBe('a.b')
  })

  it('splits comma lists', () => {
    expect(splitList(' mali, somchai ,,')).toEqual(['mali', 'somchai'])
  })
})

describe('repository settings', () => {
  it('gives older saved repositories the new defaults', () => {
    const repo = normalizeRepo({ id: '1', name: 'demo', path: '/demo', pr: { draft: true } as never })
    expect(repo.push).toEqual({ remote: 'origin', force: false, commitTemplate: 'Update {name}', pullMode: 'merge' })
    expect(repo.pr.draft).toBe(true)
    expect(repo.pr.openAfter).toBe(true)
    expect(repo.branchPattern).toBe('')
  })

  it('builds gh arguments from the pull request settings', () => {
    const base = { title: 'T', body: 'B', base: 'main', head: 'takode/allegro' }
    expect(pullRequestArgs(base)).toEqual(['pr', 'create', '--title', 'T', '--body', 'B', '--base', 'main', '--head', 'takode/allegro'])
    expect(pullRequestArgs({ ...base, draft: true, reviewers: ['mali', 'somchai'], labels: ['bug'] }).slice(-5)).toEqual([
      '--draft', '--reviewer', 'mali,somchai', '--label', 'bug'
    ])
  })
})

describe('action prompts', () => {
  const config = { ...DEFAULT_ACTIONS, review: 'Focus on security.' }

  it('adds the repository instructions to the built-in prompt', () => {
    const prompt = agentPrompt('review', 'main', config)
    expect(prompt).toContain('base branch `main`')
    expect(prompt).toContain('Additional instructions:\nFocus on security.')
    expect(agentPrompt('fixErrors', 'main', config)).not.toContain('Additional instructions')
  })

  it('reads a drafted pull request back as title and body', () => {
    expect(parsePrDraft('# Add dark mode\n\n## Summary\nToggle in header.')).toEqual({
      title: 'Add dark mode',
      body: '## Summary\nToggle in header.'
    })
  })

  it('gives saved repositories the default actions', () => {
    const repo = normalizeRepo({ id: '1', name: 'demo', path: '/demo' })
    expect(repo.actions.spotlight).toBe(true)
    expect(repo.actions.custom).toEqual([])
  })
})
