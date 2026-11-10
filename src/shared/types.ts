import type { Progress } from './progress'
import type { RepoIcon } from './repoIcon'
import type { RedeemedCode } from './auth'
import type { Attachment } from './attach'
import type { AuthState } from './auth'
import type { BranchInfo } from './branch'
import type { TokenUsage, UsageStats } from './level'
import type { Quota } from './quota'

export type Language = 'th' | 'en'
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
/** How hard Claude thinks before answering ("" = Claude Code's default). */
export type Effort = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** A model offered in the chat's model menu. */
export interface ModelOption {
  key: string
  /** Alias or full model name passed to Claude Code ("" = its default model). */
  id: string
  label: string
  /** Shown in the chat's model menu. */
  enabled: boolean
  /** What this model may do without asking ("" = the default from Settings). */
  permission: PermissionMode | ''
  /** Effort this model starts with ("" = the default from Settings). */
  effort: Effort
  /** Full model name it points at, when Claude Code reported it. */
  resolved?: string
  /** Effort levels it accepts; undefined when unknown. */
  efforts?: Effort[]
}

export interface Settings {
  /** Theme preset id, or "system" to follow the OS light/dark setting. */
  theme: string
  /** Accent colour as #rrggbb. */
  accent: string
  /** Base UI font size in px. */
  fontSize: number
  language: Language
  permissionMode: PermissionMode
  /** Claude model alias ("" = Claude Code default). */
  model: string
  effort: Effort
  models: ModelOption[]
  /** False while the list simply mirrors what the Claude account offers. */
  modelsCustomized: boolean
  /** Default pattern for new workspace branches, e.g. "takode/{name}". */
  branchPattern: string
  /** Interface zoom in percent. */
  uiScale: number
  density: 'compact' | 'normal' | 'spacious'
  /** Corner roundness in px. */
  radius: number
  uiFont: 'system' | 'rounded' | 'serif' | 'mono'
  codeFontSize: number
  /** Animations and transitions. */
  motion: boolean
  bubbleStyle: 'bubble' | 'plain'
  sendKey: 'enter' | 'mod-enter'
  /** How Claude's tool calls show in the chat. */
  toolCalls: 'all' | 'compact' | 'hidden'
  showTokens: boolean
  showCost: boolean
  autoScroll: boolean
  /** System notification when Claude finishes. */
  notifyDone: 'off' | 'background' | 'always'
  notifySound: boolean
  confirmArchive: boolean
  archiveDeleteBranch: boolean
  /** How often branch status is checked, in minutes. */
  branchCheckMinutes: number
  showLevel: boolean
  /** Cosmetics unlocked by levelling up. */
  ringStyle: string
  levelUpEffect: string
  sendRipple: boolean
  aura: boolean
  rgbFrame: boolean
  /** Look for a new version when Takode starts and every few hours. */
  autoUpdate: boolean
  /** A version the user chose to skip. */
  skippedVersion: string
  /** Folder that holds cloned repos and workspace worktrees. */
  homeDir: string
  /** Performance: no blur, glow or decorative effects. */
  liteEffects: boolean
  /** Pause animations while the window is not in front. */
  pauseUnfocused: boolean
  /** Messages drawn per chat (0 = all); older ones load on request. */
  chatLimit: number
  /** Close a terminal nobody used for this many minutes (0 = never). Busy terminals are left alone. */
  terminalIdleMinutes: number
  spellcheck: boolean
  /** GPU drawing; changing it needs a restart. */
  hardwareAccel: boolean
  /** Keep Claude co-author lines and "Generated with Claude" out of commits and pull requests. */
  hideAi: boolean
  /** How chats are listed in the sidebar. */
  sidebarGroup: 'repo' | 'status'
}

export interface PushConfig {
  /** Git remote to push to. */
  remote: string
  /** Push with --force-with-lease (for branches you rebase). */
  force: boolean
  /** Message for the commit Takode makes when there are uncommitted changes. */
  commitTemplate: string
  /** How the Pull button brings in new commits from the base branch. */
  pullMode: 'merge' | 'rebase'
}

export interface PrConfig {
  /** Branch pull requests are opened against ("" = the workspace's base branch). */
  target: string
  draft: boolean
  titleTemplate: string
  bodyTemplate: string
  /** Comma-separated GitHub usernames. */
  reviewers: string
  /** Comma-separated label names. */
  labels: string
  /** Open the pull request in the browser once it is created. */
  openAfter: boolean
}

export interface CustomAction {
  id: string
  name: string
  /** Shell command run in the workspace folder. */
  command: string
}

export interface ActionsConfig {
  /** Shortcuts such as "run the dev server" or "run the tests". */
  custom: CustomAction[]
  /** Show the Spotlight button, to test workspace changes in the repository root. */
  spotlight: boolean
  /** Rename the branch from the first message sent in a workspace. */
  autoRename: boolean
  /** Extra instructions sent with the matching button. */
  review: string
  createPr: string
  fixErrors: string
  resolveConflicts: string
  addressFeedback: string
  branchRename: string
  /** Extra instructions sent with every message in this repository. */
  general: string
}

export interface Repo {
  id: string
  name: string
  path: string
  /** Branch new workspaces start from. */
  baseBranch: string
  remote: string
  /** Shell command run once in every new workspace (e.g. "npm install"). */
  setupScript: string
  /** Branch pattern for this repository ("" = use the default from Settings). */
  branchPattern: string
  push: PushConfig
  pr: PrConfig
  actions: ActionsConfig
  /** Star badge in the sidebar; unset = picked from the repository id. */
  icon?: RepoIcon
}

export type RepoPatch = Partial<Omit<Repo, 'id' | 'path' | 'push' | 'pr' | 'actions'>> & {
  push?: Partial<PushConfig>
  pr?: Partial<PrConfig>
  actions?: Partial<ActionsConfig>
}

export const DEFAULT_ACTIONS: ActionsConfig = {
  custom: [],
  spotlight: true,
  autoRename: false,
  review: '',
  createPr: '',
  fixErrors: '',
  resolveConflicts: '',
  addressFeedback: '',
  branchRename: '',
  general: ''
}

export const DEFAULT_PUSH: PushConfig = { remote: 'origin', force: false, commitTemplate: 'Update {name}', pullMode: 'merge' }
export const DEFAULT_PR: PrConfig = {
  target: '',
  draft: false,
  titleTemplate: '',
  bodyTemplate: '',
  reviewers: '',
  labels: '',
  openAfter: true
}

/** Fills in settings that older saved repositories do not have yet. */
export function normalizeRepo(repo: Partial<Repo> & Pick<Repo, 'id' | 'name' | 'path'>): Repo {
  return {
    baseBranch: 'main',
    remote: '',
    setupScript: '',
    branchPattern: '',
    ...repo,
    push: { ...DEFAULT_PUSH, ...repo.push },
    pr: { ...DEFAULT_PR, ...repo.pr },
    actions: { ...DEFAULT_ACTIONS, ...repo.actions }
  }
}

/** One conversation with Claude inside a workspace. */
export interface ChatTab {
  id: string
  /** Empty until the first message names it. */
  title: string
  /** Claude Code session id, so the conversation can be resumed. */
  sessionId?: string
}

export interface Workspace {
  id: string
  repoId: string
  name: string
  branch: string
  baseBranch: string
  path: string
  createdAt: number
  /** Conversations in this workspace; they share its folder and branch. */
  tabs: ChatTab[]
  activeTab: string
  /** Only in data saved before workspaces had tabs. */
  sessionId?: string
  prUrl?: string
  /** Chat choices for this workspace; unset means "use the default". */
  model?: string
  effort?: Effort
  planMode?: boolean
  /** How freely Claude may act in this workspace (unset = the default from Settings). */
  permission?: PermissionMode
  /** Where the branch stands (local, pushed, pull request, merged). */
  git?: BranchInfo
  /** Review feedback older than this has already been handed to Claude. */
  feedbackHandledAt?: number
}

/** A repo whose root folder currently mirrors one workspace. */
export interface Spotlight {
  repoId: string
  workspaceId: string
  /** Branch (or commit) the repo root was on before Spotlight was turned on. */
  originalRef: string
  snapshot: string
  syncedAt: number
}

export interface AppState {
  auth: AuthState
  /** Tokens used through Takode, which also drive the level. */
  stats: UsageStats
  /** Last usage figures Claude Code reported. */
  quota?: Quota
  settings: Settings
  repos: Repo[]
  workspaces: Workspace[]
  spotlights: Spotlight[]
  /** Rewards unlocked by redeem codes, as "kind:id". */
  unlocks: string[]
  redeemed: RedeemedCode[]
  /** Each account's own progress on this computer (see shared/progress.ts). */
  progress: Record<string, Progress>
  /** Progress from before accounts kept their own; goes to the first account that signs in. */
  legacyProgress?: Progress
}

/** Gives a workspace saved before tabs existed its single chat as the first tab. */
export function normalizeWorkspace(ws: Workspace): Workspace {
  if (!ws.tabs?.length) {
    // The first tab reuses the workspace id, so the chat already saved under that id is kept.
    ws.tabs = [{ id: ws.id, title: '', sessionId: ws.sessionId }]
    delete ws.sessionId
  }
  if (!ws.tabs.some((t) => t.id === ws.activeTab)) ws.activeTab = ws.tabs[0].id
  return ws
}

export type ChatRole = 'user' | 'assistant' | 'tool' | 'result' | 'error' | 'info' | 'command'

export interface ChatItem {
  id: string
  role: ChatRole
  text: string
  /** Tool name for role "tool". */
  tool?: string
  ts: number
  durationMs?: number
  costUsd?: number
  /** For role "result": tokens this reply used. */
  tokens?: TokenUsage
  /** For role "result": the model that answered. */
  model?: string
  /** For role "command": whether the command exited successfully. */
  ok?: boolean
  /** For role "user": files attached to the message. */
  files?: Attachment[]
}

export interface ClaudeStatus {
  installed: boolean
  loggedIn: boolean
  version?: string
  email?: string
  plan?: string
}

export interface GithubStatus {
  installed: boolean
  loggedIn: boolean
  login?: string
}

export interface GithubRepo {
  nameWithOwner: string
  description: string
  isPrivate: boolean
  updatedAt: string
}

export interface DiffFile {
  path: string
  added: number
  removed: number
  /** Unified diff text for this file. */
  patch: string
}

export interface DeviceCode {
  code: string
  url: string
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'midnight',
  accent: '#7c8cff',
  fontSize: 14,
  language: 'th',
  permissionMode: 'acceptEdits',
  model: '',
  effort: '',
  models: [],
  modelsCustomized: false,
  branchPattern: 'takode/{name}',
  autoUpdate: true,
  uiScale: 100,
  density: 'normal',
  radius: 10,
  uiFont: 'system',
  codeFontSize: 13,
  motion: true,
  bubbleStyle: 'bubble',
  sendKey: 'enter',
  toolCalls: 'all',
  showTokens: true,
  showCost: false,
  autoScroll: true,
  notifyDone: 'background',
  notifySound: true,
  confirmArchive: true,
  archiveDeleteBranch: false,
  branchCheckMinutes: 2,
  showLevel: true,
  ringStyle: 'basic',
  levelUpEffect: 'confetti',
  sendRipple: false,
  aura: false,
  rgbFrame: false,
  skippedVersion: '',
  homeDir: '',
  liteEffects: false,
  pauseUnfocused: true,
  chatLimit: 300,
  terminalIdleMinutes: 60,
  spellcheck: true,
  hardwareAccel: true,
  hideAi: false,
  sidebarGroup: 'repo'
}
