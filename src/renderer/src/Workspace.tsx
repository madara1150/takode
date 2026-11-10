import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { PrFeedback } from '../../shared/feedback'
import { activeXp, compact, estimateTokens, levelFor, totalTokens } from '../../shared/level'
import { isUnlocked } from '../../shared/rewards'
import { EFFORTS, resolveRun } from '../../shared/models'
import { RUN_PLAN_PROMPT } from '../../shared/prompts'
import type { ChatItem, ChatTab, DiffFile, Effort, PermissionMode, Workspace } from '../../shared/types'

const MODE_ICON: Record<string, string> = { default: 'eye', acceptEdits: 'code', bypassPermissions: 'bolt', plan: 'list' }
const MODE_LABEL = { default: 'permAsk', acceptEdits: 'permAccept', bypassPermissions: 'permBypass' } as const
const MODE_HINT = { default: 'permAskHint', acceptEdits: 'permAcceptHint', bypassPermissions: 'permBypassHint' } as const
import { call, on } from './api'
import { useApp } from './App'
import { errorText, useT, type T } from './i18n'
import { BranchBadge } from './BranchBadge'
import { FileIcon } from './FileIcon'
import { Splitter, useStoredWidth } from './Splitter'
import { TerminalView } from './Terminal'
import { FilesView, openInEditor } from './Editor'
import { AskCard, usePermissionRequests } from './Ask'
import { lastRows } from '../../shared/perf'
import { activeMention, insertMention, MAX_ATTACHMENTS, rankFiles, type Attachment } from '../../shared/attach'
import { AttachChips, attachFiles, MentionMenu, PlusMenu, UserMessage } from './Attach'
import { Icon } from './icons'
import { EffortIcon, Select } from './Select'

/** The chat never gets narrower than this. */
const CHAT_MIN = 380

export function WorkspaceView({ ws }: { ws: Workspace }): ReactElement {
  const { state, busy, setModal, run, toast, toggleSpotlight } = useApp()
  const t = useT()
  const repo = state.repos.find((r) => r.id === ws.repoId)!
  const isBusy = ws.tabs.some((tab) => busy.includes(tab.id))
  const spot = state.spotlights.find((s) => s.repoId === ws.repoId)
  const spotHere = spot?.workspaceId === ws.id
  const spotOther = spot && !spotHere ? state.workspaces.find((w) => w.id === spot.workspaceId) : undefined

  const [files, setFiles] = useState<DiffFile[]>([])
  const [openMenu, setOpenMenu] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [panelWidth, setPanelWidth, resetPanelWidth] = useStoredWidth('layout.panel', 520)
  // The right panel can take the whole width, e.g. while editing code.
  const [wide, setWide] = useState(false)
  const [feedback, setFeedback] = useState<PrFeedback | null>(null)

  // Look for new review comments while the workspace has a pull request.
  useEffect(() => {
    if (!ws.prUrl) return setFeedback(null)
    const check = (): void => void call<PrFeedback | null>('ws:feedback', ws.id).then(setFeedback, () => undefined)
    check()
    const timer = setInterval(check, 60_000)
    return () => clearInterval(timer)
  }, [ws.id, ws.prUrl, ws.feedbackHandledAt])

  const refreshDiff = useCallback(() => {
    void call<DiffFile[]>('ws:diff', ws.id).then(setFiles, () => setFiles([]))
  }, [ws.id])

  useEffect(() => {
    refreshDiff()
    // Any chat tab of this workspace can change files.
    return on('chat:item', (p: { wsId: string; item: ChatItem }) => {
      if (p.wsId === ws.id && (p.item.role === 'tool' || p.item.role === 'result' || p.item.role === 'command')) {
        setTimeout(refreshDiff, 400)
      }
    })
  }, [ws.id, refreshDiff])
  const tab = ws.tabs.find((x) => x.id === ws.activeTab) ?? ws.tabs[0]

  const open = (how: string): void => {
    setOpenMenu(false)
    void run(() => call('ws:open', ws.id, how))
  }

  return (
    <div className="workspace">
      <header className="ws-header drag">
        <div className="ws-title">
          <h2>{ws.name}</h2>
          <BranchChip ws={ws} />
          <BranchBadge info={ws.git} withLabel />
          <span className="muted small">
            {repo.name} · {ws.baseBranch}
          </span>
        </div>
        <div className="ws-actions no-drag">
          {(repo.actions.spotlight || spotHere) && (
          <button
            className={`btn ${spotHere ? 'lit' : ''}`}
            title={t('spotlightTip')}
            aria-pressed={spotHere}
            onClick={() => toggleSpotlight(ws)}
            data-testid="spotlight"
          >
            <Icon name="spotlight" />
            {t('spotlight')}
          </button>
          )}
          <PullButton ws={ws} onPulled={refreshDiff} />
          <button className="btn" onClick={() => setModal({ type: 'push', wsId: ws.id })}>
            <Icon name="upload" />
            {t('push')}
          </button>
          {ws.prUrl ? (
            <button className="btn" onClick={() => void call('app:openExternal', ws.prUrl)}>
              <Icon name="external" />
              {t('viewPr')}
            </button>
          ) : (
            <button className="btn" onClick={() => setModal({ type: 'createPr', wsId: ws.id })}>
              <Icon name="pr" />
              {t('createPr')}
            </button>
          )}
          <div className="menu-wrap">
            <button className="btn" aria-haspopup="menu" aria-expanded={openMenu} onClick={() => setOpenMenu((v) => !v)}>
              <Icon name="folder" />
              {t('openIn')}
            </button>
            {openMenu && (
              <div className="menu" role="menu">
                <button role="menuitem" onClick={() => open('editor')} data-testid="open-vscode">
                  <Icon name="code" size={14} />
                  {t('editor')}
                </button>
                <button role="menuitem" onClick={() => open('finder')}>
                  <Icon name="folder" size={14} />
                  {t('finder')}
                </button>
                <button role="menuitem" onClick={() => open('terminal')}>
                  <Icon name="terminal" size={14} />
                  {t('terminal')}
                </button>
              </div>
            )}
          </div>
          <button
            className="icon-btn"
            title={t('archive')}
            aria-label={t('archive')}
            onClick={() =>
              state.settings.confirmArchive
                ? setModal({ type: 'archive', wsId: ws.id })
                : void run(() => call('ws:archive', ws.id, state.settings.archiveDeleteBranch))
            }
          >
            <Icon name="trash" />
          </button>
        </div>
      </header>

      {spotHere && (
        <div className="banner lit">
          <Icon name="spotlight" />
          <span>
            {t('spotlightBanner')} <code>{repo.path}</code>
          </span>
          <button
            className="btn small"
            onClick={() =>
              void run(async () => {
                await call('spotlight:on', ws.id)
                toast(t('spotlightSyncToast'))
              })
            }
          >
            {t('spotlightSync')}
          </button>
          <button className="btn small" onClick={() => toggleSpotlight(ws)}>
            {t('spotlightOff')}
          </button>
        </div>
      )}
      {feedback && (feedback.items.length > 0 || feedback.changesRequested) && (
        <div className="banner warn">
          <Icon name="chat" />
          <span>
            {feedback.changesRequested && <strong>{t('changesRequested')} · </strong>}
            {t('feedbackBanner', { n: feedback.items.length })}
          </span>
          <button className="btn small" onClick={() => void call('app:openExternal', ws.prUrl)}>
            {t('viewPr')}
          </button>
          <button
            className="btn small primary"
            disabled={isBusy || feedback.items.length === 0}
            onClick={() => void run(() => call('ws:fixFeedback', ws.id))}
          >
            <Icon name="tool" size={14} />
            {t('fixFeedback')}
          </button>
        </div>
      )}
      {spotOther && (
        <div className="banner">
          <Icon name="spotlight" />
          <span>{t('spotlightOther', { name: spotOther.name })}</span>
          <button className="btn small" onClick={() => toggleSpotlight(ws)}>
            {t('spotlightSwitch')}
          </button>
        </div>
      )}

      <div
        className={`ws-body ${wide ? 'wide' : ''}`}
        ref={bodyRef}
        style={{
          gridTemplateColumns: wide ? '0 0 1fr' : `minmax(${CHAT_MIN}px, 1fr) 0 min(${panelWidth}px, calc(100% - ${CHAT_MIN}px))`
        }}
      >
        <section className="chat-area" aria-hidden={wide || undefined}>
          <ChatTabs ws={ws} />
          <Chat key={tab.id} ws={ws} tab={tab} busy={busy.includes(tab.id)} />
        </section>
        <Splitter
          side="right"
          label={t('resizePanel')}
          value={panelWidth}
          min={260}
          max={() => (bodyRef.current?.clientWidth ?? 1200) - CHAT_MIN}
          onChange={setPanelWidth}
          onReset={resetPanelWidth}
        />
        <SidePanel ws={ws} files={files} onRefresh={refreshDiff} wide={wide} onWide={setWide} />
      </div>
    </div>
  )
}

// ── Chat ────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/** Small Markdown subset: fenced code, inline code and bold. */
function renderText(text: string): ReactNode[] {
  const out: ReactNode[] = []
  text.split(/```/).forEach((part, i) => {
    if (i % 2 === 1) {
      out.push(<pre key={i}>{part.replace(/^[a-zA-Z0-9_+-]*\n/, '')}</pre>)
      return
    }
    const inline = part.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).map((seg, j) => {
      if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) return <code key={j}>{seg.slice(1, -1)}</code>
      if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
        return <strong key={j}>{seg.slice(2, -2).replaceAll('`', '')}</strong>
      }
      return seg
    })
    out.push(<span key={i}>{inline}</span>)
  })
  return out
}

/** Shows tool paths relative to the workspace (macOS may prefix them with /private). */
function relativeTo(text: string, cwd: string): string {
  const at = text.indexOf(`${cwd}/`)
  return at >= 0 && at <= '/private'.length ? text.slice(at + cwd.length + 1) : text
}

function infoText(t: T, text: string): { text: string; detail?: string; error?: boolean } {
  if (text === 'stopped') return { text: t('stopped') }
  if (text === 'setup:done') return { text: t('setupDone') }
  if (text.startsWith('renamed:')) return { text: t('renamed', { branch: text.slice(8) }) }
  if (text.startsWith('renamed-pr:')) {
    const [branch, old] = text.slice(11).split(':')
    return { text: `${t('renamed', { branch })} ${t('renamedPr', { old })}` }
  }
  if (text.startsWith('setup:start:')) return { text: t('setupStart', { cmd: text.slice(12) }) }
  if (text.startsWith('setup:fail:')) return { text: t('setupFail'), detail: text.slice(11), error: true }
  if (text.startsWith('pull:done:')) {
    const [base, own, branch] = text.slice(10).split(':')
    const parts = [Number(base) > 0 && t('pullDoneBase', { n: base, branch }), Number(own) > 0 && t('pullDoneOwn', { n: own })]
    return { text: parts.filter(Boolean).join(' ') }
  }
  if (text.startsWith('pull:conflict:')) return { text: t('pullConflictInfo'), detail: text.slice(14), error: true }
  return { text }
}

function Message({ item, cwd, wsId }: { item: ChatItem; cwd: string; wsId?: string }): ReactElement | null {
  const t = useT()
  const settings = useApp().state.settings
  switch (item.role) {
    case 'user':
      return <UserMessage text={item.text} files={item.files} onOpenFile={wsId ? (path) => openInEditor(wsId, path) : undefined} />
    case 'assistant':
      return <div className="msg assistant">{renderText(item.text)}</div>
    case 'tool':
      return (
        <div className="msg tool">
          <Icon name="tool" size={13} />
          <strong>{item.tool}</strong>
          <span>{relativeTo(item.text, cwd)}</span>
        </div>
      )
    case 'error':
      return <div className="msg error">{item.text}</div>
    case 'command':
      return (
        <div className={`msg command ${item.ok ? '' : 'bad'}`}>
          <div className="msg tool">
            <Icon name="play" size={13} />
            <strong>{item.tool}</strong>
            <span>{item.ok ? '✓' : '✗'}</span>
          </div>
          <pre>{item.text}</pre>
        </div>
      )
    case 'result':
      return item.durationMs ? (
        <div className="msg meta result-meta">
          <span>{t('finishedIn', { time: formatDuration(item.durationMs) })}</span>
          {item.model && <span className="model-tag">{item.model}</span>}
          {settings.showTokens && item.tokens && (
            <span
              className="token-tag"
              title={t('tokensTip', {
                input: (item.tokens.input + item.tokens.cacheWrite + item.tokens.cacheRead).toLocaleString(),
                cacheRead: item.tokens.cacheRead.toLocaleString(),
                output: item.tokens.output.toLocaleString()
              })}
            >
              <Icon name="coin" size={12} />
              {t('tokensReply', { n: compact(totalTokens(item.tokens)) })}
            </span>
          )}
          {settings.showCost && typeof item.costUsd === 'number' && <span className="token-tag cost-tag">${item.costUsd.toFixed(3)}</span>}
        </div>
      ) : null
    case 'info': {
      const info = infoText(t, item.text)
      return (
        <div className={`msg meta ${info.error ? 'bad' : ''}`}>
          {info.text}
          {info.detail && <pre>{info.detail}</pre>}
        </div>
      )
    }
  }
}

// ── Chat tabs ───────────────────────────────────────────────────────────────

function ChatTabs({ ws }: { ws: Workspace }): ReactElement {
  const { busy, run } = useApp()
  const t = useT()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const label = (tab: ChatTab, i: number): string => tab.title || t('chatN', { n: i + 1 })

  const close = (tab: ChatTab): void => {
    if (busy.includes(tab.id) && !window.confirm(t('closeChatBusy'))) return
    void run(() => call('tabs:close', ws.id, tab.id))
  }
  const saveName = (tab: ChatTab): void => {
    setEditing(null)
    if (draft.trim() !== tab.title) void call('tabs:rename', ws.id, tab.id, draft)
  }

  return (
    <div className="chat-tabs" role="tablist" aria-label={t('chatN', { n: '' }).trim()}>
      {ws.tabs.map((tab, i) => {
        const active = tab.id === ws.activeTab
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            className={`chat-tab ${active ? 'active' : ''}`}
            title={`${label(tab, i)} · ${t('renameHint')}`}
            onClick={() => !active && void call('tabs:select', ws.id, tab.id)}
            onKeyDown={(e) => e.key === 'Enter' && void call('tabs:select', ws.id, tab.id)}
            onDoubleClick={() => {
              setDraft(tab.title || label(tab, i))
              setEditing(tab.id)
            }}
            onAuxClick={(e) => e.button === 1 && close(tab)}
          >
            <span className={`tab-dot ${busy.includes(tab.id) ? 'busy' : ''}`} />
            {editing === tab.id ? (
              <input
                autoFocus
                className="tab-rename"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => saveName(tab)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName(tab)
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setEditing(null)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="tab-title">{label(tab, i)}</span>
            )}
            {(ws.tabs.length > 1 || tab.title) && (
              <button
                className="tab-close"
                aria-label={`${t('closeChat')}: ${label(tab, i)}`}
                title={t('closeChat')}
                onClick={(e) => {
                  e.stopPropagation()
                  close(tab)
                }}
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        )
      })}
      <button className="icon-btn tab-add" title={t('newChat')} aria-label={t('newChat')} onClick={() => void run(() => call('tabs:add', ws.id))} data-testid="new-tab">
        <Icon name="plus" size={15} />
      </button>
    </div>
  )
}

type Row = { kind: 'item'; item: ChatItem } | { kind: 'tools'; items: ChatItem[] }

/** Applies the "tool calls" setting: show each, fold runs of them into one line, or leave them out. */
function rowsFor(items: ChatItem[], mode: 'all' | 'compact' | 'hidden'): Row[] {
  const rows: Row[] = []
  for (const item of items) {
    if (item.role !== 'tool' || mode === 'all') {
      rows.push({ kind: 'item', item })
      continue
    }
    if (mode === 'hidden') continue
    const last = rows.at(-1)
    if (last?.kind === 'tools') last.items.push(item)
    else rows.push({ kind: 'tools', items: [item] })
  }
  return rows
}

function ToolGroup({ items, cwd }: { items: ChatItem[]; cwd: string }): ReactElement {
  const t = useT()
  const names = [...new Set(items.map((i) => i.tool))].join(', ')
  return (
    <details className="tool-group">
      <summary className="msg tool">
        <Icon name="tool" size={13} />
        <strong>{t('toolCallsN', { n: items.length })}</strong>
        <span>{names}</span>
      </summary>
      {items.map((item) => (
        <Message key={item.id} item={item} cwd={cwd} />
      ))}
    </details>
  )
}

function Chat({ ws, tab, busy }: { ws: Workspace; tab: ChatTab; busy: boolean }): ReactElement {
  const { state, run } = useApp()
  const t = useT()
  const [items, setItems] = useState<ChatItem[]>([])
  // Extra older messages the user asked to see beyond the performance limit.
  const [more, setMore] = useState(0)

  useEffect(() => {
    setMore(0)
    void call<ChatItem[]>('chat:get', tab.id).then(setItems)
    return on('chat:item', (p: { tabId: string; item: ChatItem }) => {
      if (p.tabId === tab.id) setItems((prev) => [...prev, p.item])
    })
  }, [tab.id])
  const repo = state.repos.find((r) => r.id === ws.repoId)!
  const custom = repo.actions.custom.filter((a) => a.name.trim() && a.command.trim())
  const [running, setRunning] = useState<string[]>([])
  const [text, setText] = useState('')

  useEffect(() => {
    void call<string[]>('actions:running').then(setRunning)
    return on('actions:running', setRunning)
  }, [])
  const agent = (action: string): void => void run(() => call('ws:agentAction', ws.id, action))
  const set = (patch: Partial<Pick<Workspace, 'model' | 'effort' | 'planMode' | 'permission'>>): void =>
    void call('ws:update', ws.id, patch)
  const model = ws.model ?? state.settings.model
  const models = state.settings.models.filter((m) => m.enabled || m.id === model)
  // Effort levels the chosen model accepts (undefined = not known, offer all).
  const efforts = state.settings.models.find((m) => m.id === model)?.efforts
  const effortLabel: Record<string, string> = {
    low: t('effortLow'), medium: t('effortMedium'), high: t('effortHigh'), xhigh: t('effortXhigh'), max: t('effortMax')
  }
  // The effort actually used, so the box colour matches even when it comes from a default.
  const effort = resolveRun(state.settings, ws).effort
  // How freely Claude acts here; plan mode is its own toggle.
  const mode: PermissionMode = ws.permission ?? (state.settings.permissionMode === 'plan' ? 'acceptEdits' : state.settings.permissionMode)
  const asks = usePermissionRequests().filter((r) => r.tabId === tab.id)
  const canRunPlan = !!ws.planMode && !busy && items.some((i) => i.role === 'assistant')
  const runPlan = (): void =>
    void run(async () => {
      await call('ws:update', ws.id, { planMode: false })
      await call('claude:send', ws.id, RUN_PLAN_PROMPT, tab.id)
    })
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (state.settings.autoScroll) endRef.current?.scrollIntoView({ block: 'end' })
  }, [items.length, busy, state.settings.autoScroll])
  // Tokens this chat has used so far, and a rough count for what is being typed.
  const chatTokens = items.reduce((n, i) => n + (i.tokens ? totalTokens(i.tokens) : 0), 0)
  const draftTokens = estimateTokens(text)
  useEffect(() => inputRef.current?.focus(), [tab.id])

  const [ripple, setRipple] = useState(0)
  const rippleOn = state.settings.sendRipple && isUnlocked('effect', 'ripple', levelFor(activeXp(state)).level)
  // Files attached to the next message, and the @file search while typing.
  const [attached, setAttached] = useState<Attachment[]>([])
  const [attachError, setAttachError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [projectFiles, setProjectFiles] = useState<string[] | null>(null)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  useEffect(() => {
    setAttached([])
    setMention(null)
  }, [tab.id])
  useEffect(() => setProjectFiles(null), [ws.id])
  const mentionItems = mention && projectFiles ? rankFiles(projectFiles, mention.query, 8) : []

  const addFiles = (load: Promise<Attachment[]>): void => {
    setAttachError('')
    void load
      .then((files) => setAttached((prev) => [...prev, ...files].slice(0, MAX_ATTACHMENTS)))
      .catch((err) => setAttachError(errorText(t, err)))
  }
  const trackMention = (value: string, caret: number): void => {
    const next = activeMention(value, caret)
    setMention(next)
    setMentionIndex(0)
    if (next && projectFiles === null) void call<string[]>('ws:files', ws.id).then(setProjectFiles, () => setProjectFiles([]))
  }
  const pickMention = (path: string): void => {
    const box = inputRef.current
    const res = insertMention(text, box?.selectionStart ?? text.length, path)
    setText(res.text)
    setMention(null)
    requestAnimationFrame(() => {
      box?.focus()
      box?.setSelectionRange(res.caret, res.caret)
    })
  }
  const startMention = (): void => {
    const box = inputRef.current
    const caret = box?.selectionStart ?? text.length
    const before = text.slice(0, caret)
    const insert = before && !/\s$/.test(before) ? ' @' : '@'
    const value = before + insert + text.slice(caret)
    setText(value)
    trackMention(value, caret + insert.length)
    requestAnimationFrame(() => {
      box?.focus()
      box?.setSelectionRange(caret + insert.length, caret + insert.length)
    })
  }

  const submit = (): void => {
    const prompt = text.trim()
    if ((!prompt && !attached.length) || busy) return
    if (rippleOn) setRipple((n) => n + 1)
    const files = attached
    setText('')
    setAttached([])
    setMention(null)
    void run(() => call('claude:send', ws.id, prompt, tab.id, files))
  }

  const limit = state.settings.chatLimit ?? 0
  const { shown, hidden } = lastRows(rowsFor(items, state.settings.toolCalls), limit ? limit + more : 0)

  return (
    <div className="chat">
      <div className="chat-scroll">
        {items.length === 0 ? (
          <div className="chat-empty">
            <Icon name="chat" size={28} />
            <strong>{t('emptyChatTitle')}</strong>
            <span className="muted">{t('emptyChatBody', { branch: ws.branch, base: ws.baseBranch })}</span>
          </div>
        ) : (
          <div className="thread">
            {hidden > 0 && (
              <button className="chip-btn show-earlier" onClick={() => setMore((n) => n + Math.max(50, limit))}>
                <Icon name="chevron" size={13} />
                {t('showEarlier', { n: hidden })}
              </button>
            )}
            {shown.map((row) =>
              row.kind === 'item' ? (
                <Message key={row.item.id} item={row.item} cwd={ws.path} wsId={ws.id} />
              ) : (
                <ToolGroup key={row.items[0].id} items={row.items} cwd={ws.path} />
              )
            )}
            {busy && (
              <div className="msg meta working">
                <span className="pulse" />
                {t('working')}
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="quick-bar" role="toolbar" aria-label={t('actions')}>
        <button className="chip-btn" disabled={busy} onClick={() => agent('review')}>
          <Icon name="eye" size={14} />
          {t('review')}
        </button>
        <button className="chip-btn" disabled={busy} onClick={() => agent('fixErrors')}>
          <Icon name="tool" size={14} />
          {t('fixErrors')}
        </button>
        <button className="chip-btn" disabled={busy} onClick={() => agent('resolveConflicts')}>
          <Icon name="branch" size={14} />
          {t('resolveConflicts')}
        </button>
        {canRunPlan && (
          <button className="chip-btn on" onClick={runPlan}>
            <Icon name="play" size={13} />
            {t('runPlan')}
          </button>
        )}
        {custom.length > 0 && <span className="quick-sep" />}
        {custom.map((a) => {
          const active = running.includes(`${ws.id}:${a.id}`)
          return (
            <button
              key={a.id}
              className={`chip-btn ${active ? 'on' : ''}`}
              title={active ? t('stopAction', { name: a.name }) : a.command}
              onClick={() => void run(() => call('ws:runAction', ws.id, a.id))}
            >
              <Icon name={active ? 'stop' : 'play'} size={13} />
              {a.name}
            </button>
          )
        })}
      </div>
      {asks.map((r) => (
        <AskCard key={r.id} req={r} />
      ))}
      <div
        className={`composer effort-${effort || 'auto'} ${ws.planMode ? 'planning' : ''} ${dragging ? 'dropping' : ''}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={(e) => {
          setDragging(false)
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          addFiles(attachFiles(tab.id, [...e.dataTransfer.files]))
        }}
      >
        {ripple > 0 && <span key={ripple} className="send-ripple" aria-hidden="true" />}
        {dragging && (
          <div className="drop-hint" aria-hidden="true">
            <Icon name="upload" size={18} />
            {t('attachDrop')}
          </div>
        )}
        {mention && (
          <MentionMenu
            items={projectFiles === null ? [] : mentionItems}
            active={mentionIndex}
            onHover={setMentionIndex}
            onPick={pickMention}
          />
        )}
        {attached.length > 0 && (
          <AttachChips files={attached} onRemove={(f) => setAttached((prev) => prev.filter((x) => x.path !== f.path))} />
        )}
        {attachError && <div className="attach-error small">{attachError}</div>}
        <textarea
          ref={inputRef}
          value={text}
          rows={Math.min(8, Math.max(2, text.split('\n').length))}
          placeholder={t('composerPlaceholder')}
          aria-label={t('composerPlaceholder')}
          onChange={(e) => {
            setText(e.target.value)
            trackMention(e.target.value, e.target.selectionStart)
          }}
          onClick={(e) => trackMention(text, e.currentTarget.selectionStart)}
          onBlur={() => setMention(null)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (!files.length) return
            e.preventDefault()
            addFiles(attachFiles(tab.id, files))
          }}
          onKeyDown={(e) => {
            if (mention && !e.nativeEvent.isComposing) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const n = Math.max(mentionItems.length, 1)
                setMentionIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
                return
              }
              if ((e.key === 'Enter' || e.key === 'Tab') && mentionItems.length) {
                e.preventDefault()
                pickMention(mentionItems[mentionIndex] ?? mentionItems[0])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMention(null)
                return
              }
            }
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
            const mod = e.metaKey || e.ctrlKey
            const send = state.settings.sendKey === 'mod-enter' ? mod : !e.shiftKey && !mod
            if (send) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {state.settings.showTokens && (chatTokens > 0 || draftTokens > 0) && (
          <div className="composer-meta" aria-live="off">
            {draftTokens > 0 && <span>{t('tokensDraft', { n: compact(draftTokens) })}</span>}
            {chatTokens > 0 && (
              <span>
                <Icon name="coin" size={12} />
                {t('tokensChat', { n: compact(chatTokens) })}
              </span>
            )}
          </div>
        )}
        <div className="composer-row">
          <PlusMenu
            disabled={attached.length >= MAX_ATTACHMENTS}
            onAttach={() => addFiles(call<Attachment[]>('attach:pick', tab.id))}
            onMention={startMention}
          />
          <Select
            variant="pill"
            value={model}
            ariaLabel={t('model')}
            title={t('model')}
            icon={<Icon name="sparkle" size={14} />}
            options={models.map((m) => ({ value: m.id, label: m.label || m.id, hint: m.resolved || m.id || undefined }))}
            onChange={(value) => set({ model: value })}
          />
          {efforts?.length !== 0 && (
          <Select<Effort>
            variant="pill"
            value={ws.effort ?? ''}
            ariaLabel={t('effort')}
            title={t('effort')}
            icon={<EffortIcon level={effort} />}
            options={[
              { value: '', label: t('effortAuto'), icon: <EffortIcon level="" /> },
              ...EFFORTS.filter((e) => !efforts || efforts.includes(e)).map((e) => ({
                value: e,
                label: effortLabel[e],
                icon: <EffortIcon level={e} />
              }))
            ]}
            onChange={(value) => set({ effort: value })}
          />
          )}
          <Select<PermissionMode>
            variant="pill"
            value={mode}
            ariaLabel={t('permission')}
            title={t('permission')}
            icon={<Icon name={MODE_ICON[mode]} size={14} />}
            options={(['default', 'acceptEdits', 'bypassPermissions'] as const).map((m) => ({
              value: m,
              label: t(MODE_LABEL[m]),
              hint: t(MODE_HINT[m]),
              icon: <Icon name={MODE_ICON[m]} size={14} />
            }))}
            onChange={(permission) => set({ permission })}
          />
          <button
            type="button"
            className={`select pill plan-toggle ${ws.planMode ? 'on' : ''}`}
            aria-pressed={!!ws.planMode}
            title={t('planModeTip')}
            onClick={() => set({ planMode: !ws.planMode })}
            data-testid="plan-toggle"
          >
            <span className="select-icon">
              <Icon name="list" size={14} />
            </span>
            <span className="select-label">{t('planMode')}</span>
            <span className="plan-dot" />
          </button>
          <span className="spacer" />
          {items.length > 0 && !busy && (
            <button
              className="icon-btn"
              title={t('clearChat')}
              aria-label={t('clearChat')}
              onClick={() => void run(() => call('chat:clear', ws.id, tab.id)).then(() => setItems([]))}
            >
              <Icon name="refresh" size={15} />
            </button>
          )}
          {busy ? (
            <button className="btn danger" onClick={() => void call('claude:stop', ws.id, tab.id)}>
              <Icon name="stop" />
              {t('stop')}
            </button>
          ) : (
            <button className="btn primary" disabled={!text.trim() && !attached.length} onClick={submit} data-testid="send">
              {t('send')}
              <Icon name="send" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Right panel: changes and terminal ───────────────────────────────────────

type PanelView = 'changes' | 'files' | 'terminal'

function SidePanel({
  ws,
  files,
  onRefresh,
  wide,
  onWide
}: {
  ws: Workspace
  files: DiffFile[]
  onRefresh: () => void
  wide: boolean
  onWide: (wide: boolean) => void
}): ReactElement {
  const t = useT()
  const { run } = useApp()
  const [view, setView] = useState<PanelView>(() => {
    const saved = localStorage.getItem('sidePanel')
    return saved === 'terminal' || saved === 'files' ? saved : 'changes'
  })
  // The terminal is only started the first time it is opened, then kept.
  const [termOpened, setTermOpened] = useState(view === 'terminal')
  // Opening a file from anywhere switches to the Files tab.
  useEffect(() => {
    const onOpen = (e: Event): void => {
      if ((e as CustomEvent<{ wsId: string }>).detail.wsId === ws.id) setView('files')
    }
    window.addEventListener('takode:open-file', onOpen)
    return () => window.removeEventListener('takode:open-file', onOpen)
  }, [ws.id])
  const choose = (next: PanelView): void => {
    setView(next)
    if (next === 'terminal') setTermOpened(true)
    try {
      localStorage.setItem('sidePanel', next)
    } catch {
      /* storage unavailable */
    }
  }
  return (
    <aside className="side-panel">
      <div className="side-tabs" role="tablist">
        <button role="tab" aria-selected={view === 'changes'} className={view === 'changes' ? 'active' : ''} onClick={() => choose('changes')}>
          <Icon name="list" size={14} />
          {t('changes')}
          {files.length > 0 && <span className="count">{files.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={view === 'files'}
          className={view === 'files' ? 'active' : ''}
          onClick={() => choose('files')}
          data-testid="tab-files"
        >
          <Icon name="code" size={14} />
          {t('filesTab')}
        </button>
        <button
          role="tab"
          aria-selected={view === 'terminal'}
          className={view === 'terminal' ? 'active' : ''}
          onClick={() => choose('terminal')}
          data-testid="tab-terminal"
        >
          <Icon name="terminal" size={14} />
          {t('terminal')}
        </button>
        <span className="spacer" />
        <button
          className="icon-btn"
          title={wide ? t('panelNarrow') : t('panelWide')}
          aria-label={wide ? t('panelNarrow') : t('panelWide')}
          aria-pressed={wide}
          onClick={() => onWide(!wide)}
          data-testid="panel-wide"
        >
          <Icon name={wide ? 'collapse' : 'expand'} size={14} />
        </button>
      </div>
      <div className="side-body" hidden={view !== 'changes'}>
        <Changes
          files={files}
          onRefresh={onRefresh}
          onEdit={(p) => openInEditor(ws.id, p)}
          onCode={(p) => void run(() => call('ws:openCode', ws.id, p))}
        />
      </div>
      <div className="side-body" hidden={view !== 'files'}>
        <FilesView ws={ws} visible={view === 'files'} onSaved={onRefresh} />
      </div>
      {termOpened && (
        <div className="side-body" hidden={view !== 'terminal'}>
          <TerminalView key={ws.id} wsId={ws.id} visible={view === 'terminal'} />
        </div>
      )}
    </aside>
  )
}

// ── Changes ─────────────────────────────────────────────────────────────────

function Changes({
  files,
  onRefresh,
  onEdit,
  onCode
}: {
  files: DiffFile[]
  onRefresh: () => void
  onEdit: (path: string) => void
  onCode: (path: string) => void
}): ReactElement {
  const t = useT()
  const [openPath, setOpenPath] = useState<string | null>(null)
  const current = files.find((f) => f.path === openPath) ?? files[0]
  const added = files.reduce((n, f) => n + f.added, 0)
  const removed = files.reduce((n, f) => n + f.removed, 0)

  return (
    <aside className="changes">
      <div className="changes-head">
        <strong>{t('changes')}</strong>
        {files.length > 0 && (
          <span className="small">
            <span className="muted">{t('files', { n: files.length })}</span> <span className="add">+{added}</span>{' '}
            <span className="del">−{removed}</span>
          </span>
        )}
        <span className="spacer" />
        <button className="icon-btn" title={t('refresh')} aria-label={t('refresh')} onClick={onRefresh}>
          <Icon name="refresh" size={14} />
        </button>
      </div>
      {files.length === 0 ? (
        <p className="changes-empty muted">{t('noChanges')}</p>
      ) : (
        <>
          <ul className="file-list">
            {files.map((f) => (
              <li key={f.path}>
                <button className={f.path === current?.path ? 'active' : ''} onClick={() => setOpenPath(f.path)}>
                  <FileIcon path={f.path} />
                  <span className="file-name" title={f.path}>{f.path}</span>
                  <span className="add">+{f.added}</span>
                  <span className="del">−{f.removed}</span>
                </button>
              </li>
            ))}
          </ul>
          {current && (
            <div className="patch-head small">
              <FileIcon path={current.path} size={13} />
              <span className="file-name">{current.path}</span>
              <span className="spacer" />
              <button className="btn small" onClick={() => onEdit(current.path)} data-testid="edit-file">
                <Icon name="code" size={13} />
                {t('editFile')}
              </button>
              <button className="btn small" onClick={() => onCode(current.path)} title={t('openInCode')}>
                <Icon name="external" size={13} />
                VS Code
              </button>
            </div>
          )}
          {current && <Patch patch={current.patch} />}
        </>
      )}
    </aside>
  )
}

function Patch({ patch }: { patch: string }): ReactElement {
  const lines = patch.split('\n')
  const start = lines.findIndex((l) => l.startsWith('@@'))
  const body = start === -1 ? [] : lines.slice(start)
  return (
    <pre className="patch" tabIndex={0}>
      {body.map((line, i) => {
        const cls = line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'plus' : line.startsWith('-') ? 'minus' : ''
        return (
          <span key={i} className={`line ${cls}`}>
            {line || ' '}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}

/** Brings in new commits from main (the base branch) and from this branch's remote copy. */
function PullButton({ ws, onPulled }: { ws: Workspace; onPulled: () => void }): ReactElement {
  const { run, toast } = useApp()
  const t = useT()
  const [pulling, setPulling] = useState(false)
  const behind = ws.git?.behind ?? 0
  const behindRemote = ws.git?.behindRemote ?? 0
  const waiting = behind + behindRemote
  const tip =
    waiting > 0
      ? [behind > 0 && t('pullTipBase', { n: behind, branch: ws.baseBranch }), behindRemote > 0 && t('pullTipOwn', { n: behindRemote })]
          .filter(Boolean)
          .join(' · ')
      : t('pullTipNone', { branch: ws.baseBranch })
  const pull = async (): Promise<void> => {
    setPulling(true)
    const res = await run(() => call<{ fromBase: number; fromRemote: number; fetched: boolean }>('ws:pull', ws.id))
    setPulling(false)
    onPulled()
    if (!res) return
    if (res.fromBase || res.fromRemote) toast(t('pullToast', { n: res.fromBase + res.fromRemote }))
    else toast(res.fetched ? t('pullUpToDate', { branch: ws.baseBranch }) : t('pullOffline'), res.fetched ? 'ok' : 'error')
  }
  return (
    <button
      className={`btn pull-btn ${waiting > 0 ? 'has-updates' : ''}`}
      title={tip}
      aria-label={`${t('pull')} – ${tip}`}
      disabled={pulling}
      onClick={() => void pull()}
      data-testid="pull"
    >
      <span className={`pull-icon ${pulling ? 'spin' : ''}`}>
        <Icon name={pulling ? 'refresh' : 'download'} />
      </span>
      {t('pull')}
      {waiting > 0 && <span className="pull-count">{waiting > 99 ? '99+' : waiting}</span>}
    </button>
  )
}

/** The branch name in the header; click to rename it. */
function BranchChip({ ws }: { ws: Workspace }): ReactElement {
  const { run } = useApp()
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(ws.branch)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!editing) setName(ws.branch)
  }, [ws.branch, editing])

  const save = async (): Promise<void> => {
    const wanted = name.trim()
    if (!wanted || wanted === ws.branch) return setEditing(false)
    setSaving(true)
    const done = await run(() => call<string>('ws:renameBranch', ws.id, wanted))
    setSaving(false)
    if (done !== undefined) setEditing(false)
  }

  if (editing) {
    return (
      <form
        className="chip branch-edit no-drag"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Icon name="branch" size={13} />
        <input
          autoFocus
          value={name}
          readOnly={saving}
          aria-label={t('renameBranch')}
          spellCheck={false}
          size={Math.max(12, name.length + 1)}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={() => !saving && void save()}
          data-testid="branch-input"
        />
      </form>
    )
  }
  return (
    <button className="chip branch-chip no-drag" title={t('renameBranchTip')} onClick={() => setEditing(true)} data-testid="branch-chip">
      <Icon name="branch" size={13} />
      {ws.branch}
      <span className="branch-pen">
        <Icon name="tool" size={11} />
      </span>
    </button>
  )
}
