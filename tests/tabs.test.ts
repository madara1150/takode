import { describe, expect, it } from 'vitest'
import { normalizeWorkspace, type Workspace } from '../src/shared/types'

describe('chat tabs', () => {
  const old = { id: 'ws1', repoId: 'r', name: 'allegro', branch: 'b', baseBranch: 'main', path: '/x', createdAt: 1, sessionId: 's1' }

  it('turns the chat of a workspace saved before tabs into its first tab', () => {
    const ws = normalizeWorkspace({ ...old } as unknown as Workspace)
    expect(ws.tabs).toEqual([{ id: 'ws1', title: '', sessionId: 's1' }])
    expect(ws.activeTab).toBe('ws1')
    expect(ws.sessionId).toBeUndefined()
  })

  it('keeps existing tabs and repairs a missing active tab', () => {
    const tabs = [
      { id: 'a', title: 'Fix login' },
      { id: 'b', title: '' }
    ]
    expect(normalizeWorkspace({ ...old, tabs, activeTab: 'b' } as unknown as Workspace).activeTab).toBe('b')
    expect(normalizeWorkspace({ ...old, tabs, activeTab: 'gone' } as unknown as Workspace).activeTab).toBe('a')
  })
})
