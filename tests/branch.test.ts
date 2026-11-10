import { groupByStatus, statusGroup } from '../src/shared/branch'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as g from '../src/main/git'
import { branchState, pickPr } from '../src/shared/branch'

describe('branch status', () => {
  const pr = (state: string, isDraft = false) => ({ number: 7, state, url: 'https://github.com/o/r/pull/7', isDraft })

  it('follows the pull request when there is one', () => {
    expect(branchState(true, pr('MERGED'))).toBe('merged')
    expect(branchState(true, pr('OPEN'))).toBe('open')
    expect(branchState(true, pr('OPEN', true))).toBe('draft')
    expect(branchState(false, pr('CLOSED'))).toBe('closed')
  })

  it('is pushed or local without a pull request', () => {
    expect(branchState(true, null)).toBe('pushed')
    expect(branchState(false, null)).toBe('local')
  })

  it('prefers an open pull request, then a merged one', () => {
    expect(pickPr([pr('CLOSED'), pr('MERGED'), pr('OPEN')])?.state).toBe('OPEN')
    expect(pickPr([pr('CLOSED'), pr('MERGED')])?.state).toBe('MERGED')
    expect(pickPr([])).toBeNull()
  })

  it('sees whether the branch is on the remote and what is not pushed', async () => {
    const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'takode-branch-')))
    const sh = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
    try {
      const repo = path.join(tmp, 'demo')
      const bare = path.join(tmp, 'origin.git')
      execFileSync('git', ['init', '-q', '-b', 'main', repo])
      execFileSync('git', ['init', '-q', '--bare', bare])
      sh(repo, 'config', 'user.name', 'Test')
      sh(repo, 'config', 'user.email', 'test@localhost')
      sh(repo, 'remote', 'add', 'origin', bare)
      writeFileSync(path.join(repo, 'a.txt'), 'one\n')
      sh(repo, 'add', '-A')
      sh(repo, 'commit', '-q', '-m', 'Initial commit')

      expect(await g.remoteStatus(repo, 'origin', 'main')).toEqual({ onRemote: false, ahead: 0 })
      await g.pushBranch(repo, 'main')
      expect(await g.remoteStatus(repo, 'origin', 'main')).toEqual({ onRemote: true, ahead: 0 })
      writeFileSync(path.join(repo, 'a.txt'), 'two\n')
      sh(repo, 'commit', '-q', '-am', 'Second')
      expect(await g.remoteStatus(repo, 'origin', 'main')).toEqual({ onRemote: true, ahead: 1 })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('grouping chats by status', () => {
  it('puts draft and open pull requests together and unchecked ones with local', () => {
    expect(statusGroup({ state: 'draft' })).toBe('pr')
    expect(statusGroup({ state: 'open' })).toBe('pr')
    expect(statusGroup(undefined)).toBe('local')
  })
  it('lists groups in order and skips empty ones', () => {
    const ws = [
      { id: 'a', git: { state: 'merged' as const } },
      { id: 'b' },
      { id: 'c', git: { state: 'open' as const } },
      { id: 'd', git: { state: 'local' as const } }
    ]
    expect(groupByStatus(ws).map((g) => [g.group, g.items.map((w) => w.id)])).toEqual([
      ['local', ['b', 'd']],
      ['pr', ['c']],
      ['merged', ['a']]
    ])
  })
})
