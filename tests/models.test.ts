import { describe, expect, it } from 'vitest'
import { parseStreamLine } from '../src/main/claude'
import { parsePrFeedback, parsePrUrl } from '../src/shared/feedback'
import { DEFAULT_MODELS, remapModel, resolveRun, syncModels, toAvailable } from '../src/shared/models'
import { feedbackPrompt } from '../src/shared/prompts'
import { DEFAULT_ACTIONS } from '../src/shared/types'

describe('model choice', () => {
  const settings = {
    model: 'opus',
    effort: 'medium' as const,
    permissionMode: 'acceptEdits' as const,
    models: DEFAULT_MODELS.map((m) => (m.id === 'haiku' ? { ...m, permission: 'plan' as const, effort: 'low' as const } : m))
  }

  it('uses the defaults when the workspace chose nothing', () => {
    expect(resolveRun(settings, {})).toEqual({ model: 'opus', effort: 'medium', permissionMode: 'acceptEdits' })
  })

  it("applies the chosen model's own limits", () => {
    expect(resolveRun(settings, { model: 'haiku' })).toEqual({ model: 'haiku', effort: 'low', permissionMode: 'plan' })
  })

  it('lets the workspace override effort, and plan mode always wins', () => {
    expect(resolveRun(settings, { model: 'haiku', effort: 'max' }).effort).toBe('max')
    expect(resolveRun({ ...settings, permissionMode: 'bypassPermissions' }, { planMode: true }).permissionMode).toBe('plan')
    expect(resolveRun(settings, { model: '' }).model).toBe('')
  })

  it('shows the plan Claude hands back in plan mode', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'ExitPlanMode', input: { plan: '1. Add footer' } }] }
    })
    expect(parseStreamLine(line).items.map((i) => [i.role, i.text])).toEqual([['assistant', '1. Add footer']])
  })
})

describe('pull request feedback', () => {
  const at = (h: number): string => `2026-11-10T0${h}:00:00Z`
  const data = {
    data: {
      repository: {
        pullRequest: {
          state: 'OPEN',
          reviewDecision: 'CHANGES_REQUESTED',
          reviews: {
            nodes: [
              { author: { login: 'mali' }, state: 'CHANGES_REQUESTED', body: 'Please rename this.', submittedAt: at(2) },
              { author: { login: 'mali' }, state: 'COMMENTED', body: '', submittedAt: at(2) }
            ]
          },
          comments: {
            nodes: [
              { author: { login: 'me' }, body: 'Ready for review', createdAt: at(1) },
              { author: { login: 'ci[bot]' }, body: 'Build passed', createdAt: at(3) },
              { author: { login: 'somchai' }, body: 'Can you add a test?', createdAt: at(4) }
            ]
          },
          reviewThreads: {
            nodes: [
              { isResolved: false, comments: { nodes: [{ author: { login: 'mali' }, body: 'Typo here', path: 'src/a.ts', line: 12, createdAt: at(2) }] } },
              { isResolved: true, comments: { nodes: [{ author: { login: 'mali' }, body: 'Done already', path: 'src/b.ts', line: 3, createdAt: at(2) }] } }
            ]
          }
        }
      }
    }
  }

  it('keeps unresolved feedback from other people', () => {
    const fb = parsePrFeedback(data, { self: 'me' })
    expect(fb.changesRequested).toBe(true)
    expect(fb.items.map((i) => i.body)).toEqual(['Please rename this.', 'Typo here', 'Can you add a test?'])
    expect(fb.items[1]).toMatchObject({ path: 'src/a.ts', line: 12 })
  })

  it('hides feedback that was already handed to Claude', () => {
    const fb = parsePrFeedback(data, { self: 'me', since: Date.parse(at(3)) })
    expect(fb.items.map((i) => i.body)).toEqual(['Can you add a test?'])
    expect(fb.changesRequested).toBe(false)
  })

  it('reads the pull request from its URL and writes the prompt', () => {
    expect(parsePrUrl('https://github.com/madara1150/multi-tasker/pull/7')).toEqual({ owner: 'madara1150', repo: 'multi-tasker', number: 7 })
    expect(parsePrUrl('https://example.com/x')).toBeNull()
    const prompt = feedbackPrompt(parsePrFeedback(data, { self: 'me' }).items, true, DEFAULT_ACTIONS)
    expect(prompt).toContain('2. @mali on src/a.ts:12:\nTypo here')
    expect(prompt).toContain('changes were requested')
  })
})

describe('models from Claude Code', () => {
  // Shape of the "initialize" reply's model list.
  const raw = [
    { value: 'default', resolvedModel: 'claude-opus-5-5', displayName: 'Default (recommended)', description: 'Opus 5.5 · Best for everyday, complex tasks', supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { value: 'claude-fable-5-1[1m]', resolvedModel: 'claude-fable-5-1', displayName: 'Fable', description: 'Fable 5.1 · Most capable', supportedEffortLevels: ['low', 'high', 'max'] },
    { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers' }
  ]
  const available = toAvailable(raw)

  it('names each model by its version', () => {
    expect(available.map((m) => [m.id, m.label, m.resolved, m.efforts.length])).toEqual([
      ['', 'Default · Opus 5.5', 'claude-opus-5-5', 5],
      ['claude-fable-5-1[1m]', 'Fable 5.1', 'claude-fable-5-1', 3],
      ['haiku', 'Haiku 4.5', 'claude-haiku-4-5-20251001', 0]
    ])
    expect(toAvailable(undefined)).toEqual([])
  })

  it('mirrors the account while the list is untouched', () => {
    const synced = syncModels(DEFAULT_MODELS, available, false)
    expect(synced.map((m) => m.label)).toEqual(['Default · Opus 5.5', 'Fable 5.1', 'Haiku 4.5'])
    expect(syncModels(DEFAULT_MODELS, [], false)).toBe(DEFAULT_MODELS)
  })

  it('keeps a customised list and only refreshes its details', () => {
    const mine = [{ ...DEFAULT_MODELS[3], label: 'Quick one', effort: 'low' as const }]
    const synced = syncModels(mine, available, true)
    expect(synced).toHaveLength(1)
    expect(synced[0]).toMatchObject({ label: 'Quick one', id: 'haiku', resolved: 'claude-haiku-4-5-20251001', efforts: [] })
  })

  it('drops an effort level the model does not have', () => {
    const models = syncModels(DEFAULT_MODELS, available, false)
    const settings = { model: '', effort: 'medium' as const, permissionMode: 'acceptEdits' as const, models }
    expect(resolveRun(settings, { model: 'haiku', effort: 'max' }).effort).toBe('')
    expect(resolveRun(settings, { model: 'claude-fable-5-1[1m]' }).effort).toBe('')
    expect(resolveRun(settings, { model: 'claude-fable-5-1[1m]', effort: 'max' }).effort).toBe('max')
  })

  it('finds a model saved under its full name', () => {
    const models = syncModels(DEFAULT_MODELS, available, false)
    expect(remapModel('claude-haiku-4-5-20251001', models)).toBe('haiku')
    expect(remapModel('claude-fable-5-1', models)).toBe('claude-fable-5-1[1m]')
    expect(remapModel('something-else', models)).toBe('something-else')
    expect(remapModel(undefined, models)).toBeUndefined()
  })
})
