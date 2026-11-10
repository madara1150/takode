// JSON-file persistence. No Electron imports so it can be unit-tested.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { EMPTY_STATS } from '../shared/level'
import { DEFAULT_MODELS } from '../shared/models'
import { DEFAULT_SETTINGS, normalizeRepo, normalizeWorkspace, type AppState, type ChatItem } from '../shared/types'

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

export class Store {
  state: AppState
  private chats = new Map<string, ChatItem[]>()
  private file: string

  constructor(
    private dir: string,
    defaultHome: string
  ) {
    this.file = path.join(dir, 'state.json')
    const saved = readJson<Partial<AppState>>(this.file, {})
    this.state = {
      settings: { ...DEFAULT_SETTINGS, homeDir: defaultHome, ...saved.settings },
      repos: (saved.repos ?? []).map(normalizeRepo),
      workspaces: (saved.workspaces ?? []).map(normalizeWorkspace),
      spotlights: saved.spotlights ?? [],
      quota: saved.quota,
      stats: { ...EMPTY_STATS(), ...saved.stats },
      unlocks: saved.unlocks ?? [],
      redeemed: saved.redeemed ?? [],
      progress: saved.progress ?? {},
      legacyProgress: saved.legacyProgress,
      auth: { mode: 'signedOut', server: process.env.TAKODE_SERVER ?? '', ...saved.auth }
    }
    if (!this.state.settings.homeDir) this.state.settings.homeDir = defaultHome
    // Before progress was kept per account it lived in one place; keep it for the first account.
    if (!saved.progress) {
      const s = this.state
      if (s.stats.xp > 0 || s.unlocks.length || s.redeemed.length) {
        s.legacyProgress = { stats: { ...s.stats }, unlocks: [...s.unlocks], redeemed: [...s.redeemed], updatedAt: Date.now() }
      }
    }
    const settings = this.state.settings
    if (!settings.models?.length) settings.models = DEFAULT_MODELS.map((m) => ({ ...m }))
    // Lists saved before this flag existed count as customised only if something was changed.
    if (saved.settings?.modelsCustomized === undefined) {
      settings.modelsCustomized = settings.models.some((m) => m.permission || m.effort || !m.enabled)
    }
    if (!this.state.settings.branchPattern) this.state.settings.branchPattern = DEFAULT_SETTINGS.branchPattern
  }

  save(): void {
    writeJson(this.file, this.state)
  }

  private chatFile(wsId: string): string {
    return path.join(this.dir, 'chats', `${wsId}.json`)
  }

  /** Chats kept in memory; older ones are read from disk again when opened. */
  maxCachedChats = 12

  chat(wsId: string): ChatItem[] {
    let items = this.chats.get(wsId)
    if (items) this.chats.delete(wsId)
    else items = readJson<ChatItem[]>(this.chatFile(wsId), [])
    // Map order = least recently used first.
    this.chats.set(wsId, items)
    this.trimChats(this.maxCachedChats)
    return items
  }

  /** Forgets all but the `keep` most recently used chats (they stay on disk). */
  trimChats(keep: number): void {
    for (const key of this.chats.keys()) {
      if (this.chats.size <= keep) break
      this.chats.delete(key)
    }
  }

  get cachedChats(): number {
    return this.chats.size
  }

  addChat(wsId: string, item: ChatItem): void {
    this.chat(wsId).push(item)
    writeJson(this.chatFile(wsId), this.chat(wsId))
  }

  /** Where files attached in a chat tab are copied. */
  attachDir(tabId: string): string {
    return path.join(this.dir, 'attachments', tabId)
  }

  deleteChat(tabId: string): void {
    this.chats.delete(tabId)
    rmSync(this.chatFile(tabId), { force: true })
    rmSync(this.attachDir(tabId), { recursive: true, force: true })
  }

  clearChat(wsId: string): void {
    this.chats.set(wsId, [])
    rmSync(this.attachDir(wsId), { recursive: true, force: true })
    if (existsSync(this.chatFile(wsId))) writeJson(this.chatFile(wsId), [])
  }
}
