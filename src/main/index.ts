import { app, BrowserWindow, dialog, ipcMain, net, Notification, protocol, session, shell } from 'electron'
import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { isEmail, normalizeCode, normalizeServer, PASSWORD_MIN, type Account } from '../shared/auth'
import { branchState, type BranchInfo } from '../shared/branch'
import { EMPTY_STATS, levelFor, xpOf, type TokenUsage } from '../shared/level'
import type { Quota } from '../shared/quota'
import { remapModel, resolveRun, syncModels, type AvailableModel } from '../shared/models'
import { agentPrompt, branchNamePrompt, feedbackPrompt, parsePrDraft, prDraftPrompt, type AgentAction } from '../shared/prompts'
import { fillTemplate, splitList, toBranchName, today, type TemplateVars } from '../shared/template'
import { normalizeRepo, type ChatItem, type ChatTab, type Repo, type RepoPatch, type Settings, type Workspace } from '../shared/types'
import { askClaude, checkQuota, claudeLogin, claudeStatus, fetchModels, isRunning, runClaude, runningCount, stopAll, stopClaude } from './claude'
import * as g from './git'
import { cancelGithubLogin, createPullRequest, fetchPrFeedback, prForBranch, githubClone, githubLogin, githubRepos, githubStatus } from './github'
import { runShots } from './shots'
import { fetchProgress, initAuth, login, logout, redeem, register, restore, saveProgress } from './auth'
import { accountKey, emptyProgress, mergeProgress, sameProgress, toProgress, type Progress } from '../shared/progress'
import { Store } from './store'
import { SkillStore } from './skills'
import { readWorkspaceFile, resolveInside, writeWorkspaceFile } from './files'
import { describeTool, isAllowed, remember, ruleFrom, type Allowed, type PermissionAnswer, type PermissionRequest } from '../shared/permission'
import { NO_ATTRIBUTION_PROMPT, NO_ATTRIBUTION_SETTINGS, stripAiAttribution } from '../shared/attribution'
import { closeAllTerminals, closeIdleTerminals, closeTerminal, openTerminal, resizeTerminal, terminalCount, writeTerminal } from './terminal'
import type { PerfStats } from '../shared/perf'
import { buildPrompt, MAX_ATTACH_BYTES, MAX_ATTACHMENTS, mentionsIn, safeName, type Attachment } from '../shared/attach'
import { checkForUpdate, downloadUpdate, installedAppPath, startInstall } from './updater'
import type { UpdateInfo } from '../shared/update'

// Apps started from Finder/Dock get a minimal PATH; borrow the login shell's so
// git, gh and claude are found wherever the user installed them.
if (process.platform !== 'win32') {
  try {
    const shellPath = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "%s" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    if (shellPath) process.env.PATH = shellPath
  } catch {
    process.env.PATH = `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`
  }
}

if (process.env.TAKODE_USER_DATA) app.setPath('userData', process.env.TAKODE_USER_DATA)

// Attached files are shown (e.g. image previews) through takode-file://<path>, limited to the attachments folder.
protocol.registerSchemesAsPrivileged([{ scheme: 'takode-file', privileges: { standard: false, secure: true, supportFetchAPI: true } }])

// GPU drawing can only be switched off before the app is ready, so read the saved choice now.
try {
  const saved = JSON.parse(readFileSync(path.join(app.getPath('userData'), 'state.json'), 'utf8'))
  if (saved?.settings?.hardwareAccel === false) app.disableHardwareAcceleration()
} catch {
  /* first run */
}

const NAMES = [
  'allegro', 'adagio', 'presto', 'largo', 'vivace', 'andante', 'forte', 'legato', 'staccato',
  'crescendo', 'rondo', 'sonata', 'fugue', 'cadenza', 'encore', 'tempo', 'aria', 'coda',
  'canon', 'nocturne', 'prelude', 'scherzo', 'waltz', 'ballad'
]

let win: BrowserWindow | null = null
let store: Store
let skills: SkillStore
/** Hides AI attribution from text Takode writes into git, when the setting says so. */
const clean = (text: string): string => (store.state.settings.hideAi ? stripAiAttribution(text) : text)

const send = (channel: string, payload: unknown): void => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}
const pushState = (): void => {
  store.save()
  send('state', store.state)
}
/** Chats are stored per tab; the event says which workspace and tab it belongs to. */
const pushChat = (wsId: string, tabId: string, item: ChatItem): void => {
  store.addChat(tabId, item)
  send('chat:item', { wsId, tabId, item })
}
/** Notes from Takode itself (setup script, branch renamed) go to the tab in front. */
const info = (wsId: string, text: string): void => {
  const ws = store.state.workspaces.find((w) => w.id === wsId)
  if (ws) pushChat(wsId, ws.activeTab, { id: randomUUID(), role: 'info', text, ts: Date.now() })
}

function tabOf(ws: Workspace, tabId?: string): ChatTab {
  const tab = ws.tabs.find((t) => t.id === (tabId ?? ws.activeTab)) ?? ws.tabs[0]
  if (!tab) throw new Error('Chat not found')
  return tab
}

const newTab = (): ChatTab => ({ id: randomUUID(), title: '' })

/** Short tab name from the first message. */
const titleFrom = (text: string): string => {
  const line = text.trim().split('\n')[0].replace(/\s+/g, ' ')
  return line.length > 32 ? `${line.slice(0, 31)}…` : line
}

function repoOf(id: string): Repo {
  const repo = store.state.repos.find((r) => r.id === id)
  if (!repo) throw new Error('Repository not found')
  return repo
}
function wsOf(id: string): Workspace {
  const ws = store.state.workspaces.find((w) => w.id === id)
  if (!ws) throw new Error('Workspace not found')
  return ws
}
const slug = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')

async function addRepo(dir: string): Promise<Repo> {
  if (!(await g.isRepo(dir))) throw new Error('NOT_A_REPO')
  const info = await g.repoInfo(dir)
  const existing = store.state.repos.find((r) => r.path === info.root)
  if (existing) return existing
  const repo = normalizeRepo({
    id: randomUUID(),
    name: info.name,
    path: info.root,
    baseBranch: info.baseBranch,
    remote: info.remote
  })
  store.state.repos.push(repo)
  pushState()
  return repo
}

let githubLogin_ = ''
const templateVars = (repo: Repo, ws?: Pick<Workspace, 'name' | 'branch' | 'baseBranch'>): TemplateVars => ({
  name: ws?.name,
  branch: ws?.branch,
  base: ws?.baseBranch ?? repo.baseBranch,
  repo: repo.name,
  date: today(),
  user: githubLogin_ || os.userInfo().username
})

/** Works out where one workspace's branch stands. Returns true when it changed. */
async function refreshBranch(ws: Workspace): Promise<boolean> {
  const repo = store.state.repos.find((r) => r.id === ws.repoId)
  // A missing folder (moved or deleted outside Takode) keeps its last known state.
  if (!repo || !existsSync(ws.path)) return false
  // The branch may have been renamed by Claude or in the terminal: show the real name.
  const current = await g.currentBranch(ws.path).catch(() => '')
  let renamed = false
  if (current && current !== ws.branch) {
    const old = ws.branch
    ws.branch = current
    renamed = true
    info(ws.id, ws.prUrl ? `renamed-pr:${current}:${old}` : `renamed:${current}`)
  }
  // Fetch first so "main has new commits" shows up without the user doing anything.
  if (repo.remote) await g.fetchRemote(ws.path, repo.push.remote)
  const { onRemote, ahead } = await g.remoteStatus(ws.path, repo.push.remote, ws.branch)
  const behind = await g.behindStatus(ws.path, repo.push.remote, ws.baseBranch, ws.branch).catch(() => ({ base: 0, remote: 0 }))
  // GitHub is only asked when the repository has a remote; a failure just means "no pull request known".
  const pr = repo.remote ? await prForBranch(ws.path, ws.branch).catch(() => null) : null
  const next: BranchInfo = {
    state: branchState(onRemote, pr),
    ahead,
    behind: behind.base,
    behindRemote: behind.remote,
    prNumber: pr?.number,
    prUrl: pr?.url,
    checkedAt: Date.now()
  }
  const before = ws.git
  const changed =
    renamed ||
    before?.state !== next.state ||
    before.ahead !== next.ahead ||
    before.behind !== next.behind ||
    before.behindRemote !== next.behindRemote ||
    before.prUrl !== next.prUrl || (!!pr && ws.prUrl !== pr.url)
  ws.git = next
  if (pr) ws.prUrl = pr.url
  return changed
}

let branchTimer: NodeJS.Timeout | null = null
/** Re-checks branch status every few minutes, as often as the settings say. */
function scheduleBranchChecks(): void {
  if (branchTimer) clearInterval(branchTimer)
  const minutes = Math.min(60, Math.max(1, store.state.settings.branchCheckMinutes || 2))
  branchTimer = setInterval(() => void refreshBranches(), minutes * 60_000)
  branchTimer.unref()
}

let idleTimer: NodeJS.Timeout | null = null
/** Closes terminals nobody has used for a while, as the performance settings say. */
function scheduleIdleTerminals(): void {
  if (idleTimer) clearInterval(idleTimer)
  idleTimer = null
  const minutes = store.state.settings.terminalIdleMinutes
  if (!minutes) return
  idleTimer = setInterval(() => closeIdleTerminals(minutes * 60_000), 60_000)
  idleTimer.unref()
}

const MB = (kb: number): number => Math.round(kb / 1024)

function perfStats(): PerfStats {
  const metrics = app.getAppMetrics()
  const byType = new Map<string, { memoryMB: number; cpu: number }>()
  for (const m of metrics) {
    const row = byType.get(m.type) ?? { memoryMB: 0, cpu: 0 }
    row.memoryMB += MB(m.memory.workingSetSize)
    row.cpu += m.cpu.percentCPUUsage
    byType.set(m.type, row)
  }
  const processes = [...byType].map(([type, v]) => ({ type, memoryMB: v.memoryMB, cpu: Math.round(v.cpu * 10) / 10 }))
  return {
    memoryMB: processes.reduce((n, p) => n + p.memoryMB, 0),
    cpu: Math.round(processes.reduce((n, p) => n + p.cpu, 0) * 10) / 10,
    processes: processes.sort((a, b) => b.memoryMB - a.memoryMB),
    terminals: terminalCount(),
    claudeRuns: runningCount(),
    cachedChats: store.cachedChats,
    hardwareAccel: app.isHardwareAccelerationEnabled()
  }
}

/** Copies a file into the tab's attachment folder so it stays readable even if the original moves. */
function storeAttachment(tabId: string, name: string, write: (dest: string) => void): Attachment {
  const dir = store.attachDir(tabId)
  mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `${randomUUID().slice(0, 8)}-${safeName(name)}`)
  write(dest)
  return { name, path: dest, size: statSync(dest).size }
}

function attachPaths(tabId: string, paths: string[]): Attachment[] {
  return paths.slice(0, MAX_ATTACHMENTS).map((p) => {
    const st = statSync(p)
    if (!st.isFile()) throw new Error('ATTACH_NOT_FILE')
    if (st.size > MAX_ATTACH_BYTES) throw new Error('ATTACH_TOO_BIG')
    return storeAttachment(tabId, path.basename(p), (dest) => copyFileSync(p, dest))
  })
}

const fileLists = new Map<string, { at: number; files: Promise<string[]> }>()
/** Every file in the workspace that git knows or would add (ignored ones left out). Cached briefly. */
function workspaceFiles(ws: Workspace): Promise<string[]> {
  const cached = fileLists.get(ws.id)
  if (cached && Date.now() - cached.at < 20_000) return cached.files
  const files = g
    .run('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ws.path })
    .then((out) => [...new Set(out.split('\n').filter(Boolean))].slice(0, 50_000))
    .catch(() => [] as string[])
  fileLists.set(ws.id, { at: Date.now(), files })
  return files
}

let branchRun: Promise<void> | null = null
/** Checks every workspace (or one), one at a time, and tells the window if anything changed. */
function refreshBranches(only?: string): Promise<void> {
  const work = async (): Promise<void> => {
    let changed = false
    for (const ws of [...store.state.workspaces]) {
      if (only && ws.id !== only) continue
      changed = (await refreshBranch(ws).catch(() => false)) || changed
    }
    if (changed) pushState()
    else store.save()
  }
  branchRun = (branchRun ?? Promise.resolve()).then(work, work)
  return branchRun
}

// ── Updates ──────────────────────────────────────────────────────────────────
let update: UpdateInfo | null = null
let downloaded: string | null = null

/** Looks for a newer release. `manual` also reports a skipped version and errors. */
async function findUpdate(manual: boolean): Promise<UpdateInfo | null> {
  const found = await checkForUpdate(app.getVersion())
  if (found && found.version !== update?.version) downloaded = null
  update = found
  if (found && (manual || found.version !== store.state.settings.skippedVersion)) send('update:available', found)
  return found
}

/** Adds a reply's tokens to the totals and announces a new level. */
function countTokens(usage: TokenUsage): void {
  // Levels need an account; a guest's usage does not count towards one.
  if (store.state.auth.mode !== 'account') return
  const stats = store.state.stats
  const before = levelFor(stats.xp).level
  stats.input += usage.input
  stats.output += usage.output
  stats.cacheRead += usage.cacheRead
  stats.cacheWrite += usage.cacheWrite
  stats.replies += 1
  stats.xp += xpOf(usage)
  const after = levelFor(stats.xp).level
  touchProgress()
  pushState()
  if (after > before) send('level:up', after)
}

/** Tells the user Claude has finished, as the settings ask. */
function notifyDone(ws: Workspace, tab: ChatTab): void {
  const mode = store.state.settings.notifyDone
  if (mode === 'off' || !Notification.isSupported()) return
  if (mode === 'background' && win?.isFocused()) return
  const last = [...store.chat(tab.id)].reverse().find((i) => i.role === 'assistant' || i.role === 'error')
  const note = new Notification({
    title: tab.title ? `${ws.name} · ${tab.title}` : ws.name,
    body: (last?.text ?? '').replace(/[`*#]/g, '').slice(0, 180),
    silent: !store.state.settings.notifySound
  })
  note.on('click', () => {
    win?.show()
    win?.focus()
    send('focus:workspace', { wsId: ws.id, tabId: tab.id })
  })
  note.show()
}

// ── Asking before Claude uses a tool ────────────────────────────────────────
const pendingAsks = new Map<string, { req: PermissionRequest; answer: (a: PermissionAnswer) => void }>()
/** What each chat tab was told to always allow, until Takode restarts. */
const allowedByTab = new Map<string, Allowed>()

function askPermission(ws: Workspace, tab: ChatTab, call: { tool: string; input: unknown; description?: string; suggestions?: unknown }): Promise<boolean> {
  const detail = describeTool(call.tool, call.input)
  if (isAllowed(allowedByTab.get(tab.id), call.tool, detail)) return Promise.resolve(true)
  const req: PermissionRequest = {
    id: randomUUID(),
    wsId: ws.id,
    tabId: tab.id,
    tool: call.tool,
    detail,
    description: call.description,
    rule: ruleFrom(call.suggestions),
    at: Date.now()
  }
  return new Promise((resolve) => {
    pendingAsks.set(req.id, {
      req,
      answer: (a) => {
        pendingAsks.delete(req.id)
        send('permission:done', req.id)
        if (a === 'always') {
          const allowed = allowedByTab.get(tab.id) ?? { tools: new Set<string>(), commands: [] }
          remember(allowed, req)
          allowedByTab.set(tab.id, allowed)
        }
        resolve(a !== 'deny')
      }
    })
    send('permission:request', req)
    if (Notification.isSupported() && !win?.isFocused()) {
      const note = new Notification({ title: `${ws.name} · ${call.tool}`, body: detail.slice(0, 180), silent: !store.state.settings.notifySound })
      note.on('click', () => {
        win?.show()
        win?.focus()
        send('focus:workspace', { wsId: ws.id, tabId: tab.id })
      })
      note.show()
    }
  })
}

/** Stopping a chat answers its open questions with "no". */
function denyPending(tabId: string): void {
  for (const p of [...pendingAsks.values()]) if (p.req.tabId === tabId) p.answer('deny')
}

// ── Progress per account ────────────────────────────────────────────────────
/** The signed-in account's progress, or null for a guest. */
function currentProgress(): Progress | null {
  const a = store.state.auth
  if (a.mode !== 'account' || !a.account) return null
  const key = accountKey(a.server, a.account.id)
  let p = store.state.progress[key]
  if (!p) {
    // The first account to sign in gets what was earned before accounts had their own.
    p = store.state.legacyProgress ?? emptyProgress()
    delete store.state.legacyProgress
    store.state.progress[key] = p
  }
  return p
}

/** Shows the signed-in account's level (a guest has none). The objects are shared, so changes land in that account. */
function bindProgress(): void {
  const p = currentProgress()
  store.state.stats = p ? p.stats : EMPTY_STATS()
  store.state.unlocks = p ? p.unlocks : []
  store.state.redeemed = p ? p.redeemed : []
}

let progressSupported = false
let syncTimer: NodeJS.Timeout | null = null
/** Something in the account's progress changed: note when, and send it to the server soon. */
function touchProgress(): void {
  const p = currentProgress()
  if (!p) return
  p.updatedAt = Date.now()
  if (!progressSupported) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void pushProgress(), 15_000)
  syncTimer.unref()
}

async function pushProgress(): Promise<void> {
  const p = currentProgress()
  if (p && progressSupported) await saveProgress(store.state.auth.server, p)
}

/** On sign-in: bring the server's copy and this computer's together (servers without progress are skipped). */
async function syncProgress(): Promise<void> {
  const local = currentProgress()
  if (!local) return
  const before = levelFor(local.stats.xp).level
  const raw = await fetchProgress(store.state.auth.server).catch(() => undefined)
  progressSupported = raw !== null && raw !== undefined
  const remote = raw ? toProgress(raw) : null
  if (!remote) return
  const merged = mergeProgress(local, remote)
  // Update in place so the shared objects stay shared.
  Object.assign(local.stats, merged.stats)
  local.unlocks.splice(0, local.unlocks.length, ...merged.unlocks)
  local.redeemed.splice(0, local.redeemed.length, ...merged.redeemed)
  local.updatedAt = merged.updatedAt
  pushState()
  if (!sameProgress(merged, remote)) await pushProgress()
  const after = levelFor(local.stats.xp).level
  if (after > before) send('level:up', after)
}

function signedIn(server: string, account: Account): void {
  store.state.auth = { mode: 'account', account, server }
  bindProgress()
  pushState()
  void syncProgress()
}

/** On start, checks the saved session with the server (keeps it as is when offline). */
async function restoreSession(): Promise<void> {
  const auth = store.state.auth
  if (auth.mode !== 'account' || !auth.server) return
  const account = await restore(auth.server)
  if (account === undefined) return
  store.state.auth = account ? { ...auth, account } : { ...auth, mode: 'signedOut', account: undefined }
  bindProgress()
  pushState()
  if (account) void syncProgress()
}

const setQuota = (quota: Quota): void => {
  store.state.quota = quota
  pushState()
}

let quotaCheck: Promise<Quota> | null = null
/** One usage check at a time; several callers share the same answer. */
function refreshQuota(): Promise<Quota> {
  quotaCheck ??= checkQuota()
    .then((quota) => {
      setQuota(quota)
      return quota
    })
    .finally(() => (quotaCheck = null))
  return quotaCheck
}

let availableModels: AvailableModel[] | null = null

/** Reads the account's real model list and brings the chat's list in line with it. */
async function refreshModels(force = false): Promise<AvailableModel[]> {
  if (availableModels && !force) return availableModels
  availableModels = await fetchModels()
  const settings = store.state.settings
  settings.models = syncModels(settings.models, availableModels, settings.modelsCustomized)
  settings.model = remapModel(settings.model, settings.models) ?? ''
  for (const ws of store.state.workspaces) ws.model = remapModel(ws.model, settings.models)
  pushState()
  return availableModels
}

const shellFor = (script: string): [string, string[]] =>
  process.platform === 'win32' ? ['cmd', ['/c', script]] : [process.env.SHELL || '/bin/sh', ['-lc', script]]

// Custom actions that are still running, keyed by "<workspace id>:<action id>".
const runningActions = new Map<string, ChildProcess>()
const pushRunningActions = (): void => send('actions:running', [...runningActions.keys()])

function stopActions(wsId?: string): void {
  for (const [key, child] of runningActions) {
    if (!wsId || key.startsWith(`${wsId}:`)) child.kill()
  }
}

/** Names the branch after the first task sent in a workspace (when the repository asks for it). */
async function autoRenameBranch(ws: Workspace, repo: Repo, task: string): Promise<void> {
  try {
    if (ws.prUrl || (await g.hasUpstream(ws.path))) return
    const reply = await askClaude(ws.path, branchNamePrompt(task, repo.actions), 'haiku')
    const slug = toBranchName(reply.split('\n')[0].toLowerCase()).replace(/\//g, '-').slice(0, 40)
    if (!slug) return
    const pattern = repo.branchPattern || store.state.settings.branchPattern
    const wanted = toBranchName(fillTemplate(pattern, { ...templateVars(repo), name: slug }))
    if (!wanted || wanted === ws.branch) return
    let branch = wanted
    for (let i = 2; await g.branchExists(repo.path, branch); i++) branch = `${wanted}-${i}`
    await g.renameBranch(ws.path, ws.branch, branch)
    ws.branch = branch
    pushState()
    info(ws.id, `renamed:${branch}`)
  } catch {
    /* keeping the generated name is fine */
  }
}

function runSetup(ws: Workspace, script: string): void {
  info(ws.id, `setup:start:${script}`)
  const [shellCmd, shellArgs] = shellFor(script)
  execFile(shellCmd, shellArgs, { cwd: ws.path, timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 }, (err, _out, stderr) => {
    info(ws.id, err ? `setup:fail:${(stderr || err.message).trim().slice(-600)}` : 'setup:done')
  })
}

/**
 * Opens a folder in VS Code, optionally at a file and line. Uses the `code` command
 * when it is installed (it can jump to a line), else the app itself.
 */
async function openInCode(folder: string, file?: string, line?: number): Promise<void> {
  const args = [folder]
  if (file) args.push('-g', `${file}${line ? `:${line}` : ''}`)
  try {
    await g.run('code', args, { timeout: 15_000 })
  } catch {
    if (process.platform !== 'darwin') throw new Error('VSCODE_MISSING')
    await g.run('open', ['-a', 'Visual Studio Code', ...(file ? [file] : [folder])]).catch(() => {
      throw new Error('VSCODE_MISSING')
    })
  }
}

function openPath(target: string, how: 'finder' | 'terminal' | 'editor'): Promise<void> {
  if (how === 'editor') return openInCode(target)
  if (how === 'finder') return shell.openPath(target).then(() => undefined)
  if (process.platform === 'darwin') {
    return g.run('open', ['-a', 'Terminal', target]).then(() => undefined)
  }
  return g.run('cmd', ['/c', 'start', 'cmd', '/K', `cd /d ${target}`]).then(() => undefined)
}

// Every handler is callable from the renderer as window.takode.invoke(name, ...args).
export const actions: Record<string, (...args: any[]) => unknown> = {
  'state:get': () => store.state,

  'settings:update': (patch: Partial<Settings>) => {
    Object.assign(store.state.settings, patch)
    if (patch.uiScale) win?.webContents.setZoomFactor(patch.uiScale / 100)
    if (patch.branchCheckMinutes) scheduleBranchChecks()
    if (patch.terminalIdleMinutes !== undefined) scheduleIdleTerminals()
    if (patch.spellcheck !== undefined) session.defaultSession.setSpellCheckerEnabled(patch.spellcheck)
    pushState()
  },

  // ── Performance ───────────────────────────────────────────────────────────
  'perf:stats': () => perfStats(),
  /** Drops caches and closes idle terminals; returns MB freed. */
  'perf:free': async () => {
    const before = perfStats().memoryMB
    await session.defaultSession.clearCache()
    await session.defaultSession.clearCodeCaches({})
    store.trimChats(2)
    closeIdleTerminals(0)
    await new Promise((r) => setTimeout(r, 1500))
    return Math.max(0, before - perfStats().memoryMB)
  },
  'app:relaunch': () => {
    app.relaunch()
    setTimeout(() => app.exit(0), 200)
  },

  'app:openExternal': (url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
  },

  'app:pickFolder': async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  },

  // ── Claude ────────────────────────────────────────────────────────────────
  'claude:status': async () => {
    const status = await claudeStatus()
    // Keep the account address out of README screenshots.
    if (process.env.TAKODE_SHOTS && status.email) status.email = 'you@example.com'
    return status
  },
  'claude:login': () => claudeLogin((text) => send('claude:login-output', text)),
  /** Models the signed-in account can use, straight from Claude Code. */
  'claude:models': (force?: boolean) => refreshModels(!!force),
  /** Drops the user's edits and mirrors the account's model list again. */
  'models:reset': async () => {
    store.state.settings.modelsCustomized = false
    await refreshModels(true)
  },
  /** Asks Claude for fresh usage limits (costs one very small message). */
  'quota:refresh': () => refreshQuota(),
  'app:version': () => app.getVersion(),
  /** Checks GitHub Releases right now; null means this is the newest version. */
  'update:check': () => findUpdate(true),
  'update:skip': (version: string) => {
    store.state.settings.skippedVersion = version
    pushState()
  },
  /** Downloads and verifies the new version, sending progress as it goes. */
  'update:download': async () => {
    if (!update?.asset) throw new Error('UPDATE_NO_FILE')
    downloaded ??= await downloadUpdate(update.asset, (share) => send('update:progress', share))
    return true
  },
  /** Starts the installer and quits; the new version opens by itself. */
  'update:install': () => {
    if (!downloaded) throw new Error('UPDATE_NOT_READY')
    if (process.platform === 'darwin' && !installedAppPath()) throw new Error('UPDATE_DEV')
    try {
      startInstall(downloaded)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EACCES') {
        // The app's folder is not writable: open the disk image so the user can drag it in.
        void shell.openPath(downloaded)
        throw new Error('UPDATE_NO_PERMISSION')
      }
      throw err
    }
    setTimeout(() => app.quit(), 300)
  },

  /** Ids of the chat tabs Claude is working in right now. */
  /** Starts the level count again from zero. */
  'stats:reset': () => {
    // In place, so the account's own record is reset too.
    Object.assign(store.state.stats, EMPTY_STATS())
    touchProgress()
    pushState()
  },

  // ── Account ───────────────────────────────────────────────────────────────
  'auth:login': async (server: string, email: string, password: string) => {
    const base = normalizeServer(server)
    if (!base) throw new Error('AUTH_BAD_SERVER')
    if (!isEmail(email) || !password) throw new Error('AUTH_MISSING')
    signedIn(base, await login(base, email, password))
  },
  'auth:register': async (server: string, name: string, email: string, password: string) => {
    const base = normalizeServer(server)
    if (!base) throw new Error('AUTH_BAD_SERVER')
    if (!name.trim() || !isEmail(email)) throw new Error('AUTH_MISSING')
    if (password.length < PASSWORD_MIN) throw new Error('AUTH_SHORT_PASSWORD')
    signedIn(base, await register(base, name, email, password))
  },
  // ── Skills ────────────────────────────────────────────────────────────────
  'skills:list': () => skills.list(),
  'skills:get': (slug: string) => skills.get(slug),
  'skills:save': (input: { slug?: string; name: string; description: string; body: string }) => skills.save(input),
  'skills:enable': (slug: string, on: boolean) => skills.setEnabled(slug, on),
  'skills:remove': (slug: string) => skills.remove(slug),
  /** Lets the user choose a skill folder (with SKILL.md) or a .md file. */
  'skills:import': async () => {
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'SKILL.md', extensions: ['md'] }]
    })
    return res.canceled ? null : skills.import(res.filePaths[0])
  },
  'skills:reveal': () => {
    mkdirSync(skills.folder, { recursive: true })
    return shell.openPath(skills.folder)
  },

  /** Redeems a code with the account server and adds what it gives. */
  'redeem:code': async (code: string) => {
    const auth = store.state.auth
    if (auth.mode !== 'account') throw new Error('REDEEM_SIGN_IN')
    const clean = normalizeCode(code)
    if (!/^[A-Z0-9_-]{3,64}$/.test(clean)) throw new Error('REDEEM_INVALID')
    if (store.state.redeemed.some((r) => r.code === clean)) throw new Error('REDEEM_USED')
    const reward = await redeem(auth.server, clean)
    const before = levelFor(store.state.stats.xp).level
    store.state.stats.xp += reward.xp
    for (const u of reward.unlocks) if (!store.state.unlocks.includes(u)) store.state.unlocks.push(u)
    store.state.redeemed.unshift({ code: clean, at: Date.now(), ...reward })
    touchProgress()
    pushState()
    const after = levelFor(store.state.stats.xp).level
    if (after > before) send('level:up', after)
    return reward
  },

  /** Use Takode without an account (no level; everything stays on this computer). */
  'auth:guest': () => {
    store.state.auth = { ...store.state.auth, mode: 'guest', account: undefined }
    bindProgress()
    pushState()
  },
  'auth:logout': async () => {
    await pushProgress().catch(() => undefined)
    await logout(store.state.auth.server)
    store.state.auth = { ...store.state.auth, mode: 'signedOut', account: undefined }
    bindProgress()
    pushState()
  },

  'claude:busy': () => store.state.workspaces.flatMap((w) => w.tabs.filter((t) => isRunning(t.id)).map((t) => t.id)),

  'claude:send': async (wsId: string, text: string, tabId?: string, files: Attachment[] = []) => {
    const ws = wsOf(wsId)
    const tab = tabOf(ws, tabId)
    if (isRunning(tab.id) || (!text.trim() && !files.length)) return
    // Only files Takode itself copied for this tab.
    const attached = files.filter((f) => path.dirname(f.path) === store.attachDir(tab.id) && existsSync(f.path))
    const known = new Set(await workspaceFiles(ws))
    const mentioned = mentionsIn(text).filter((p) => known.has(p) || existsSync(path.join(ws.path, p)))
    const repo = repoOf(ws.repoId)
    const firstInWorkspace = !ws.tabs.some((t) => store.chat(t.id).some((item) => item.role === 'user'))
    if (firstInWorkspace && repo.actions.autoRename) void autoRenameBranch(ws, repo, text)
    if (!tab.title) {
      tab.title = titleFrom(text)
      pushState()
    }
    pushChat(wsId, tab.id, { id: randomUUID(), role: 'user', text, ts: Date.now(), ...(attached.length ? { files: attached } : {}) })
    const attachDir = store.attachDir(tab.id)
    const done = runClaude(tab.id, {
      cwd: ws.path,
      prompt: buildPrompt(text, attached, mentioned),
      addDirs: existsSync(attachDir) ? [attachDir] : [],
      sessionId: tab.sessionId,
      ...resolveRun(store.state.settings, ws),
      appendSystemPrompt: [repo.actions.general, store.state.settings.hideAi ? NO_ATTRIBUTION_PROMPT : ''].filter((s) => s?.trim()).join('\n\n'),
      pluginDirs: [skills.pluginDir()].filter((d): d is string => !!d),
      settings: store.state.settings.hideAi ? NO_ATTRIBUTION_SETTINGS : undefined,
      onPermission: (call) => askPermission(ws, tab, call),
      onItem: (item) => {
        if (item.role === 'result' && item.tokens) countTokens(item.tokens)
        pushChat(wsId, tab.id, item)
      },
      onQuota: setQuota,
      onSession: (sessionId) => {
        if (tab.sessionId !== sessionId) {
          tab.sessionId = sessionId
          store.save()
        }
      }
    }).then(() => {
      send('busy', actions['claude:busy']())
      void refreshBranches(wsId)
      if (!process.env.TAKODE_SHOTS) notifyDone(ws, tab)
    })
    send('busy', actions['claude:busy']())
    return process.env.TAKODE_SHOTS ? done : undefined
  },

  // ── Attachments and @files ────────────────────────────────────────────────
  /** Lets the user choose files on the computer and copies them for the tab. */
  'attach:pick': async (tabId: string) => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'] })
    return res.canceled ? [] : attachPaths(tabId, res.filePaths)
  },
  /** Files dropped on the message box. */
  'attach:paths': (tabId: string, paths: string[]) => attachPaths(tabId, paths),
  /** Pasted data with no file behind it, such as a screenshot. */
  'attach:data': (tabId: string, name: string, data: Uint8Array) => {
    if (data.byteLength > MAX_ATTACH_BYTES) throw new Error('ATTACH_TOO_BIG')
    return storeAttachment(tabId, name, (dest) => writeFileSync(dest, data))
  },
  'attach:open': (file: string) => {
    if (file.startsWith(path.join(app.getPath('userData'), 'attachments'))) return shell.openPath(file)
  },
  'ws:files': (wsId: string, fresh?: boolean) => {
    if (fresh) fileLists.delete(wsId)
    return workspaceFiles(wsOf(wsId))
  },

  // ── Editor ────────────────────────────────────────────────────────────────
  'file:read': (wsId: string, rel: string) => readWorkspaceFile(wsOf(wsId).path, rel),
  'file:write': (wsId: string, rel: string, text: string, opts: { expectMtime?: number; eol?: '\n' | '\r\n'; force?: boolean; create?: boolean }) => {
    const res = writeWorkspaceFile(wsOf(wsId).path, rel, text, opts)
    if (opts.create) fileLists.delete(wsId)
    return res
  },

  'claude:stop': (wsId: string, tabId?: string) => {
    const tab = tabOf(wsOf(wsId), tabId)
    denyPending(tab.id)
    stopClaude(tab.id)
  },
  'permission:pending': () => [...pendingAsks.values()].map((p) => p.req),
  'permission:answer': (id: string, answer: PermissionAnswer) => {
    pendingAsks.get(id)?.answer(answer === 'always' || answer === 'allow' ? answer : 'deny')
  },
  'chat:get': (tabId: string) => store.chat(tabId),
  'chat:clear': (wsId: string, tabId?: string) => {
    const tab = tabOf(wsOf(wsId), tabId)
    store.clearChat(tab.id)
    delete tab.sessionId
    tab.title = ''
    pushState()
  },

  // ── Chat tabs ─────────────────────────────────────────────────────────────
  'tabs:add': (wsId: string) => {
    const ws = wsOf(wsId)
    const tab = newTab()
    ws.tabs.push(tab)
    ws.activeTab = tab.id
    pushState()
    return tab.id
  },
  'tabs:select': (wsId: string, tabId: string) => {
    const ws = wsOf(wsId)
    ws.activeTab = tabOf(ws, tabId).id
    pushState()
  },
  'tabs:rename': (wsId: string, tabId: string, title: string) => {
    tabOf(wsOf(wsId), tabId).title = title.trim().slice(0, 60)
    pushState()
  },
  /** Stops the chat and deletes its history. The last tab is replaced by an empty one. */
  'tabs:close': (wsId: string, tabId: string) => {
    const ws = wsOf(wsId)
    const index = ws.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return
    stopClaude(tabId)
    store.deleteChat(tabId)
    ws.tabs.splice(index, 1)
    if (!ws.tabs.length) ws.tabs.push(newTab())
    if (ws.activeTab === tabId) ws.activeTab = ws.tabs[Math.min(index, ws.tabs.length - 1)].id
    pushState()
  },

  // ── Terminal ──────────────────────────────────────────────────────────────
  /** Opens the workspace's terminal and returns what it has printed so far. */
  'term:open': (wsId: string, cols: number, rows: number) =>
    openTerminal(wsId, wsOf(wsId).path, cols, rows, {
      onData: (key, data) => send('term:data', { wsId: key, data }),
      onExit: (key, code, idle) => send('term:exit', { wsId: key, code, idle })
    }),
  'term:write': (wsId: string, data: string) => writeTerminal(wsId, data),
  'term:resize': (wsId: string, cols: number, rows: number) => resizeTerminal(wsId, cols, rows),
  'term:restart': (wsId: string) => closeTerminal(wsId),

  // ── GitHub ────────────────────────────────────────────────────────────────
  'github:status': async () => {
    const status = await githubStatus()
    githubLogin_ = status.login ?? ''
    return status
  },
  'github:login': () => githubLogin((device) => send('github:device', device)),
  'github:cancelLogin': () => cancelGithubLogin(),
  'github:repos': () => githubRepos(),
  'github:clone': async (nameWithOwner: string) => {
    const dest = path.join(store.state.settings.homeDir, 'repos', nameWithOwner.split('/')[1])
    if (!existsSync(dest)) await githubClone(nameWithOwner, dest)
    return addRepo(dest)
  },

  // ── Repositories ──────────────────────────────────────────────────────────
  'repo:pick': async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return res.canceled ? null : addRepo(res.filePaths[0])
  },
  'repo:add': (dir: string) => addRepo(dir),
  'repo:branches': (id: string) => g.listBranches(repoOf(id).path),
  'repo:remotes': (id: string) => g.listRemotes(repoOf(id).path),
  'repo:update': (id: string, patch: RepoPatch) => {
    const repo = repoOf(id)
    const { push, pr, actions: acts, ...rest } = patch
    Object.assign(repo, rest)
    Object.assign(repo.push, push)
    Object.assign(repo.pr, pr)
    Object.assign(repo.actions, acts)
    pushState()
  },
  /** What a new workspace's branch would be called, for the settings preview. */
  'repo:branchPreview': (id: string, pattern: string, name: string) => {
    const repo = repoOf(id)
    const tpl = pattern || store.state.settings.branchPattern
    return toBranchName(fillTemplate(tpl, { ...templateVars(repo), name }))
  },
  'repo:remove': (id: string) => {
    if (store.state.workspaces.some((w) => w.repoId === id)) throw new Error('HAS_WORKSPACES')
    store.state.repos = store.state.repos.filter((r) => r.id !== id)
    pushState()
  },
  'repo:open': (id: string, how: 'finder' | 'terminal' | 'editor') => openPath(repoOf(id).path, how),

  // ── Workspaces ────────────────────────────────────────────────────────────
  'ws:create': async (repoId: string, opts: { name?: string; base?: string } = {}) => {
    const repo = repoOf(repoId)
    const used = new Set(store.state.workspaces.filter((w) => w.repoId === repoId).map((w) => w.name))
    const root = path.join(store.state.settings.homeDir, 'workspaces', repo.name)
    let name = slug(opts.name ?? '')
    if (!name) {
      const free = NAMES.filter((n) => !used.has(n) && !existsSync(path.join(root, n)))
      name = free.length ? free[Math.floor(Math.random() * free.length)] : `ws-${Date.now().toString(36)}`
    }
    if (used.has(name) || existsSync(path.join(root, name))) throw new Error('NAME_TAKEN')
    const pattern = repo.branchPattern || store.state.settings.branchPattern
    const wanted = toBranchName(fillTemplate(pattern, { ...templateVars(repo), name })) || name
    let branch = wanted
    for (let i = 2; await g.branchExists(repo.path, branch); i++) branch = `${wanted}-${i}`
    const ws: Workspace = {
      id: randomUUID(),
      repoId,
      name,
      branch,
      baseBranch: opts.base || repo.baseBranch,
      path: path.join(root, name),
      createdAt: Date.now(),
      tabs: [],
      activeTab: ''
    }
    const first = newTab()
    ws.tabs.push(first)
    ws.activeTab = first.id
    await g.createWorktree(repo.path, ws.path, ws.branch, ws.baseBranch)
    store.state.workspaces.push(ws)
    pushState()
    if (repo.setupScript.trim()) runSetup(ws, repo.setupScript.trim())
    await refreshBranches(ws.id)
    return ws
  },

  /** Chat choices for one workspace: model, effort and plan mode. */
  'ws:update': (id: string, patch: Partial<Pick<Workspace, 'model' | 'effort' | 'planMode' | 'permission'>>) => {
    const ws = wsOf(id)
    const { model, effort, planMode, permission } = patch
    Object.assign(ws, Object.fromEntries(Object.entries({ model, effort, planMode, permission }).filter(([, v]) => v !== undefined)))
    pushState()
  },

  'ws:archive': async (id: string, deleteBranch: boolean) => {
    const ws = wsOf(id)
    const repo = repoOf(ws.repoId)
    for (const tab of ws.tabs) {
      stopClaude(tab.id)
      store.deleteChat(tab.id)
    }
    stopActions(id)
    closeTerminal(id)
    if (store.state.spotlights.some((s) => s.workspaceId === id)) await actions['spotlight:off'](repo.id)
    await g.removeWorktree(repo.path, ws.path, ws.branch, deleteBranch)
    store.state.workspaces = store.state.workspaces.filter((w) => w.id !== id)
    pushState()
  },

  'ws:diff': (id: string) => {
    const ws = wsOf(id)
    return g.diffWorkspace(ws.path, ws.baseBranch)
  },

  'ws:open': (id: string, how: 'finder' | 'terminal' | 'editor') => openPath(wsOf(id).path, how),
  /** Opens the workspace in VS Code, at a file and line when given. */
  'ws:openCode': (id: string, rel?: string, line?: number) => {
    const ws = wsOf(id)
    return openInCode(ws.path, rel ? resolveInside(ws.path, rel) : undefined, line)
  },

  /** Commits anything uncommitted, then pushes the way the repository is set up to. */
  'ws:push': async (id: string, message?: string) => {
    const ws = wsOf(id)
    const repo = repoOf(ws.repoId)
    if (await g.hasUncommitted(ws.path)) {
      const fallback = fillTemplate(repo.push.commitTemplate, templateVars(repo, ws))
      await g.commitAll(ws.path, clean(message?.trim() || fallback || `Update ${ws.name}`))
    }
    await g.pushBranch(ws.path, ws.branch, repo.push)
    await refreshBranches(id)
  },

  /** Renames the workspace's branch (it must not exist yet). */
  'ws:renameBranch': async (id: string, wanted: string) => {
    const ws = wsOf(id)
    const repo = repoOf(ws.repoId)
    const name = toBranchName(wanted)
    if (!name || !(await g.validBranchName(ws.path, name))) throw new Error('BRANCH_BAD_NAME')
    if (name === ws.branch) return ws.branch
    if (await g.branchExists(repo.path, name)) throw new Error('BRANCH_EXISTS')
    await g.renameBranch(ws.path, ws.branch, name)
    await refreshBranches(id)
    return ws.branch
  },

  /** Brings in new commits from this branch's remote and from the base branch (e.g. main). */
  'ws:pull': async (id: string) => {
    const ws = wsOf(id)
    const repo = repoOf(ws.repoId)
    if (store.state.workspaces.some((w) => w.id === id && w.tabs.some((t) => isRunning(t.id)))) throw new Error('PULL_BUSY')
    try {
      const res = await g.pullUpdates(ws.path, repo.push.remote, ws.baseBranch, ws.branch, repo.push.pullMode)
      if (res.fromBase || res.fromRemote) info(ws.id, `pull:done:${res.fromBase}:${res.fromRemote}:${ws.baseBranch}`)
      return res
    } catch (err) {
      if (err instanceof g.PullConflictError) {
        info(ws.id, `pull:conflict:${err.files.join(', ')}`)
        throw new Error('PULL_CONFLICT')
      }
      throw err
    } finally {
      await refreshBranches(id)
    }
  },

  /** Values the Push and Create PR dialogs start with, from the repository's templates. */
  'ws:defaults': async (id: string) => {
    const ws = wsOf(id)
    const repo = repoOf(ws.repoId)
    const vars = templateVars(repo, ws)
    return {
      commitMessage: fillTemplate(repo.push.commitTemplate, vars),
      hasUncommitted: await g.hasUncommitted(ws.path),
      title: fillTemplate(repo.pr.titleTemplate, vars),
      body: fillTemplate(repo.pr.bodyTemplate, vars),
      target: repo.pr.target || ws.baseBranch,
      draft: repo.pr.draft
    }
  },

  'ws:createPr': async (id: string, opts: { title: string; body: string; draft?: boolean; target?: string }) => {
    const ws = wsOf(id)
    const repo = repoOf(ws.repoId)
    await actions['ws:push'](id, opts.title)
    ws.prUrl = await createPullRequest(ws.path, {
      title: clean(opts.title),
      body: clean(opts.body),
      base: opts.target || repo.pr.target || ws.baseBranch,
      head: ws.branch,
      draft: opts.draft ?? repo.pr.draft,
      reviewers: splitList(repo.pr.reviewers),
      labels: splitList(repo.pr.labels)
    })
    pushState()
    await refreshBranches(id)
    return ws.prUrl
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Review / Fix errors / Resolve conflicts: sends the built-in prompt plus the repository's instructions. */
  'ws:agentAction': (id: string, action: AgentAction) => {
    const ws = wsOf(id)
    return actions['claude:send'](id, agentPrompt(action, ws.baseBranch, repoOf(ws.repoId).actions))
  },

  /** Asks Claude for a pull request title and description based on the workspace's diff. */
  'ws:draftPr': async (id: string) => {
    const ws = wsOf(id)
    const repo = repoOf(ws.repoId)
    const files = await g.diffWorkspace(ws.path, ws.baseBranch)
    if (!files.length) throw new Error('NO_CHANGES')
    const stat = files.map((f) => `${f.path} (+${f.added} -${f.removed})`).join('\n')
    const diff = files.map((f) => f.patch).join('\n').slice(0, 60_000)
    return parsePrDraft(clean(await askClaude(ws.path, prDraftPrompt(ws.baseBranch, stat, diff, repo.actions), store.state.settings.model)))
  },

  /** Review feedback on the workspace's pull request that has not been handled yet. */
  'ws:feedback': async (id: string) => {
    const ws = wsOf(id)
    if (!ws.prUrl) return null
    return fetchPrFeedback(ws.prUrl, { self: githubLogin_ || undefined, since: ws.feedbackHandledAt })
  },

  /** Hands the outstanding review feedback to Claude to fix. */
  'ws:fixFeedback': async (id: string) => {
    const ws = wsOf(id)
    const feedback = (await actions['ws:feedback'](id)) as Awaited<ReturnType<typeof fetchPrFeedback>> | null
    if (!feedback?.items.length) throw new Error('NO_FEEDBACK')
    await actions['claude:send'](id, feedbackPrompt(feedback.items, feedback.changesRequested, repoOf(ws.repoId).actions))
    ws.feedbackHandledAt = Date.now()
    pushState()
  },

  /** Re-checks where each workspace's branch stands. */
  'branches:refresh': (id?: string) => refreshBranches(id),

  'actions:running': () => [...runningActions.keys()],

  /** Starts a custom action in the workspace, or stops it if it is already running. */
  'ws:runAction': (id: string, actionId: string) => {
    const ws = wsOf(id)
    const action = repoOf(ws.repoId).actions.custom.find((a) => a.id === actionId)
    if (!action?.command.trim()) throw new Error('Action not found')
    const key = `${id}:${actionId}`
    const tabId = ws.activeTab
    const current = runningActions.get(key)
    if (current) return void current.kill()

    const [cmd, args] = shellFor(action.command)
    const child = spawn(cmd, args, { cwd: ws.path, env: process.env })
    let output = ''
    const collect = (buf: Buffer): void => {
      output = (output + buf.toString()).slice(-6000)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const finish = (ok: boolean, extra = ''): void => {
      if (!runningActions.delete(key)) return
      pushRunningActions()
      pushChat(id, ws.tabs.some((t) => t.id === tabId) ? tabId : ws.activeTab, {
        id: randomUUID(),
        role: 'command',
        tool: action.name,
        text: `$ ${action.command}\n${(output + extra).trim()}`.trim(),
        ok,
        ts: Date.now()
      })
    }
    child.on('error', (err) => finish(false, err.message))
    child.on('close', (code, signal) => finish(code === 0, signal ? `\n(stopped)` : ''))
    runningActions.set(key, child)
    pushRunningActions()
  },

  // ── Spotlight ─────────────────────────────────────────────────────────────
  'spotlight:on': async (wsId: string) => {
    const ws = wsOf(wsId)
    const repo = repoOf(ws.repoId)
    const current = store.state.spotlights.find((s) => s.repoId === repo.id)
    if (current) {
      current.snapshot = await g.spotlightSync(repo.path, ws.path)
      current.workspaceId = wsId
      current.syncedAt = Date.now()
    } else {
      const res = await g.spotlightOn(repo.path, ws.path)
      store.state.spotlights.push({ repoId: repo.id, workspaceId: wsId, syncedAt: Date.now(), ...res })
    }
    pushState()
  },

  'spotlight:off': async (repoId: string) => {
    const current = store.state.spotlights.find((s) => s.repoId === repoId)
    if (!current) return
    await g.spotlightOff(repoOf(repoId).path, current.originalRef)
    store.state.spotlights = store.state.spotlights.filter((s) => s.repoId !== repoId)
    pushState()
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#0e1016',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true
    }
  })
  win.webContents.on('did-finish-load', () => win?.webContents.setZoomFactor((store.state.settings.uiScale || 100) / 100))
  win.once('ready-to-show', () => {
    if (!process.env.TAKODE_SHOTS) return win?.show()
    // Screenshot run: stay in the background and ignore stray clicks.
    win?.showInactive()
    win?.setIgnoreMouseEvents(true)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

void app.whenReady().then(() => {
  store = new Store(app.getPath('userData'), process.env.TAKODE_HOME || path.join(os.homedir(), 'Takode'))
  skills = new SkillStore(path.join(app.getPath('userData'), 'claude-plugin'))
  ipcMain.handle('takode', async (_e, name: string, ...args: unknown[]) => {
    const fn = actions[name]
    if (!fn) return { ok: false, error: `Unknown action ${name}` }
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  initAuth(path.join(app.getPath('userData'), 'session.bin'))
  bindProgress()
  const attachRoot = path.join(app.getPath('userData'), 'attachments') + path.sep
  protocol.handle('takode-file', (req) => {
    const file = path.normalize(decodeURIComponent(new URL(req.url).pathname))
    if (!file.startsWith(attachRoot)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  if (process.env.TAKODE_SHOTS && store.state.auth.mode === 'signedOut' && !process.env.TAKODE_SHOTS_LOGIN) store.state.auth.mode = 'guest'
  createWindow()
  void restoreSession()
  void refreshModels().catch(() => undefined)
  void refreshBranches()
  // Look for a new version shortly after start, then every 6 hours.
  const autoCheck = (): void => {
    if (store.state.settings.autoUpdate && !process.env.TAKODE_SHOTS) void findUpdate(false).catch(() => undefined)
  }
  setTimeout(autoCheck, 4000)
  setInterval(autoCheck, 6 * 60 * 60_000).unref()
  scheduleBranchChecks()
  scheduleIdleTerminals()
  session.defaultSession.setSpellCheckerEnabled(store.state.settings.spellcheck !== false)
  // Show current limits on launch unless the saved figures are still fresh.
  const quotaAge = Date.now() - (store.state.quota?.updatedAt ?? 0)
  if (quotaAge > 15 * 60_000 && !process.env.TAKODE_SHOTS_NO_CLAUDE) void refreshQuota().catch(() => undefined)
  if (process.env.TAKODE_SHOTS && win) void runShots(win, actions, () => store.state)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => {
  stopAll()
  closeAllTerminals()
  stopActions()
  cancelGithubLogin()
})
