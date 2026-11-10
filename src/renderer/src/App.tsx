import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { AppState, ClaudeStatus, DeviceCode, GithubStatus, Repo, Workspace } from '../../shared/types'
import { call, isMac, on } from './api'
import { errorText, makeT, TContext, useT, type Key, type T } from './i18n'
import { groupByStatus, type StatusGroup } from '../../shared/branch'
import { Icon, Logo } from './icons'
import { AddRepoModal, ArchiveModal, CreatePrModal, GithubCodeModal, NewWorkspaceModal, PushModal, SettingsModal } from './Modals'
import { Palette } from './Palette'
import { BranchBadge } from './BranchBadge'
import { LevelCard, LevelUp, RgbFrame } from './Level'
import { AccountPane, Avatar, LoginScreen } from './Login'
import { StatusBar } from './StatusBar'
import { RepoStar } from './RepoStar'
import { Splitter, useStoredWidth } from './Splitter'
import { UpdateModal } from './Update'
import type { UpdateInfo } from '../../shared/update'
import { applyTheme } from './themes'
import { setExtraUnlocks } from '../../shared/rewards'
import { activeXp, levelFor } from '../../shared/level'
import { WorkspaceView } from './Workspace'

export type Modal =
  | { type: 'settings'; tab?: string; repoTab?: string }
  | { type: 'addRepo' }
  | { type: 'newWorkspace'; repoId: string }
  | { type: 'createPr'; wsId: string }
  | { type: 'push'; wsId: string }
  | { type: 'update' }
  | { type: 'archive'; wsId: string }
  | null

interface Ctx {
  state: AppState
  claude: ClaudeStatus | null
  github: GithubStatus | null
  selected: Workspace | null
  busy: string[]
  select: (wsId: string | null) => void
  setModal: (m: Modal) => void
  toast: (text: string, kind?: 'ok' | 'error') => void
  /** Runs an action and shows its error as a toast. Returns undefined on failure. */
  run: <R>(fn: () => Promise<R>) => Promise<R | undefined>
  refreshStatus: () => void
  connectGithub: () => void
  connectClaude: () => void
  toggleSpotlight: (ws: Workspace) => void
  update: UpdateInfo | null
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = (): Ctx => useContext(AppCtx)

export function App(): ReactElement | null {
  const [state, setState] = useState<AppState | null>(null)
  const [claude, setClaude] = useState<ClaudeStatus | null>(null)
  const [github, setGithub] = useState<GithubStatus | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem('selected'))
  const [busy, setBusy] = useState<string[]>([])
  const [modal, setModal] = useState<Modal>(null)
  const [palette, setPalette] = useState(false)
  const [toastMsg, setToastMsg] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)
  const [device, setDevice] = useState<DeviceCode | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [sidebarWidth, setSidebarWidth, resetSidebarWidth] = useStoredWidth('layout.sidebar', 250)
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)

  const t: T = useMemo(() => makeT(state?.settings.language ?? 'en'), [state?.settings.language])

  const refreshStatus = useCallback(() => {
    void call<ClaudeStatus>('claude:status').then(setClaude)
    void call<GithubStatus>('github:status').then(setGithub)
  }, [])

  useEffect(() => {
    void call<AppState>('state:get').then(setState)
    void call<string[]>('claude:busy').then(setBusy)
    refreshStatus()
    const offs = [
      on('state', setState),
      on('busy', setBusy),
      on('github:device', setDevice),
      on('level:up', (level: number) => setLevelUp(level)),
      on('focus:workspace', (p: { wsId: string; tabId: string }) => {
        select(p.wsId)
        void call('tabs:select', p.wsId, p.tabId)
      }),
      on('update:available', (info: UpdateInfo) => {
        setUpdate(info)
        setModal((m) => m ?? { type: 'update' })
      })
    ]
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onMq = (): void => setSystemDark(mq.matches)
    mq.addEventListener('change', onMq)
    return () => {
      offs.forEach((off) => off())
      mq.removeEventListener('change', onMq)
    }
  }, [refreshStatus])

  // Rewards from redeem codes count as unlocked everywhere; set before anything checks them.
  if (state) setExtraUnlocks(state.auth.mode === 'account' ? state.unlocks : [])

  useEffect(() => {
    if (state) applyTheme(state.settings, systemDark, levelFor(activeXp(state)).level)
  }, [state, systemDark])

  // Lets CSS pause animations while the window is behind other windows.
  useEffect(() => {
    const mark = (): void => {
      document.documentElement.dataset.focus = document.hasFocus() && !document.hidden ? 'on' : 'off'
    }
    mark()
    window.addEventListener('focus', mark)
    window.addEventListener('blur', mark)
    document.addEventListener('visibilitychange', mark)
    return () => {
      window.removeEventListener('focus', mark)
      window.removeEventListener('blur', mark)
      document.removeEventListener('visibilitychange', mark)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      } else if (mod && e.key === ',') {
        e.preventDefault()
        setModal({ type: 'settings' })
      } else if (e.key === 'Escape') {
        setPalette(false)
        setModal(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    setToastMsg({ text, kind })
    setTimeout(() => setToastMsg((cur) => (cur?.text === text ? null : cur)), kind === 'error' ? 7000 : 3500)
  }, [])

  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) localStorage.setItem('selected', id)
    else localStorage.removeItem('selected')
  }, [])

  // Hook used by tools/screenshots.mjs to drive the real UI.
  useEffect(() => {
    ;(window as any).__takode = { select, setModal, setPalette, setLevelUp, showUpdate: (info: UpdateInfo | null) => { setUpdate(info); setModal(info ? { type: 'update' } : null) } }
  }, [select])

  if (!state) return null

  const run = async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    try {
      return await fn()
    } catch (err) {
      toast(errorText(t, err), 'error')
      return undefined
    }
  }

  const connectGithub = (): void => {
    void (async () => {
      try {
        await call('github:login')
        toast(`GitHub: ${t('connected')}`)
      } catch (err) {
        if (!(err instanceof Error && err.message === 'CANCELLED')) toast(errorText(t, err), 'error')
      }
    })().finally(() => {
      setDevice(null)
      refreshStatus()
    })
  }

  const connectClaude = (): void => {
    toast(t('claudeLoginBody'))
    void run(() => call('claude:login')).finally(refreshStatus)
  }

  const toggleSpotlight = (ws: Workspace): void => {
    const current = state.spotlights.find((s) => s.repoId === ws.repoId)
    void run(async () => {
      if (current?.workspaceId === ws.id) {
        await call('spotlight:off', ws.repoId)
        toast(t('spotlightOffToast', { ref: current.originalRef }))
      } else {
        await call('spotlight:on', ws.id)
        toast(t('spotlightOnToast'))
      }
    })
  }

  const selected = state.workspaces.find((w) => w.id === selectedId) ?? null
  const ctx: Ctx = {
    state, claude, github, selected, busy, select, setModal, toast, run,
    refreshStatus, connectGithub, connectClaude, toggleSpotlight, update
  }

  return (
    <TContext.Provider value={t}>
      <AppCtx.Provider value={ctx}>
        {state.auth.mode === 'signedOut' ? (
          <LoginScreen />
        ) : (
        <div className="app-shell">
        <div className={`app ${isMac ? 'mac' : ''}`} style={{ gridTemplateColumns: `min(${sidebarWidth}px, 45vw) 0 minmax(0, 1fr)` }}>
          <Sidebar onPalette={() => setPalette(true)} />
          <Splitter
            side="left"
            label={t('resizeSidebar')}
            value={sidebarWidth}
            min={190}
            max={() => Math.min(480, window.innerWidth - 640)}
            onChange={setSidebarWidth}
            onReset={resetSidebarWidth}
          />
          <main className="main">{selected ? <WorkspaceView key={selected.id} ws={selected} /> : <Welcome />}</main>
        </div>
        <StatusBar />
        </div>
        )}
        {modal?.type === 'settings' && <SettingsModal key={`${modal.tab}-${modal.repoTab}`} tab={modal.tab} repoTab={modal.repoTab} />}
        {modal?.type === 'addRepo' && <AddRepoModal />}
        {modal?.type === 'newWorkspace' && <NewWorkspaceModal repoId={modal.repoId} />}
        {modal?.type === 'createPr' && <CreatePrModal wsId={modal.wsId} />}
        {modal?.type === 'push' && <PushModal wsId={modal.wsId} />}
        {modal?.type === 'update' && update && <UpdateModal info={update} onFound={setUpdate} />}
        {modal?.type === 'archive' && <ArchiveModal wsId={modal.wsId} />}
        {device && <GithubCodeModal device={device} />}
        {levelUp !== null && <LevelUp level={levelUp} onClose={() => setLevelUp(null)} />}
        <RgbFrame />
        {palette && <Palette onClose={() => setPalette(false)} />}
        {toastMsg && (
          <div className={`toast ${toastMsg.kind}`} role="status">
            {toastMsg.text}
          </div>
        )}
      </AppCtx.Provider>
    </TContext.Provider>
  )
}

function Sidebar({ onPalette }: { onPalette: () => void }): ReactElement {
  const { state, selected, busy, select, setModal, update } = useApp()
  const t = useT()
  const groupMode = state.settings.sidebarGroup ?? 'repo'
  // Status groups the user folded, remembered on this computer.
  const [folded, setFolded] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('sidebar.folded') || '[]')
    } catch {
      return []
    }
  })
  const toggleGroup = (g: string): void => {
    const next = folded.includes(g) ? folded.filter((x) => x !== g) : [...folded, g]
    setFolded(next)
    try {
      localStorage.setItem('sidebar.folded', JSON.stringify(next))
    } catch {
      /* not remembered */
    }
  }
  return (
    <aside className="sidebar">
      <div className="drag sidebar-top" />
      <div className="brand">
        <Logo size={26} />
        <span>Takode</span>
      </div>
      <button className="search-btn" onClick={onPalette} data-testid="open-palette">
        <Icon name="search" size={14} />
        <span>{t('search')}</span>
        <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <div className="side-scroll">
        <div className="side-label">
          <span>{t('repos')}</span>
          <button className="icon-btn" title={t('addRepo')} aria-label={t('addRepo')} onClick={() => setModal({ type: 'addRepo' })}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        {state.repos.length > 0 && (
          <div className="group-switch" role="radiogroup" aria-label={t('groupBy')}>
            {(
              [
                ['repo', 'folder', t('groupByRepo')],
                ['status', 'branch', t('groupByStatus')]
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={groupMode === id}
                className={groupMode === id ? 'active' : ''}
                onClick={() => void call('settings:update', { sidebarGroup: id })}
                data-testid={`group-${id}`}
              >
                <Icon name={icon} size={12} />
                {label}
              </button>
            ))}
          </div>
        )}
        {state.repos.length === 0 && <p className="side-empty">{t('noRepos')}</p>}
        {groupMode === 'repo' ? state.repos.map(renderRepo) : renderByStatus()}
      </div>

      {update && (
        <button className="update-chip" onClick={() => setModal({ type: 'update' })}>
          <Icon name="sparkle" size={14} />
          <span>{t('updateChip', { version: update.version })}</span>
          <Icon name="send" size={13} />
        </button>
      )}
      <LevelCard />
      <div className="side-foot">
        <button
          className="avatar-btn"
          title={state.auth.mode === 'account' ? `${state.auth.account?.name} · ${state.auth.account?.email}` : t('guestName')}
          aria-label={t('account')}
          onClick={() => setModal({ type: 'settings', tab: 'account' })}
        >
          <Avatar size={24} />
        </button>
        <button className="conn side-account" onClick={() => setModal({ type: 'settings', tab: 'account' })}>
          <span>{state.auth.mode === 'account' ? state.auth.account?.name : t('guestShort')}</span>
        </button>
        <button className="icon-btn" title={t('settings')} aria-label={t('settings')} onClick={() => setModal({ type: 'settings' })}>
          <Icon name="gear" />
        </button>
      </div>
    </aside>
  )

  function renderWs(ws: Workspace, withRepo: boolean): ReactElement {
    const repo = state.repos.find((r) => r.id === ws.repoId)
    const spot = state.spotlights.find((s) => s.repoId === ws.repoId)
    return (
      <button
        key={ws.id}
        className={`ws-row ${selected?.id === ws.id ? 'active' : ''} ${withRepo ? 'with-repo' : ''}`}
        onClick={() => select(ws.id)}
        title={withRepo && repo ? `${repo.name} · ${ws.branch}` : ws.branch}
      >
        <span className={`ws-state ${ws.tabs.some((tab) => busy.includes(tab.id)) ? 'busy' : ''}`} />
        {withRepo && repo && <RepoStar repo={repo} size={13} />}
        <span className="ws-name">{ws.name}</span>
        {withRepo && repo && <span className="ws-repo">{repo.name}</span>}
        {spot?.workspaceId === ws.id && (
          <span className="ws-spot" title={t('spotlight')}>
            <Icon name="spotlight" size={13} />
          </span>
        )}
        <BranchBadge info={ws.git} />
      </button>
    )
  }

  function renderByStatus(): ReactElement {
    const groups = groupByStatus(state.workspaces)
    if (!groups.length) return <p className="side-empty">{t('noWorkspaces')}</p>
    const label: Record<StatusGroup, Key> = {
      local: 'stShortLocal',
      pushed: 'stShortPushed',
      pr: 'groupPr',
      merged: 'stShortMerged',
      closed: 'stShortClosed'
    }
    return (
      <>
        {groups.map(({ group, items }) => (
          <div className="repo status-group" key={group}>
            <button
              className="repo-head group-head"
              onClick={() => toggleGroup(group)}
              aria-expanded={!folded.includes(group)}
              data-testid={`status-group-${group}`}
            >
              <span className={`tree-caret ${folded.includes(group) ? '' : 'open'}`}>
                <Icon name="chevron" size={11} />
              </span>
              <BranchBadge info={{ state: group === 'pr' ? 'open' : group, ahead: 0, checkedAt: 0 }} />
              <span className="repo-name">{t(label[group])}</span>
              <span className="count">{items.length}</span>
            </button>
            {!folded.includes(group) && items.map((ws) => renderWs(ws, true))}
          </div>
        ))}
      </>
    )
  }

  function renderRepo(repo: Repo): ReactElement {
    const list = state.workspaces.filter((w) => w.repoId === repo.id)
    return (
      <div className="repo" key={repo.id}>
        <div className="repo-head">
          <RepoStar repo={repo} size={17} />
          <span className="repo-name" title={repo.path}>{repo.name}</span>
          <button
            className="icon-btn"
            title={t('newWorkspace')}
            aria-label={`${t('newWorkspace')}: ${repo.name}`}
            onClick={() => setModal({ type: 'newWorkspace', repoId: repo.id })}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
        {list.length === 0 && <p className="side-empty indent">{t('noWorkspaces')}</p>}
        {list.map((ws) => renderWs(ws, false))}
      </div>
    )
  }
}

function Welcome(): ReactElement {
  const { state, claude, github, select, setModal, connectClaude, connectGithub, refreshStatus } = useApp()
  const t = useT()
  const firstRepo = state.repos[0]
  const steps = [
    {
      done: !!claude?.loggedIn,
      title: t('stepClaude'),
      hint: claude && !claude.installed ? t('installClaude') : t('stepClaudeHint'),
      detail: claude?.loggedIn ? [claude.email, claude.plan].filter(Boolean).join(' · ') : '',
      action: claude && !claude.installed ? refreshStatus : connectClaude,
      label: claude && !claude.installed ? t('recheck') : t('signIn')
    },
    {
      done: !!github?.loggedIn,
      title: t('stepGithub'),
      hint: github && !github.installed ? t('installGh') : t('stepGithubHint'),
      detail: github?.login ?? '',
      action: github && !github.installed ? refreshStatus : connectGithub,
      label: github && !github.installed ? t('recheck') : t('connect')
    },
    {
      done: state.repos.length > 0,
      title: t('stepRepo'),
      hint: t('stepRepoHint'),
      detail: state.repos.map((r) => r.name).join(', '),
      action: () => setModal({ type: 'addRepo' }),
      label: t('addRepo')
    },
    {
      done: state.workspaces.length > 0,
      title: t('stepWorkspace'),
      hint: t('stepWorkspaceHint'),
      detail: '',
      action: () => (firstRepo ? setModal({ type: 'newWorkspace', repoId: firstRepo.id }) : setModal({ type: 'addRepo' })),
      label: t('newWorkspace')
    }
  ]
  return (
    <div className="welcome">
      <div className="drag welcome-drag" />
      <div className="welcome-card">
        <Logo size={56} />
        <h1>{t('welcomeTitle')}</h1>
        <p className="muted">{state.workspaces.length ? t('appTagline') : t('welcomeSub')}</p>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={i} className={s.done ? 'done' : ''}>
              <span className="step-num">{s.done ? <Icon name="check" size={14} /> : i + 1}</span>
              <div className="step-body">
                <strong>{s.title}</strong>
                <span className="muted">{s.done && s.detail ? s.detail : s.hint}</span>
              </div>
              {!s.done && (
                <button className="btn primary" onClick={s.action}>
                  {s.label}
                </button>
              )}
            </li>
          ))}
        </ol>
        {state.workspaces.length > 0 && (
          <button className="btn" onClick={() => select(state.workspaces[0].id)}>
            {t('goTo')}: {state.workspaces[0].name}
          </button>
        )}
      </div>
    </div>
  )
}
