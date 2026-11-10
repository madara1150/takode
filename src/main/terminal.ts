// One real shell (pseudo-terminal) per workspace, kept alive while Takode runs.
import path from 'node:path'
import * as pty from 'node-pty'
import { gitDefaultsEnv } from './git'

interface Term {
  proc: pty.IPty
  /** Recent output, replayed when the panel is opened again. */
  buffer: string
  /** Last time something was typed or printed. */
  usedAt: number
  /** Closed because nobody used it, not because the shell ended. */
  idleClosed?: boolean
}

const MAX_BUFFER = 200_000
const terms = new Map<string, Term>()

export interface TermEvents {
  onData: (key: string, data: string) => void
  onExit: (key: string, code: number, idle: boolean) => void
}

function shell(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: process.env.COMSPEC?.endsWith('cmd.exe') ? 'powershell.exe' : 'powershell.exe', args: [] }
  return { file: process.env.SHELL || '/bin/zsh', args: ['-l'] }
}

/** Opens the workspace's terminal (starting it if needed) and returns what it has shown so far. */
export function openTerminal(key: string, cwd: string, cols: number, rows: number, events: TermEvents): string {
  const existing = terms.get(key)
  if (existing) {
    existing.proc.resize(cols, rows)
    return existing.buffer
  }
  const { file, args } = shell()
  const proc = pty.spawn(file, args, {
    name: 'xterm-256color',
    cwd,
    cols,
    rows,
    env: { ...process.env, ...gitDefaultsEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Takode' } as Record<string, string>
  })
  const term: Term = { proc, buffer: '', usedAt: Date.now() }
  terms.set(key, term)
  proc.onData((data) => {
    term.buffer = (term.buffer + data).slice(-MAX_BUFFER)
    term.usedAt = Date.now()
    events.onData(key, data)
  })
  proc.onExit(({ exitCode }) => {
    if (terms.get(key) === term) terms.delete(key)
    events.onExit(key, exitCode, !!term.idleClosed)
  })
  return ''
}

export function writeTerminal(key: string, data: string): void {
  const term = terms.get(key)
  if (!term) return
  term.usedAt = Date.now()
  term.proc.write(data)
}

export function resizeTerminal(key: string, cols: number, rows: number): void {
  if (cols > 0 && rows > 0) terms.get(key)?.proc.resize(cols, rows)
}

export function closeTerminal(key: string): void {
  const term = terms.get(key)
  if (!term) return
  terms.delete(key)
  term.proc.kill()
}

export function closeAllTerminals(): void {
  for (const key of [...terms.keys()]) closeTerminal(key)
}

export const hasTerminal = (key: string): boolean => terms.has(key)

export const terminalCount = (): number => terms.size

/** True while a program (not just the shell prompt) runs in the terminal. */
function busy(term: Term): boolean {
  if (process.platform === 'win32') return false
  try {
    const shellName = path.basename(shell().file)
    return !!term.proc.process && path.basename(term.proc.process).replace(/^-/, '') !== shellName
  } catch {
    return false
  }
}

/** Closes terminals unused for `maxIdleMs` (all idle ones when 0) and returns how many were closed. */
export function closeIdleTerminals(maxIdleMs: number, now = Date.now()): number {
  let closed = 0
  for (const [key, term] of [...terms]) {
    if (now - term.usedAt < maxIdleMs || busy(term)) continue
    term.idleClosed = true
    terms.delete(key)
    term.proc.kill()
    closed++
  }
  return closed
}
