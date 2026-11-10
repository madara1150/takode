// Talks to Claude through the Claude Code CLI installed on this computer,
// using whatever account the user signed in with there. No Electron imports.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { gitDefaultsEnv } from './git'
import { toAvailable, type AvailableModel } from '../shared/models'
import { usageFrom } from '../shared/level'
import { parseQuota, type Quota } from '../shared/quota'
import type { ChatItem, ClaudeStatus, Effort, PermissionMode } from '../shared/types'
import { run } from './git'

export async function claudeStatus(): Promise<ClaudeStatus> {
  let version: string
  try {
    version = (await run('claude', ['--version'], { timeout: 20_000 })).trim().split(' ')[0]
  } catch {
    return { installed: false, loggedIn: false }
  }
  try {
    const info = JSON.parse(await run('claude', ['auth', 'status', '--json'], { timeout: 20_000 }))
    return {
      installed: true,
      loggedIn: !!info.loggedIn,
      version,
      email: info.email,
      plan: info.subscriptionType ?? info.authMethod
    }
  } catch {
    return { installed: true, loggedIn: false, version }
  }
}

/** Runs `claude auth login`, which opens the browser; resolves when sign-in finishes. */
export function claudeLogin(onOutput: (text: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['auth', 'login'], { env: process.env })
    let log = ''
    const onData = (buf: Buffer): void => {
      log += buf.toString()
      onOutput(buf.toString())
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', () => reject(new Error('claude is not installed')))
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(log.trim() || 'Login failed'))))
    setTimeout(() => child.kill(), 10 * 60_000).unref()
  })
}

const item = (role: ChatItem['role'], text: string, extra: Partial<ChatItem> = {}): ChatItem => ({
  id: randomUUID(),
  role,
  text,
  ts: Date.now(),
  ...extra
})

function toolDetail(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  for (const key of ['file_path', 'command', 'pattern', 'path', 'url', 'query', 'description']) {
    const v = input[key]
    if (typeof v === 'string' && v) return v
  }
  return ''
}

/** Turns one line of `claude --output-format stream-json` into chat items. */
export function parseStreamLine(line: string): { items: ChatItem[]; sessionId?: string; model?: string; quota?: Quota } {
  let ev: Record<string, any>
  try {
    ev = JSON.parse(line)
  } catch {
    return { items: [] }
  }
  const sessionId = typeof ev.session_id === 'string' ? ev.session_id : undefined
  if (ev.type === 'rate_limit_event') return { items: [], sessionId, quota: parseQuota(ev.rate_limit_info) ?? undefined }
  const items: ChatItem[] = []
  if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
    for (const block of ev.message.content) {
      if (block.type === 'text' && block.text?.trim()) items.push(item('assistant', block.text))
      if (block.type === 'tool_use' && block.name === 'ExitPlanMode' && typeof block.input?.plan === 'string') {
        // In plan mode the plan itself arrives as this tool's input.
        items.push(item('assistant', block.input.plan))
      } else if (block.type === 'tool_use') {
        items.push(item('tool', toolDetail(block.input), { tool: String(block.name) }))
      }
    }
  } else if (ev.type === 'result' || 'total_cost_usd' in ev) {
    const failed = ev.is_error === true || (ev.subtype && ev.subtype !== 'success')
    if (failed) items.push(item('error', String(ev.result ?? ev.subtype ?? 'Claude stopped with an error')))
    items.push(item('result', '', { durationMs: ev.duration_ms, costUsd: ev.total_cost_usd, tokens: usageFrom(ev.usage) ?? undefined }))
  }
  const model = ev.type === 'assistant' && typeof ev.message?.model === 'string' ? ev.message.model : undefined
  return { items, sessionId, model }
}

export interface ClaudeRun {
  cwd: string
  prompt: string
  sessionId?: string
  permissionMode: PermissionMode
  model: string
  effort?: Effort
  /** Extra instructions added to Claude Code's system prompt. */
  appendSystemPrompt?: string
  /** Folders outside the project Claude may read (attached files). */
  addDirs?: string[]
  /** Local plugins to load (Takode's skills). */
  pluginDirs?: string[]
  /** Extra Claude Code settings for this run. */
  settings?: object
  /** Asks the user whether Claude may use a tool. Without it, anything that needs asking is refused. */
  onPermission?: (req: { tool: string; input: unknown; description?: string; suggestions?: unknown }) => Promise<boolean>
  onItem: (item: ChatItem) => void
  /** Usage limits reported with the reply. */
  onQuota?: (quota: Quota) => void
  onSession: (sessionId: string) => void
}

const running = new Map<string, ChildProcess>()

export const isRunning = (key: string): boolean => running.has(key)

const stopped = new Set<string>()

export function stopClaude(key: string): void {
  const child = running.get(key)
  if (!child) return
  stopped.add(key)
  child.kill('SIGINT')
}

export const runningCount = (): number => running.size

/** Branch renames (Takode notices the new name and shows it) and read-only branch info. */
export const SAFE_GIT = ['Bash(git branch -m:*)', 'Bash(git branch --move:*)', 'Bash(git branch --show-current)', 'Bash(git branch -vv:*)']

export function stopAll(): void {
  for (const child of running.values()) child.kill()
}

/** Sends one prompt to Claude in `cwd` and streams the reply. Resolves when the turn ends. */
export function runClaude(key: string, opts: ClaudeRun): Promise<void> {
  return new Promise((resolve) => {
    // stream-json both ways, so Claude Code can ask for permission over stdin/stdout.
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', opts.permissionMode]
    if (opts.onPermission) args.push('--permission-prompt-tool', 'stdio')
    if (opts.model) args.push('--model', opts.model)
    if (opts.effort) args.push('--effort', opts.effort)
    if (opts.sessionId) args.push('--resume', opts.sessionId)
    if (opts.appendSystemPrompt?.trim()) args.push('--append-system-prompt', opts.appendSystemPrompt.trim())
    for (const dir of opts.addDirs ?? []) args.push('--add-dir', dir)
    for (const dir of opts.pluginDirs ?? []) args.push('--plugin-dir', dir)
    // A run cannot ask for permission, so allow the git commands Takode is happy with.
    args.push('--allowedTools', ...SAFE_GIT)
    if (opts.settings) args.push('--settings', JSON.stringify(opts.settings))

    // TAKODE_CLAUDE_BIN lets tests run a stand-in for the Claude Code CLI.
    const child = spawn(process.env.TAKODE_CLAUDE_BIN || 'claude', args, { cwd: opts.cwd, env: { ...process.env, ...gitDefaultsEnv() } })
    running.set(key, child)
    let buffer = ''
    let stderr = ''
    let gotResult = false
    let usedModel: string | undefined

    const reply = (msg: object): void => {
      if (child.stdin.writable) child.stdin.write(JSON.stringify(msg) + '\n')
    }
    const answerControl = async (ev: any): Promise<void> => {
      const id = ev.request_id
      if (ev.request?.subtype !== 'can_use_tool' || !opts.onPermission) {
        return reply({ type: 'control_response', response: { subtype: 'error', request_id: id, error: 'Not supported' } })
      }
      const r = ev.request
      const ok = await opts.onPermission({ tool: r.tool_name, input: r.input, description: r.description, suggestions: r.permission_suggestions }).catch(() => false)
      reply({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: id,
          response: ok ? { behavior: 'allow', updatedInput: r.input } : { behavior: 'deny', message: 'The user did not allow this. Ask what they want instead.' }
        }
      })
    }

    const handle = (line: string): void => {
      if (!line.trim()) return
      if (line.includes('"control_request"')) {
        try {
          const ev = JSON.parse(line)
          if (ev.type === 'control_request') return void answerControl(ev)
        } catch {
          /* fall through */
        }
      }
      const parsed = parseStreamLine(line)
      if (parsed.sessionId) opts.onSession(parsed.sessionId)
      if (parsed.model) usedModel = parsed.model
      if (parsed.quota) opts.onQuota?.(parsed.quota)
      for (const it of parsed.items) {
        if (it.role === 'result') {
          gotResult = true
          it.model = usedModel
          // One prompt per run: the turn is over, let Claude Code exit.
          child.stdin.end()
        }
        opts.onItem(it)
      }
    }

    child.stdout.on('data', (buf: Buffer) => {
      buffer += buf.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(handle)
    })
    child.stderr.on('data', (buf: Buffer) => (stderr += buf.toString()))
    child.on('error', () => {
      running.delete(key)
      opts.onItem(item('error', 'Claude Code is not installed'))
      resolve()
    })
    child.on('close', (code) => {
      handle(buffer)
      running.delete(key)
      if (stopped.delete(key)) opts.onItem(item('info', 'stopped'))
      else if (!gotResult) opts.onItem(item('error', stderr.trim() || `Claude exited with code ${code}`))
      resolve()
    })
    child.stdin.on('error', () => undefined)
    reply({ type: 'user', message: { role: 'user', content: opts.prompt } })
  })
}

/**
 * One question, one text answer. Claude may read the workspace but cannot run
 * commands or change files, and the conversation is not kept.
 */
export async function askClaude(cwd: string, prompt: string, model = ''): Promise<string> {
  const args = ['-p', '--output-format', 'text']
  if (model) args.push('--model', model)
  args.push('--disallowedTools', 'Bash', 'Edit', 'Write', 'NotebookEdit')
  return (await run('claude', args, { cwd, input: prompt, timeout: 180_000 })).trim()
}

/**
 * Asks Claude Code which models the signed-in account can use. This only opens
 * a session and reads its "initialize" reply; no message is sent to a model.
 */
export function fetchModels(): Promise<AvailableModel[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'], {
      env: process.env
    })
    let buffer = ''
    let done = false
    const finish = (fn: () => void): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill()
      fn()
    }
    const timer = setTimeout(() => finish(() => reject(new Error('Claude Code did not answer in time'))), 30_000)
    child.stdout.on('data', (buf: Buffer) => {
      buffer += buf.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        try {
          const ev = JSON.parse(line)
          if (ev.type !== 'control_response') continue
          const models = toAvailable(ev.response?.response?.models ?? ev.response?.models)
          finish(() => (models.length ? resolve(models) : reject(new Error('Claude Code returned no models'))))
        } catch {
          /* not JSON */
        }
      }
    })
    child.on('error', () => finish(() => reject(new Error('claude is not installed'))))
    child.on('close', () => finish(() => reject(new Error('Claude Code closed before listing its models'))))
    child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } })}\n`)
  })
}

/**
 * Fetches fresh usage limits. Claude Code only learns them from a reply, so
 * this sends one tiny message to the smallest model and stops as soon as the
 * limits arrive.
 */
export function checkQuota(): Promise<Quota> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', 'haiku', '--output-format', 'stream-json', '--verbose'], {
      cwd: os.tmpdir(),
      env: process.env
    })
    let buffer = ''
    let done = false
    const finish = (fn: () => void): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill()
      fn()
    }
    const timer = setTimeout(() => finish(() => reject(new Error('Claude Code did not answer in time'))), 60_000)
    child.stdout.on('data', (buf: Buffer) => {
      buffer += buf.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const quota = parseStreamLine(line).quota
        if (quota) finish(() => resolve(quota))
      }
    })
    child.on('error', () => finish(() => reject(new Error('claude is not installed'))))
    child.on('close', () => finish(() => reject(new Error('Claude Code did not report usage limits'))))
    child.stdin.end('Reply with exactly: ok')
  })
}
