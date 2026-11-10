// Reading and saving workspace files for the built-in editor. Paths always stay
// inside the workspace. No Electron imports so it can be unit-tested.
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** Bigger files are not opened in the editor. */
export const MAX_EDIT_BYTES = 2 * 1024 * 1024

export interface OpenedFile {
  text: string
  /** Last change time on disk, used to notice edits made elsewhere (by Claude, say). */
  mtime: number
  size: number
  /** CRLF files are saved with CRLF again. */
  eol: '\n' | '\r\n'
}

/** Absolute path of a workspace file, or an error when it would leave the workspace. */
export function resolveInside(root: string, rel: string): string {
  if (!rel || path.isAbsolute(rel) || rel.includes('\0')) throw new Error('FILE_BAD_PATH')
  const base = realpathSync(root)
  const full = path.resolve(base, rel)
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('FILE_BAD_PATH')
  const parts = path.relative(base, full).split(path.sep)
  if (parts.includes('.git')) throw new Error('FILE_BAD_PATH')
  // A symlink inside the workspace must not lead outside it either, even for a file
  // that does not exist yet: check the nearest part of the path that does exist.
  let probe = full
  while (!existsSync(probe) && probe !== base) probe = path.dirname(probe)
  const real = realpathSync(probe)
  if (real !== base && !real.startsWith(base + path.sep)) throw new Error('FILE_BAD_PATH')
  return full
}

/** Text files only: a NUL byte in the first 8 KB means binary. */
function looksBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0)
}

export function readWorkspaceFile(root: string, rel: string): OpenedFile {
  const file = resolveInside(root, rel)
  const st = statSync(file)
  if (!st.isFile()) throw new Error('FILE_NOT_FILE')
  if (st.size > MAX_EDIT_BYTES) throw new Error('FILE_TOO_BIG')
  const buf = readFileSync(file)
  if (looksBinary(buf)) throw new Error('FILE_BINARY')
  const raw = buf.toString('utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  return { text: eol === '\r\n' ? raw.replace(/\r\n/g, '\n') : raw, mtime: st.mtimeMs, size: st.size, eol }
}

/**
 * Saves a file. When `expectMtime` is given and the file changed on disk since it
 * was opened, nothing is written and FILE_CHANGED is thrown (unless `force`).
 */
export function writeWorkspaceFile(
  root: string,
  rel: string,
  text: string,
  opts: { expectMtime?: number; eol?: '\n' | '\r\n'; force?: boolean; create?: boolean } = {}
): { mtime: number; size: number } {
  const file = resolveInside(root, rel)
  const exists = existsSync(file)
  if (opts.create && exists) throw new Error('FILE_EXISTS')
  if (!opts.create && !exists && opts.expectMtime !== undefined && !opts.force) throw new Error('FILE_CHANGED')
  if (exists && opts.expectMtime !== undefined && !opts.force && Math.abs(statSync(file).mtimeMs - opts.expectMtime) > 1) {
    throw new Error('FILE_CHANGED')
  }
  const data = opts.eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text
  mkdirSync(path.dirname(file), { recursive: true })
  // Write next to it and rename, so a crash never leaves half a file.
  const tmp = `${file}.takode-${process.pid}.tmp`
  writeFileSync(tmp, data)
  // Keep the file's permissions (e.g. an executable script stays executable).
  if (exists) chmodSync(tmp, statSync(file).mode)
  renameSync(tmp, file)
  const st = statSync(file)
  return { mtime: st.mtimeMs, size: st.size }
}
