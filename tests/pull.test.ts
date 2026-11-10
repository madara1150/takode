import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as g from '../src/main/git'

let tmp: string
let remote: string
let me: string
let teammate: string
const sh = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' } }).trim()
const commit = (cwd: string, file: string, text: string): void => {
  writeFileSync(path.join(cwd, file), text)
  sh(cwd, 'add', '-A')
  sh(cwd, 'commit', '-q', '-m', `Edit ${file}`)
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'takode-pull-')))
  remote = path.join(tmp, 'remote.git')
  me = path.join(tmp, 'me')
  teammate = path.join(tmp, 'teammate')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  execFileSync('git', ['clone', '-q', remote, me], { stdio: 'ignore' })
  commit(me, 'a.txt', 'one\n')
  sh(me, 'push', '-q', 'origin', 'main')
  sh(me, 'checkout', '-q', '-b', 'takode/work')
  execFileSync('git', ['clone', '-q', remote, teammate], { stdio: 'ignore' })
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('pull from main', () => {
  it('notices new commits on main and merges them in, keeping uncommitted work', async () => {
    commit(me, 'mine.txt', 'my work\n')
    commit(teammate, 'b.txt', 'from main\n')
    commit(teammate, 'c.txt', 'more\n')
    sh(teammate, 'push', '-q', 'origin', 'main')
    writeFileSync(path.join(me, 'draft.txt'), 'not committed\n')
    sh(me, 'add', 'draft.txt')

    await g.fetchRemote(me, 'origin')
    expect(await g.behindStatus(me, 'origin', 'main', 'takode/work')).toEqual({ base: 2, remote: 0 })

    const res = await g.pullUpdates(me, 'origin', 'main', 'takode/work')
    expect(res).toMatchObject({ fromBase: 2, fromRemote: 0, fetched: true })
    expect(readFileSync(path.join(me, 'b.txt'), 'utf8')).toBe('from main\n')
    expect(readFileSync(path.join(me, 'draft.txt'), 'utf8')).toBe('not committed\n')
    expect(await g.behindStatus(me, 'origin', 'main', 'takode/work')).toEqual({ base: 0, remote: 0 })
  })

  it('can rebase instead of merging', async () => {
    commit(me, 'mine.txt', 'my work\n')
    commit(teammate, 'b.txt', 'from main\n')
    sh(teammate, 'push', '-q', 'origin', 'main')
    await g.pullUpdates(me, 'origin', 'main', 'takode/work', 'rebase')
    expect(sh(me, 'log', '--format=%s', '-3').split('\n')).toEqual(['Edit mine.txt', 'Edit b.txt', 'Edit a.txt'])
  })

  it('reports conflicting files and leaves the merge to be fixed', async () => {
    commit(me, 'a.txt', 'mine\n')
    commit(teammate, 'a.txt', 'theirs\n')
    sh(teammate, 'push', '-q', 'origin', 'main')
    const err = await g.pullUpdates(me, 'origin', 'main', 'takode/work').catch((e) => e)
    expect(err).toBeInstanceOf(g.PullConflictError)
    expect(err.files).toEqual(['a.txt'])
  })

  it('works without a remote by using the local main', async () => {
    const local = path.join(tmp, 'local')
    execFileSync('git', ['init', '-q', '-b', 'main', local])
    commit(local, 'a.txt', 'one\n')
    sh(local, 'checkout', '-q', '-b', 'takode/x')
    sh(local, 'checkout', '-q', 'main')
    commit(local, 'b.txt', 'two\n')
    sh(local, 'checkout', '-q', 'takode/x')
    expect(await g.behindStatus(local, 'origin', 'main', 'takode/x')).toEqual({ base: 1, remote: 0 })
    const res = await g.pullUpdates(local, 'origin', 'main', 'takode/x')
    expect(res).toMatchObject({ fromBase: 1, fetched: false })
  })
})

describe('git push from Takode terminals', () => {
  it('sets the upstream by itself on a new branch', () => {
    commit(me, 'mine.txt', 'x\n')
    execFileSync('git', ['push', '-q'], { cwd: me, env: { ...process.env, ...g.gitDefaultsEnv({}) }, stdio: 'ignore' })
    expect(sh(me, 'rev-parse', '--abbrev-ref', '@{u}')).toBe('origin/takode/work')
  })
  it('adds to settings already passed through the environment', () => {
    expect(g.gitDefaultsEnv({ GIT_CONFIG_COUNT: '2' })).toEqual({
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_2: 'push.autoSetupRemote',
      GIT_CONFIG_VALUE_2: 'true'
    })
  })
})
