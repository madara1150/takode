import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseStreamLine } from '../src/main/claude'
import * as g from '../src/main/git'

let tmp: string
let repo: string
let ws: string
const sh = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

beforeEach(async () => {
  tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'takode-test-')))
  repo = path.join(tmp, 'demo')
  ws = path.join(tmp, 'workspaces', 'allegro')
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  sh(repo, 'config', 'user.name', 'Test')
  sh(repo, 'config', 'user.email', 'test@localhost')
  writeFileSync(path.join(repo, 'a.txt'), 'one\n')
  sh(repo, 'add', '-A')
  sh(repo, 'commit', '-q', '-m', 'Initial commit')
  await g.createWorktree(repo, ws, 'takode/allegro', 'main')
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('workspaces', () => {
  it('creates a worktree on its own branch', async () => {
    expect(sh(ws, 'branch', '--show-current')).toBe('takode/allegro')
    expect(await g.branchExists(repo, 'takode/allegro')).toBe(true)
    expect((await g.repoInfo(repo)).baseBranch).toBe('main')
  })

  it('diffs committed, uncommitted and untracked changes against the base', async () => {
    writeFileSync(path.join(ws, 'a.txt'), 'one\ntwo\n')
    sh(ws, 'commit', '-q', '-am', 'Add two')
    writeFileSync(path.join(ws, 'a.txt'), 'one\ntwo\nthree\n')
    writeFileSync(path.join(ws, 'new file.txt'), 'hello\n')
    const files = await g.diffWorkspace(ws, 'main')
    expect(files.map((f) => [f.path, f.added, f.removed])).toEqual([
      ['a.txt', 2, 0],
      ['new file.txt', 1, 0]
    ])
    expect(files[0].patch).toContain('+three')
    // Looking at the diff must not stage anything in the workspace.
    expect(sh(ws, 'status', '--porcelain')).toBe('M a.txt\n?? "new file.txt"') // sh() trims the leading space of " M"
  })

  it('removes the worktree and optionally the branch', async () => {
    writeFileSync(path.join(ws, 'junk.txt'), 'x')
    await g.removeWorktree(repo, ws, 'takode/allegro', true)
    expect(existsSync(ws)).toBe(false)
    expect(await g.branchExists(repo, 'takode/allegro')).toBe(false)
  })
})

describe('spotlight', () => {
  it('shows workspace files in the repo root and restores it afterwards', async () => {
    writeFileSync(path.join(ws, 'a.txt'), 'changed\n')
    writeFileSync(path.join(ws, 'b.txt'), 'new\n')
    writeFileSync(path.join(repo, 'ignored-local.txt'), 'stays\n') // untracked file in the root
    const mainBefore = sh(repo, 'rev-parse', 'main')

    const res = await g.spotlightOn(repo, ws)
    expect(res.originalRef).toBe('main')
    expect(readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('changed\n')
    expect(readFileSync(path.join(repo, 'b.txt'), 'utf8')).toBe('new\n')
    expect(sh(repo, 'rev-parse', 'main')).toBe(mainBefore)
    expect(sh(ws, 'status', '--porcelain')).toContain('b.txt') // workspace untouched

    writeFileSync(path.join(ws, 'a.txt'), 'changed again\n')
    await g.spotlightSync(repo, ws)
    expect(readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('changed again\n')

    await g.spotlightOff(repo, res.originalRef)
    expect(sh(repo, 'branch', '--show-current')).toBe('main')
    expect(readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('one\n')
    expect(existsSync(path.join(repo, 'b.txt'))).toBe(false)
    expect(readFileSync(path.join(repo, 'ignored-local.txt'), 'utf8')).toBe('stays\n')
  })

  it('refuses to touch a repo root with uncommitted changes', async () => {
    writeFileSync(path.join(repo, 'a.txt'), 'my local edit\n')
    await expect(g.spotlightOn(repo, ws)).rejects.toThrow('DIRTY_ROOT')
    expect(readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('my local edit\n')
  })
})

describe('claude stream', () => {
  it('turns stream-json lines into chat items', () => {
    const a = parseStreamLine(
      JSON.stringify({
        type: 'assistant',
        session_id: 's1',
        message: { content: [{ type: 'text', text: 'Hi' }, { type: 'tool_use', name: 'Edit', input: { file_path: '/x/a.ts' } }] }
      })
    )
    expect(a.sessionId).toBe('s1')
    expect(a.items.map((i) => [i.role, i.text, i.tool])).toEqual([
      ['assistant', 'Hi', undefined],
      ['tool', '/x/a.ts', 'Edit']
    ])
    const r = parseStreamLine(JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 1200, total_cost_usd: 0.01 }))
    expect(r.items.map((i) => i.role)).toEqual(['result'])
    expect(parseStreamLine('not json').items).toEqual([])
  })
})

describe('push', () => {
  it('pushes to the chosen remote, with force-with-lease when asked', async () => {
    const bare = path.join(tmp, 'upstream.git')
    execFileSync('git', ['init', '-q', '--bare', bare])
    sh(repo, 'remote', 'add', 'upstream', bare)
    expect(await g.listRemotes(repo)).toEqual(['upstream'])

    writeFileSync(path.join(ws, 'a.txt'), 'pushed\n')
    await g.commitAll(ws, 'First')
    await g.pushBranch(ws, 'takode/allegro', { remote: 'upstream' })
    expect(sh(bare, 'rev-parse', 'takode/allegro')).toBe(sh(ws, 'rev-parse', 'HEAD'))

    sh(ws, 'commit', '-q', '--amend', '-m', 'Rewritten')
    await expect(g.pushBranch(ws, 'takode/allegro', { remote: 'upstream' })).rejects.toThrow()
    await g.pushBranch(ws, 'takode/allegro', { remote: 'upstream', force: true })
    expect(sh(bare, 'rev-parse', 'takode/allegro')).toBe(sh(ws, 'rev-parse', 'HEAD'))
  })
})
