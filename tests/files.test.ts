import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { readWorkspaceFile, resolveInside, writeWorkspaceFile } from '../src/main/files'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'takode-files-')))
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1\n')
})

describe('editor files', () => {
  it('reads and saves a file', () => {
    const f = readWorkspaceFile(root, 'src/a.ts')
    expect(f.text).toBe('export const a = 1\n')
    const res = writeWorkspaceFile(root, 'src/a.ts', 'export const a = 2\n', { expectMtime: f.mtime })
    expect(readFileSync(path.join(root, 'src/a.ts'), 'utf8')).toBe('export const a = 2\n')
    expect(res.size).toBe(19)
  })

  it('refuses to save over a file changed elsewhere, unless forced', () => {
    const f = readWorkspaceFile(root, 'src/a.ts')
    writeFileSync(path.join(root, 'src/a.ts'), 'changed by Claude\n')
    utimesSync(path.join(root, 'src/a.ts'), new Date(), new Date(Date.now() + 5000))
    expect(() => writeWorkspaceFile(root, 'src/a.ts', 'mine', { expectMtime: f.mtime })).toThrow('FILE_CHANGED')
    writeWorkspaceFile(root, 'src/a.ts', 'mine', { expectMtime: f.mtime, force: true })
    expect(readFileSync(path.join(root, 'src/a.ts'), 'utf8')).toBe('mine')
  })

  it('keeps Windows line endings and file permissions', () => {
    const file = path.join(root, 'run.sh')
    writeFileSync(file, 'echo 1\r\necho 2\r\n')
    chmodSync(file, 0o755)
    const f = readWorkspaceFile(root, 'run.sh')
    expect(f.eol).toBe('\r\n')
    expect(f.text).toBe('echo 1\necho 2\n')
    writeWorkspaceFile(root, 'run.sh', 'echo 3\necho 4\n', { expectMtime: f.mtime, eol: f.eol })
    expect(readFileSync(file, 'utf8')).toBe('echo 3\r\necho 4\r\n')
    expect(statSync(file).mode & 0o777).toBe(0o755)
  })

  it('stays inside the workspace and out of .git', () => {
    expect(() => resolveInside(root, '../secret')).toThrow('FILE_BAD_PATH')
    expect(() => resolveInside(root, '/etc/passwd')).toThrow('FILE_BAD_PATH')
    expect(() => resolveInside(root, '.git/config')).toThrow('FILE_BAD_PATH')
    symlinkSync(os.tmpdir(), path.join(root, 'out'))
    expect(() => resolveInside(root, 'out/x')).toThrow('FILE_BAD_PATH')
  })

  it('creates new files but never over an existing one', () => {
    writeWorkspaceFile(root, 'src/new/b.ts', '', { create: true })
    expect(readWorkspaceFile(root, 'src/new/b.ts').text).toBe('')
    expect(() => writeWorkspaceFile(root, 'src/a.ts', '', { create: true })).toThrow('FILE_EXISTS')
  })

  it('does not open binary files', () => {
    writeFileSync(path.join(root, 'img.png'), Buffer.from([137, 80, 78, 71, 0, 0, 1]))
    expect(() => readWorkspaceFile(root, 'img.png')).toThrow('FILE_BINARY')
  })
})
