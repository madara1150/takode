import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { EFFORTS, optionFrom, type AvailableModel } from '../../shared/models'
import { TOKENS } from '../../shared/template'
import type {
  ActionsConfig,
  CustomAction,
  DeviceCode,
  Effort,
  GithubRepo,
  ModelOption,
  PermissionMode,
  Repo,
  RepoPatch,
  Settings
} from '../../shared/types'
import { call, isMac } from './api'
import { useApp } from './App'
import { useT } from './i18n'
import { Icon } from './icons'
import iconUrl from '../../../assets/icon.png'
import type { UpdateInfo } from '../../shared/update'
import { SettingRow, Segmented, Slider, Toggle } from './Controls'
import { LevelPane } from './Level'
import { AccountPane } from './Login'
import { SkillsPane } from './Skills'
import { RepoIconPicker, RepoStar } from './RepoStar'
import { QuotaPanel } from './Quota'
import { EffortIcon, Select } from './Select'
import { ACCENTS, REWARD_ACCENTS, THEMES } from './themes'
import { activeXp, levelFor } from '../../shared/level'
import { unlockLevel } from '../../shared/rewards'
import { matchPreset, PERF_PRESETS, type PerfPreset, type PerfStats } from '../../shared/perf'

function Dialog({
  title,
  wide,
  onClose,
  children
}: {
  title: string
  wide?: boolean
  onClose?: () => void
  children: ReactNode
}): ReactElement {
  const { setModal } = useApp()
  const close = onClose ?? (() => setModal(null))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <h3>{title}</h3>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): ReactElement {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="muted small">{hint}</span>}
    </label>
  )
}

// ── Add repository ──────────────────────────────────────────────────────────

export function AddRepoModal(): ReactElement {
  const { github, setModal, run, connectGithub } = useApp()
  const t = useT()
  const [tab, setTab] = useState<'folder' | 'github'>('folder')
  const [repos, setRepos] = useState<GithubRepo[] | null>(null)
  const [filter, setFilter] = useState('')
  const [cloning, setCloning] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'github' && github?.loggedIn && !repos) {
      void run(() => call<GithubRepo[]>('github:repos')).then((r) => setRepos(r ?? []))
    }
  }, [tab, github?.loggedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (): void => {
    void run(() => call<Repo | null>('repo:pick')).then((repo) => repo && setModal({ type: 'newWorkspace', repoId: repo.id }))
  }
  const clone = (name: string): void => {
    setCloning(name)
    void run(() => call<Repo>('github:clone', name)).then((repo) => {
      setCloning(null)
      if (repo) setModal({ type: 'newWorkspace', repoId: repo.id })
    })
  }
  const shown = (repos ?? []).filter((r) => r.nameWithOwner.toLowerCase().includes(filter.toLowerCase()))

  return (
    <Dialog title={t('addRepoTitle')}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'folder'} className={tab === 'folder' ? 'active' : ''} onClick={() => setTab('folder')}>
          {t('fromFolder')}
        </button>
        <button role="tab" aria-selected={tab === 'github'} className={tab === 'github' ? 'active' : ''} onClick={() => setTab('github')}>
          {t('fromGithub')}
        </button>
      </div>
      {tab === 'folder' ? (
        <div className="dialog-body center">
          <p className="muted">{t('chooseFolderHint')}</p>
          <button className="btn primary" onClick={pick}>
            <Icon name="folder" />
            {t('chooseFolder')}
          </button>
        </div>
      ) : !github?.loggedIn ? (
        <div className="dialog-body center">
          <p className="muted">{github && !github.installed ? t('installGh') : t('githubNeeded')}</p>
          {github?.installed && (
            <button className="btn primary" onClick={connectGithub}>
              {t('connect')}
            </button>
          )}
        </div>
      ) : (
        <div className="dialog-body">
          <input autoFocus placeholder={t('filterRepos')} aria-label={t('filterRepos')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="gh-list">
            {repos === null && <li className="muted pad">…</li>}
            {shown.map((r) => (
              <li key={r.nameWithOwner}>
                <div className="gh-info">
                  <strong>
                    {r.nameWithOwner} {r.isPrivate && <span className="tag">{t('private')}</span>}
                  </strong>
                  {r.description && <span className="muted small">{r.description}</span>}
                </div>
                <button className="btn small" disabled={cloning !== null} onClick={() => clone(r.nameWithOwner)}>
                  {cloning === r.nameWithOwner ? t('cloning') : t('clone')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  )
}

// ── New workspace ───────────────────────────────────────────────────────────

export function NewWorkspaceModal({ repoId }: { repoId: string }): ReactElement {
  const { state, setModal, select, run } = useApp()
  const t = useT()
  const repo = state.repos.find((r) => r.id === repoId)!
  const [name, setName] = useState('')
  const [base, setBase] = useState(repo.baseBranch)
  const [branches, setBranches] = useState<string[]>([repo.baseBranch])
  const [working, setWorking] = useState(false)

  useEffect(() => {
    void call<string[]>('repo:branches', repoId).then((list) => {
      setBranches(list.includes(repo.baseBranch) ? list : [repo.baseBranch, ...list])
    })
  }, [repoId, repo.baseBranch])

  const create = (): void => {
    setWorking(true)
    void run(() => call<{ id: string }>('ws:create', repoId, { name, base })).then((ws) => {
      setWorking(false)
      if (ws) {
        select(ws.id)
        setModal(null)
      }
    })
  }

  return (
    <Dialog title={t('newWorkspaceTitle', { repo: repo.name })}>
      <form
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <Field label={t('wsName')} hint={t('wsNameHint')}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="allegro" />
        </Field>
        <Field label={t('baseBranch')}>
          <Select
            value={base}
            ariaLabel={t('baseBranch')}
            icon={<Icon name="branch" size={14} />}
            options={branches.map((b) => ({ value: b, label: b }))}
            onChange={setBase}
          />
        </Field>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={() => setModal(null)}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={working} data-testid="create-ws">
            {t('create')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ── Create pull request ─────────────────────────────────────────────────────

interface WsDefaults {
  commitMessage: string
  hasUncommitted: boolean
  title: string
  body: string
  target: string
  draft: boolean
}

export function CreatePrModal({ wsId }: { wsId: string }): ReactElement {
  const { state, setModal, run, toast } = useApp()
  const t = useT()
  const ws = state.workspaces.find((w) => w.id === wsId)!
  const repo = state.repos.find((r) => r.id === ws.repoId)!
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(repo.pr.draft)
  const [target, setTarget] = useState(repo.pr.target || ws.baseBranch)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    void call<WsDefaults>('ws:defaults', wsId).then((d) => {
      setTitle((cur) => cur || d.title)
      setBody((cur) => cur || d.body)
    })
  }, [wsId])

  const [drafting, setDrafting] = useState(false)
  const draftIt = (): void => {
    setDrafting(true)
    void run(() => call<{ title: string; body: string }>('ws:draftPr', wsId)).then((d) => {
      setDrafting(false)
      if (d) {
        setTitle(d.title)
        setBody(d.body)
      }
    })
  }

  const create = (): void => {
    setWorking(true)
    void run(() => call<string>('ws:createPr', wsId, { title, body, draft, target })).then((url) => {
      setWorking(false)
      if (url) {
        toast(t('prCreated'))
        setModal(null)
        if (repo.pr.openAfter) void call('app:openExternal', url)
      }
    })
  }

  return (
    <Dialog title={`${t('createPr')} · ${ws.branch}`}>
      <form
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <button type="button" className="btn draft-btn" disabled={drafting} onClick={draftIt}>
          <Icon name="sparkle" />
          {drafting ? t('drafting') : t('draftWithClaude')}
        </button>
        <Field label={t('prTitle')}>
          <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('prBody')}>
          <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label={t('prTarget')}>
          <input value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
          {t('prDraft')}
        </label>
        <p className="muted small">{t('prHint')}</p>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={() => setModal(null)}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={working || !title.trim()}>
            {t('createPr')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ── Push ────────────────────────────────────────────────────────────────────

export function PushModal({ wsId }: { wsId: string }): ReactElement {
  const { state, setModal, run, toast } = useApp()
  const t = useT()
  const ws = state.workspaces.find((w) => w.id === wsId)!
  const repo = state.repos.find((r) => r.id === ws.repoId)!
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState<boolean | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    void call<WsDefaults>('ws:defaults', wsId).then((d) => {
      setMessage(d.commitMessage)
      setDirty(d.hasUncommitted)
    })
  }, [wsId])

  const push = (): void => {
    setWorking(true)
    void run(async () => {
      await call('ws:push', wsId, message)
      toast(t('pushed', { remote: repo.push.remote, branch: ws.branch }))
      setModal(null)
    }).then(() => setWorking(false))
  }

  return (
    <Dialog title={`${t('push')} · ${ws.name}`}>
      <form
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault()
          push()
        }}
      >
        <p>{t(repo.push.force ? 'pushHintForce' : 'pushHint', { branch: ws.branch, remote: repo.push.remote })}</p>
        {dirty ? (
          <Field label={t('commitMessage')} hint={t('commitNeeded')}>
            <input autoFocus required value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        ) : (
          dirty === false && <p className="muted small">{t('nothingToCommit')}</p>
        )}
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={() => setModal(null)}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={working || dirty === null}>
            <Icon name="upload" />
            {t('push')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ── Archive ─────────────────────────────────────────────────────────────────

export function ArchiveModal({ wsId }: { wsId: string }): ReactElement {
  const { state, setModal, select, run } = useApp()
  const t = useT()
  const ws = state.workspaces.find((w) => w.id === wsId)!
  const [deleteBranch, setDeleteBranch] = useState(state.settings.archiveDeleteBranch)
  const [working, setWorking] = useState(false)

  const archive = (): void => {
    setWorking(true)
    void run(async () => {
      await call('ws:archive', wsId, deleteBranch)
      select(null)
      setModal(null)
    }).then(() => setWorking(false))
  }

  return (
    <Dialog title={t('archiveTitle', { name: ws.name })}>
      <div className="dialog-body">
        <p>{t('archiveBody')}</p>
        <label className="check">
          <input type="checkbox" checked={deleteBranch} onChange={(e) => setDeleteBranch(e.target.checked)} />
          {t('archiveDeleteBranch', { branch: ws.branch })}
        </label>
        <div className="dialog-foot">
          <button className="btn" onClick={() => setModal(null)}>
            {t('cancel')}
          </button>
          <button className="btn danger" disabled={working} onClick={archive}>
            {t('archive')}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

// ── GitHub device code ──────────────────────────────────────────────────────

export function GithubCodeModal({ device }: { device: DeviceCode }): ReactElement {
  const t = useT()
  const [opened, setOpened] = useState(false)
  return (
    <Dialog title={t('githubCodeTitle')} onClose={() => void call('github:cancelLogin')}>
      <div className="dialog-body center">
        <p className="muted">{t('githubCodeBody')}</p>
        <div className="device-code">{device.code}</div>
        <button
          className="btn primary"
          onClick={() => {
            void navigator.clipboard.writeText(device.code)
            void call('app:openExternal', device.url)
            setOpened(true)
          }}
        >
          <Icon name="external" />
          {t('copyAndOpen')}
        </button>
        {opened && <p className="muted small">{t('waitingGithub')}</p>}
      </div>
    </Dialog>
  )
}

// ── Settings ────────────────────────────────────────────────────────────────

export function SettingsModal({ tab: initial, repoTab }: { tab?: string; repoTab?: string }): ReactElement {
  const t = useT()
  const [tab, setTab] = useState(initial ?? 'appearance')
  const tabs: [string, string, string][] = [
    ['account', t('account'), 'user'],
    ['appearance', t('appearance'), 'palette'],
    ['chat', t('chatSettings'), 'chat'],
    ['claude', t('claude'), 'sparkle'],
    ['skills', t('skills'), 'tool'],
    ['models', t('models'), 'list'],
    ['github', t('github'), 'pr'],
    ['repos', t('repos'), 'folder'],
    ['general', t('general'), 'gear'],
    ['performance', t('performance'), 'gauge'],
    ['level', t('level'), 'star']
  ]
  return (
    <Dialog title={t('settings')} wide>
      <div className="settings">
        <nav className="settings-nav">
          {tabs.map(([id, label, icon]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} data-testid={`tab-${id}`}>
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          {tab === 'account' && <AccountPane />}
          {tab === 'appearance' && <AppearancePane />}
          {tab === 'claude' && <ClaudePane />}
          {tab === 'skills' && <SkillsPane />}
          {tab === 'models' && <ModelsPane />}
          {tab === 'github' && <GithubPane />}
          {tab === 'repos' && <ReposPane repoTab={repoTab} />}
          {tab === 'general' && <GeneralPane />}
          {tab === 'chat' && <ChatPane />}
          {tab === 'performance' && <PerformancePane />}
          {tab === 'level' && <LevelPane />}
        </div>
      </div>
    </Dialog>
  )
}

function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const { state } = useApp()
  return [state.settings, (patch) => void call('settings:update', patch)]
}

function AppearancePane(): ReactElement {
  const t = useT()
  const [s, update] = useSettings()
  const level = levelFor(activeXp(useApp().state)).level
  return (
    <>
      <h4>{t('theme')}</h4>
      <div className="theme-grid">
        {THEMES.map((th) => {
          const need = unlockLevel('theme', th.id)
          const locked = level < need
          return (
          <button
            key={th.id}
            className={`theme-card ${s.theme === th.id ? 'active' : ''} ${locked ? 'locked' : ''}`}
            aria-pressed={s.theme === th.id}
            disabled={locked}
            title={locked ? t('unlockAt', { n: need }) : undefined}
            onClick={() => update({ theme: th.id })}
          >
            {locked && (
              <span className="lock-badge">
                <Icon name="lock" size={11} />
                {need}
              </span>
            )}
            <span className="theme-preview" style={{ background: th.bg, borderColor: th.border }}>
              <span style={{ background: th.panel, borderColor: th.border }} />
              <span style={{ background: th.raised }} />
              <i style={{ background: s.accent }} />
            </span>
            <span className="theme-name">{th.id}</span>
          </button>
          )
        })}
        <button
          className={`theme-card ${s.theme === 'system' ? 'active' : ''}`}
          aria-pressed={s.theme === 'system'}
          onClick={() => update({ theme: 'system' })}
        >
          <span className="theme-preview split">
            <span style={{ background: '#181818' }} />
            <span style={{ background: '#ffffff' }} />
          </span>
          <span className="theme-name">{t('themeSystem')}</span>
        </button>
      </div>

      <h4>{t('accent')}</h4>
      <div className="swatches">
        {[...ACCENTS, ...REWARD_ACCENTS].map((c) => {
          const need = unlockLevel('accent', c)
          const locked = level < need
          return (
            <button
              key={c}
              className={`swatch ${s.accent === c ? 'active' : ''} ${locked ? 'locked' : ''} ${c === 'rgb' ? 'rgb' : ''}`}
              style={c === 'rgb' ? undefined : { background: c }}
              aria-label={locked ? `${c} · ${t('unlockAt', { n: need })}` : c}
              title={locked ? t('unlockAt', { n: need }) : undefined}
              aria-pressed={s.accent === c}
              disabled={locked}
              onClick={() => update({ accent: c })}
            >
              {locked && <Icon name="lock" size={11} />}
            </button>
          )
        })}
        <label className="swatch-custom">
          <input type="color" value={/^#/.test(s.accent) ? s.accent : '#7c8cff'} onChange={(e) => update({ accent: e.target.value })} />
          {t('custom')}
        </label>
      </div>

      <h4>{t('sectionLook')}</h4>
      <SettingRow label={t('uiFont')}>
        <Segmented
          label={t('uiFont')}
          value={s.uiFont}
          options={[
            { value: 'system', label: t('fontSystem') },
            { value: 'rounded', label: t('fontRounded') },
            { value: 'serif', label: t('fontSerif') },
            { value: 'mono', label: t('fontMono') }
          ]}
          onChange={(uiFont) => update({ uiFont })}
        />
      </SettingRow>
      <SettingRow label={t('fontSize')}>
        <Slider label={t('fontSize')} value={s.fontSize} min={12} max={18} unit="px" onChange={(fontSize) => update({ fontSize })} />
      </SettingRow>
      <SettingRow label={t('codeFontSize')} hint={t('codeFontSizeHint')}>
        <Slider label={t('codeFontSize')} value={s.codeFontSize} min={11} max={17} unit="px" onChange={(codeFontSize) => update({ codeFontSize })} />
      </SettingRow>
      <SettingRow label={t('radius')}>
        <Slider label={t('radius')} value={s.radius} min={0} max={18} unit="px" onChange={(radius) => update({ radius })} />
      </SettingRow>
      <SettingRow label={t('motion')} hint={t('motionHint')}>
        <Toggle label={t('motion')} checked={s.motion} onChange={(motion) => update({ motion })} />
      </SettingRow>

      <h4>{t('sectionLayout')}</h4>
      <SettingRow label={t('uiScale')} hint={t('uiScaleHint')}>
        <Slider label={t('uiScale')} value={s.uiScale} min={80} max={130} step={5} unit="%" onChange={(uiScale) => update({ uiScale })} />
      </SettingRow>
      <SettingRow label={t('density')}>
        <Segmented
          label={t('density')}
          value={s.density}
          options={[
            { value: 'compact', label: t('densityCompact') },
            { value: 'normal', label: t('densityNormal') },
            { value: 'spacious', label: t('densitySpacious') }
          ]}
          onChange={(density) => update({ density })}
        />
      </SettingRow>
      <SettingRow label={t('showLevel')}>
        <Toggle label={t('showLevel')} checked={s.showLevel} onChange={(showLevel) => update({ showLevel })} />
      </SettingRow>
      <SettingRow label={t('language')}>
        <Segmented
          label={t('language')}
          value={s.language}
          options={[
            { value: 'th', label: 'ไทย' },
            { value: 'en', label: 'English' }
          ]}
          onChange={(language) => update({ language })}
        />
      </SettingRow>
    </>
  )
}

function ClaudePane(): ReactElement {
  const { claude, connectClaude, refreshStatus } = useApp()
  const t = useT()
  const [s, update] = useSettings()
  const modes: [PermissionMode, string, string][] = [
    ['default', t('permAsk'), t('permAskHint')],
    ['acceptEdits', t('permAccept'), t('permAcceptHint')],
    ['bypassPermissions', t('permBypass'), t('permBypassHint')],
    ['plan', t('permPlan'), t('permPlanHint')]
  ]
  return (
    <>
      <h4>{t('account')}</h4>
      <div className="account">
        <span className={`dot ${claude?.loggedIn ? 'ok' : 'off'}`} />
        <div className="account-info">
          <strong>
            {!claude ? '…' : !claude.installed ? t('notInstalled') : claude.loggedIn ? t('connected') : t('notConnected')}
          </strong>
          <span className="muted small">
            {claude?.loggedIn
              ? [claude.email, claude.plan, `Claude Code ${claude.version}`].filter(Boolean).join(' · ')
              : claude && !claude.installed
                ? t('installClaude')
                : t('stepClaudeHint')}
          </span>
        </div>
        {claude?.installed && !claude.loggedIn && (
          <button className="btn primary" onClick={connectClaude}>
            {t('signIn')}
          </button>
        )}
        <button className="btn" onClick={refreshStatus}>
          {t('recheck')}
        </button>
      </div>

      <h4>{t('quota')}</h4>
      <QuotaPanel />

      <h4>{t('permission')}</h4>
      <div className="radio-list" role="radiogroup" aria-label={t('permission')}>
        {modes.map(([id, label, hint]) => (
          <label key={id} className={s.permissionMode === id ? 'active' : ''}>
            <input type="radio" name="perm" checked={s.permissionMode === id} onChange={() => update({ permissionMode: id })} />
            <div>
              <strong>{label}</strong>
              <span className="muted small">{hint}</span>
            </div>
          </label>
        ))}
      </div>

      <h4>{t('sectionPrivacy')}</h4>
      <SettingRow label={t('hideAi')} hint={t('hideAiHint')}>
        <Toggle label={t('hideAi')} checked={s.hideAi} onChange={(hideAi) => update({ hideAi })} />
      </SettingRow>
    </>
  )
}

function EffortSelect({
  value,
  only,
  onChange
}: {
  value: Effort
  /** Levels the model accepts; all of them when unknown. */
  only?: Effort[]
  onChange: (v: Effort) => void
}): ReactElement {
  const t = useT()
  const labels: Record<string, string> = {
    low: t('effortLow'), medium: t('effortMedium'), high: t('effortHigh'), xhigh: t('effortXhigh'), max: t('effortMax')
  }
  return (
    <Select<Effort>
      value={value}
      ariaLabel={t('effort')}
      options={[
        { value: '', label: t('effortAuto'), icon: <EffortIcon level="" /> },
        ...EFFORTS.filter((e) => !only || only.includes(e)).map((e) => ({ value: e, label: labels[e], icon: <EffortIcon level={e} /> }))
      ]}
      onChange={onChange}
    />
  )
}

const CUSTOM = '\u0000custom'

function ModelRow({
  model,
  available,
  onChange,
  onRemove
}: {
  model: ModelOption
  available: AvailableModel[]
  onChange: (next: ModelOption) => void
  onRemove: () => void
}): ReactElement {
  const t = useT()
  const real = available.find((a) => a.id === model.id)
  const [label, setLabel] = useState(model.label)
  const [id, setId] = useState(model.id)
  // Typing an ID by hand is only needed for models the list does not offer.
  const [typing, setTyping] = useState(available.length > 0 && !real)
  useEffect(() => setLabel(model.label), [model.label])
  useEffect(() => setId(model.id), [model.id])

  const commit = (): void => {
    if (label !== model.label || id !== model.id) onChange({ ...model, label, id: id.trim(), resolved: undefined, efforts: undefined })
  }
  const pick = (value: string): void => {
    if (value === CUSTOM) return setTyping(true)
    const next = available.find((a) => a.id === value)
    if (!next) return
    // Keep a name the user typed; replace one that was filled in automatically.
    const auto = !model.label || model.label === real?.label
    onChange({ ...model, id: next.id, label: auto ? next.label : model.label, resolved: next.resolved, efforts: next.efforts })
  }
  const efforts = model.efforts

  return (
    <div className="model-row" role="row">
      <input
        type="checkbox"
        className="switch"
        role="switch"
        aria-label={`${t('show')}: ${model.label || model.id}`}
        checked={model.enabled}
        onChange={(e) => onChange({ ...model, enabled: e.target.checked })}
      />
      <input value={label} aria-label={t('modelLabel')} placeholder={t('modelLabel')} onChange={(e) => setLabel(e.target.value)} onBlur={commit} />
      {typing || available.length === 0 ? (
        <div className="id-cell">
          <input
            className="mono"
            value={id}
            aria-label={t('modelId')}
            placeholder="claude-…"
            onChange={(e) => setId(e.target.value)}
            onBlur={commit}
          />
          {available.length > 0 && (
            <button type="button" className="icon-btn" title={t('pickFromList')} aria-label={t('pickFromList')} onClick={() => setTyping(false)}>
              <Icon name="list" size={15} />
            </button>
          )}
        </div>
      ) : (
        <Select
          value={model.id}
          ariaLabel={t('modelId')}
          icon={<Icon name="sparkle" size={14} />}
          options={[
            ...available.map((a) => ({ value: a.id, label: a.label, hint: [a.resolved, a.description].filter(Boolean).join(' · ') })),
            ...(real ? [] : [{ value: model.id, label: model.id || t('modelDefault') }]),
            { value: CUSTOM, label: t('customId') }
          ]}
          onChange={pick}
        />
      )}
      <Select<PermissionMode | ''>
        value={model.permission}
        ariaLabel={t('modelCan')}
        options={[
          { value: '', label: t('sameAsDefault') },
          { value: 'acceptEdits', label: t('permAccept') },
          { value: 'bypassPermissions', label: t('permBypass') },
          { value: 'plan', label: t('permPlan') }
        ]}
        onChange={(permission) => onChange({ ...model, permission })}
      />
      {efforts && efforts.length === 0 ? (
        <span className="muted small no-effort">{t('noEffort')}</span>
      ) : (
        <EffortSelect value={model.effort} only={efforts} onChange={(effort) => onChange({ ...model, effort })} />
      )}
      <button type="button" className="icon-btn" aria-label={t('remove')} title={t('remove')} onClick={onRemove}>
        <Icon name="trash" size={15} />
      </button>
    </div>
  )
}

function ModelsPane(): ReactElement {
  const { run } = useApp()
  const t = useT()
  const [s, update] = useSettings()
  const [available, setAvailable] = useState<AvailableModel[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = (force = false): void => {
    setFailed(false)
    void call<AvailableModel[]>('claude:models', force).then(setAvailable, () => {
      setAvailable([])
      setFailed(true)
    })
  }
  useEffect(() => load(), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Any edit means the list is the user's own from now on.
  const setModels = (models: ModelOption[]): void => update({ models, modelsCustomized: true })
  const list = available ?? []
  const missing = list.filter((a) => !s.models.some((m) => m.id === a.id))

  return (
    <>
      <h4>{t('modelsShown')}</h4>
      <p className="muted small">
        {available === null ? t('loadingModels') : failed ? t('modelsFailed') : `${t('modelsShownHint')} ${t('modelIdHint')}`}
      </p>
      <div className="model-table" role="table">
        <div className="model-row head" role="row">
          <span>{t('show')}</span>
          <span>{t('modelLabel')}</span>
          <span>{t('modelId')}</span>
          <span>{t('modelCan')}</span>
          <span>{t('effort')}</span>
          <span />
        </div>
        {s.models.map((m) => (
          <ModelRow
            key={`${m.key}-${list.length}`}
            model={m}
            available={list}
            onChange={(next) => setModels(s.models.map((x) => (x.key === next.key ? next : x)))}
            onRemove={() => setModels(s.models.filter((x) => x.key !== m.key))}
          />
        ))}
      </div>
      <div className="known-models">
        <span className="muted small">{t('addModel')}:</span>
        {missing.map((a) => (
          <button
            key={a.id}
            className="chip-btn"
            title={a.resolved}
            onClick={() => setModels([...s.models, { ...optionFrom(a), key: crypto.randomUUID() }])}
          >
            <Icon name="plus" size={13} />
            {a.label}
          </button>
        ))}
        <button
          className="chip-btn"
          onClick={() =>
            setModels([...s.models, { key: crypto.randomUUID(), id: 'claude-', label: '', enabled: true, permission: '', effort: '' }])
          }
        >
          <Icon name="plus" size={13} />
          {t('addCustom')}
        </button>
        <span className="spacer" />
        <button className="btn small ghost" onClick={() => load(true)}>
          <Icon name="refresh" size={13} />
          {t('refreshModels')}
        </button>
        {s.modelsCustomized && (
          <button
            className="btn small"
            onClick={() => void run(() => call('models:reset')).then(() => load())}
          >
            {t('resetModels')}
          </button>
        )}
      </div>

      <div className="two-col">
        <Field label={t('defaultModel')}>
          <Select
            value={s.model}
            ariaLabel={t('defaultModel')}
            icon={<Icon name="sparkle" size={14} />}
            options={s.models
              .filter((m) => m.enabled || m.id === s.model)
              .map((m) => ({ value: m.id, label: m.label || m.id, hint: m.resolved || m.id || undefined }))}
            onChange={(model) => update({ model })}
          />
        </Field>
        <Field label={t('defaultEffort')}>
          <EffortSelect value={s.effort} onChange={(effort) => update({ effort })} />
        </Field>
      </div>
    </>
  )
}

function GithubPane(): ReactElement {
  const { github, connectGithub, refreshStatus } = useApp()
  const t = useT()
  return (
    <>
      <h4>{t('account')}</h4>
      <div className="account">
        <span className={`dot ${github?.loggedIn ? 'ok' : 'off'}`} />
        <div className="account-info">
          <strong>
            {!github ? '…' : !github.installed ? t('notInstalled') : github.loggedIn ? `${t('connected')} · ${github.login}` : t('notConnected')}
          </strong>
          <span className="muted small">{github && !github.installed ? t('installGh') : t('stepGithubHint')}</span>
        </div>
        {github?.installed && !github.loggedIn && (
          <button className="btn primary" onClick={connectGithub}>
            {t('connect')}
          </button>
        )}
        <button className="btn" onClick={refreshStatus}>
          {t('recheck')}
        </button>
      </div>
    </>
  )
}

function ReposPane({ repoTab }: { repoTab?: string }): ReactElement {
  const { state, setModal, run } = useApp()
  const t = useT()
  return (
    <>
      {state.repos.length === 0 && <p className="muted">{t('noRepos')}</p>}
      {state.repos.map((repo) => (
        <RepoCard key={repo.id} repo={repo} open={state.repos.length === 1} initialTab={repoTab} onRemove={() => void run(() => call('repo:remove', repo.id))} />
      ))}
      <button className="btn" onClick={() => setModal({ type: 'addRepo' })}>
        <Icon name="plus" />
        {t('addRepo')}
      </button>
    </>
  )
}

const TOKEN_LIST = TOKENS.map((k) => `{${k}}`).join(' ')

/** Text setting that saves when the field loses focus. */
function TextSetting({
  label,
  hint,
  value,
  placeholder,
  rows,
  onSave,
  onType
}: {
  label: string
  hint?: string
  value: string
  placeholder?: string
  rows?: number
  onSave: (value: string) => void
  onType?: (value: string) => void
}): ReactElement {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const props = {
    value: text,
    placeholder,
    onChange: (e: { target: { value: string } }) => {
      setText(e.target.value)
      onType?.(e.target.value)
    },
    onBlur: () => text !== value && onSave(text)
  }
  return (
    <Field label={label} hint={hint}>
      {rows ? <textarea rows={rows} {...props} /> : <input {...props} />}
    </Field>
  )
}

function RepoCard({
  repo,
  open,
  initialTab,
  onRemove
}: {
  repo: Repo
  open: boolean
  initialTab?: string
  onRemove: () => void
}): ReactElement {
  const [tab, setTab] = useState(initialTab ?? 'workspace')
  const { state } = useApp()
  const t = useT()
  const [branches, setBranches] = useState<string[]>([repo.baseBranch])
  const [remotes, setRemotes] = useState<string[]>([repo.push.remote])
  const [pattern, setPattern] = useState(repo.branchPattern)
  const [example, setExample] = useState('')
  const save = (patch: RepoPatch): void => void call('repo:update', repo.id, patch)

  useEffect(() => {
    void call<string[]>('repo:branches', repo.id).then((list) =>
      setBranches(list.includes(repo.baseBranch) ? list : [repo.baseBranch, ...list])
    )
    void call<string[]>('repo:remotes', repo.id).then((list) =>
      setRemotes(list.includes(repo.push.remote) ? list : [repo.push.remote, ...list])
    )
  }, [repo.id, repo.baseBranch, repo.push.remote])

  useEffect(() => {
    void call<string>('repo:branchPreview', repo.id, pattern, 'allegro').then(setExample)
  }, [repo.id, pattern, state.settings.branchPattern])

  return (
    <details className="card" open={open}>
      <summary className="card-head">
        <RepoStar repo={repo} size={20} />
        <div className="account-info">
          <strong>{repo.name}</strong>
          <span className="muted small">{repo.path}</span>
        </div>
        <button
          className="btn small"
          title={t('removeHint')}
          onClick={(e) => {
            e.preventDefault()
            onRemove()
          }}
        >
          {t('remove')}
        </button>
      </summary>

      <div className="seg">
        {(
          [
            ['workspace', t('sectionWorkspace')],
            ['push', t('sectionPush')],
            ['pr', t('sectionPr')],
            ['actions', t('actions')]
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'workspace' && (
        <>
      <Field label={t('repoIcon')}>
        <RepoIconPicker repo={repo} onChange={(icon) => save({ icon })} />
      </Field>
      <Field label={t('baseBranch')}>
        <Select
          value={repo.baseBranch}
          ariaLabel={t('baseBranch')}
          icon={<Icon name="branch" size={14} />}
          options={branches.map((b) => ({ value: b, label: b }))}
          onChange={(baseBranch) => save({ baseBranch })}
        />
      </Field>
      <TextSetting
        label={t('branchPattern')}
        hint={`${t('branchPatternHint')} ${t('tokensHint', { tokens: '{name} {repo} {date} {user}' })}`}
        value={repo.branchPattern}
        placeholder={state.settings.branchPattern}
        onType={setPattern}
        onSave={(v) => save({ branchPattern: v })}
      />
      <p className="example">
        {t('preview')}: <code>{example}</code>
      </p>
      <TextSetting
        label={t('setupScript')}
        hint={t('setupScriptHint')}
        value={repo.setupScript}
        placeholder="npm install"
        onSave={(v) => save({ setupScript: v })}
      />

        </>
      )}
      {tab === 'push' && (
        <>
      <Field label={t('pushRemote')}>
        <Select
          value={repo.push.remote}
          ariaLabel={t('pushRemote')}
          icon={<Icon name="upload" size={14} />}
          options={remotes.map((r) => ({ value: r, label: r }))}
          onChange={(remote) => save({ push: { remote } })}
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={repo.push.force} onChange={(e) => save({ push: { force: e.target.checked } })} />
        <span>
          {t('pushForce')}
          <span className="muted small block">{t('pushForceHint')}</span>
        </span>
      </label>
      <TextSetting
        label={t('commitTemplate')}
        hint={t('tokensHint', { tokens: TOKEN_LIST })}
        value={repo.push.commitTemplate}
        onSave={(v) => save({ push: { commitTemplate: v } })}
      />
      <Field label={t('pullMode')}>
        <Segmented
          label={t('pullMode')}
          value={repo.push.pullMode}
          options={[
            { value: 'merge', label: t('pullMerge') },
            { value: 'rebase', label: t('pullRebase') }
          ]}
          onChange={(pullMode) => save({ push: { pullMode } })}
        />
        <span className="muted small">{t('pullModeHint')}</span>
      </Field>

        </>
      )}
      {tab === 'pr' && (
        <>
      <Field label={t('prTarget')}>
        <Select
          value={repo.pr.target}
          ariaLabel={t('prTarget')}
          icon={<Icon name="branch" size={14} />}
          options={[{ value: '', label: t('prTargetSame') }, ...branches.map((b) => ({ value: b, label: b }))]}
          onChange={(target) => save({ pr: { target } })}
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={repo.pr.draft} onChange={(e) => save({ pr: { draft: e.target.checked } })} />
        {t('prDraft')}
      </label>
      <TextSetting
        label={t('prTitleTemplate')}
        hint={t('tokensHint', { tokens: TOKEN_LIST })}
        value={repo.pr.titleTemplate}
        placeholder="[{name}] "
        onSave={(v) => save({ pr: { titleTemplate: v } })}
      />
      <TextSetting
        label={t('prBodyTemplate')}
        value={repo.pr.bodyTemplate}
        rows={4}
        placeholder={'## Summary\n\n## How to test\n'}
        onSave={(v) => save({ pr: { bodyTemplate: v } })}
      />
      <TextSetting
        label={t('prReviewers')}
        hint={t('prReviewersHint')}
        value={repo.pr.reviewers}
        onSave={(v) => save({ pr: { reviewers: v } })}
      />
      <TextSetting
        label={t('prLabels')}
        hint={t('prLabelsHint')}
        value={repo.pr.labels}
        onSave={(v) => save({ pr: { labels: v } })}
      />
      <label className="check">
        <input type="checkbox" checked={repo.pr.openAfter} onChange={(e) => save({ pr: { openAfter: e.target.checked } })} />
        {t('prOpenAfter')}
      </label>
        </>
      )}
      {tab === 'actions' && <ActionsPane repo={repo} save={save} />}
    </details>
  )
}

function ActionRow({
  action,
  onChange,
  onRemove
}: {
  action: CustomAction
  onChange: (next: CustomAction) => void
  onRemove: () => void
}): ReactElement {
  const t = useT()
  const [name, setName] = useState(action.name)
  const [command, setCommand] = useState(action.command)
  const commit = (): void => {
    if (name !== action.name || command !== action.command) onChange({ ...action, name, command })
  }
  return (
    <div className="action-row">
      <input value={name} placeholder={t('actionName')} aria-label={t('actionName')} onChange={(e) => setName(e.target.value)} onBlur={commit} />
      <input
        className="mono"
        value={command}
        placeholder="npm run dev"
        aria-label={t('actionCommand')}
        onChange={(e) => setCommand(e.target.value)}
        onBlur={commit}
      />
      <button type="button" className="icon-btn" aria-label={t('remove')} title={t('remove')} onClick={onRemove}>
        <Icon name="trash" size={15} />
      </button>
    </div>
  )
}

type PrefKey = 'review' | 'createPr' | 'fixErrors' | 'resolveConflicts' | 'addressFeedback' | 'branchRename' | 'general'

function ActionsPane({ repo, save }: { repo: Repo; save: (patch: RepoPatch) => void }): ReactElement {
  const t = useT()
  const a: ActionsConfig = repo.actions
  const setCustom = (custom: CustomAction[]): void => save({ actions: { custom } })
  const prefs: [PrefKey, string, string][] = [
    ['review', t('prefReview'), t('prefReviewHint')],
    ['createPr', t('prefCreatePr'), t('prefCreatePrHint')],
    ['fixErrors', t('prefFixErrors'), t('prefFixErrorsHint')],
    ['resolveConflicts', t('prefResolve'), t('prefResolveHint')],
    ['addressFeedback', t('prefFeedback'), t('prefFeedbackHint')],
    ['branchRename', t('prefBranchRename'), t('prefBranchRenameHint')],
    ['general', t('prefGeneral'), t('prefGeneralHint')]
  ]
  return (
    <>
      <div className="pref-head">
        <div className="account-info">
          <strong>{t('customActions')}</strong>
          <span className="muted small">{t('customActionsHint')}</span>
        </div>
        <button
          type="button"
          className="btn small"
          onClick={() => setCustom([...a.custom, { id: crypto.randomUUID(), name: '', command: '' }])}
        >
          <Icon name="plus" size={14} />
          {t('add')}
        </button>
      </div>
      {a.custom.length === 0 && <p className="muted small">{t('noCustomActions')}</p>}
      {a.custom.map((action) => (
        <ActionRow
          key={action.id}
          action={action}
          onChange={(next) => setCustom(a.custom.map((x) => (x.id === next.id ? next : x)))}
          onRemove={() => setCustom(a.custom.filter((x) => x.id !== action.id))}
        />
      ))}

      <label className="pref-head switch-row">
        <div className="account-info">
          <strong>{t('useSpotlight')}</strong>
          <span className="muted small">{t('useSpotlightHint')}</span>
        </div>
        <input
          type="checkbox"
          className="switch"
          role="switch"
          checked={a.spotlight}
          onChange={(e) => save({ actions: { spotlight: e.target.checked } })}
        />
      </label>

      {prefs.map(([key, label, hint]) => (
        <details key={key} className="pref">
          <summary>
            <div className="account-info">
              <strong>
                {label} {a[key].trim() && <span className="tag">{t('customized')}</span>}
              </strong>
              <span className="muted small">{hint}</span>
            </div>
            <Icon name="chevron" />
          </summary>
          {key === 'branchRename' && (
            <label className="check">
              <input type="checkbox" checked={a.autoRename} onChange={(e) => save({ actions: { autoRename: e.target.checked } })} />
              {t('autoRename')}
            </label>
          )}
          <TextSetting label="" value={a[key]} rows={4} onSave={(v) => save({ actions: { [key]: v } })} />
        </details>
      ))}
    </>
  )
}

function UpdatesSection(): ReactElement {
  const { setModal, run, toast } = useApp()
  const t = useT()
  const [s, update] = useSettings()
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  useEffect(() => void call<string>('app:version').then(setVersion), [])
  const check = (): void => {
    setChecking(true)
    void run(() => call<UpdateInfo | null>('update:check')).then((found) => {
      setChecking(false)
      if (found) setModal({ type: 'update' })
      else if (found === null) toast(t('upToDate'))
    })
  }
  return (
    <>
      <h4>{t('updates')}</h4>
      <div className="account">
        <img className="logo" src={iconUrl} width={34} height={34} alt="" />
        <div className="account-info">
          <strong>{t('currentVersion', { version })}</strong>
          <span className="muted small">{t('verifiedHint')}</span>
        </div>
        <button className="btn" disabled={checking} onClick={check}>
          <Icon name="refresh" size={14} />
          {checking ? t('checking') : t('checkUpdates')}
        </button>
      </div>
      <label className="pref-head switch-row">
        <div className="account-info">
          <strong>{t('autoUpdate')}</strong>
        </div>
        <input
          type="checkbox"
          className="switch"
          role="switch"
          checked={s.autoUpdate}
          onChange={(e) => update({ autoUpdate: e.target.checked })}
        />
      </label>
    </>
  )
}

function ChatPane(): ReactElement {
  const t = useT()
  const [s, update] = useSettings()
  const mod = isMac ? '⌘' : 'Ctrl'
  return (
    <>
      <h4>{t('sectionChatInput')}</h4>
      <SettingRow label={t('sendKey')} hint={t('sendKeyHint')}>
        <Segmented
          label={t('sendKey')}
          value={s.sendKey}
          options={[
            { value: 'enter', label: 'Enter' },
            { value: 'mod-enter', label: `${mod} + Enter` }
          ]}
          onChange={(sendKey) => update({ sendKey })}
        />
      </SettingRow>
      <SettingRow label={t('bubbleStyle')}>
        <Segmented
          label={t('bubbleStyle')}
          value={s.bubbleStyle}
          options={[
            { value: 'bubble', label: t('bubbleBubble') },
            { value: 'plain', label: t('bubblePlain') }
          ]}
          onChange={(bubbleStyle) => update({ bubbleStyle })}
        />
      </SettingRow>

      <h4>{t('sectionChatShow')}</h4>
      <SettingRow label={t('toolCalls')}>
        <Select<Settings['toolCalls']>
          value={s.toolCalls}
          ariaLabel={t('toolCalls')}
          icon={<Icon name="tool" size={14} />}
          options={[
            { value: 'all', label: t('toolAll') },
            { value: 'compact', label: t('toolCompact') },
            { value: 'hidden', label: t('toolHidden') }
          ]}
          onChange={(toolCalls) => update({ toolCalls })}
        />
      </SettingRow>
      <SettingRow label={t('showTokens')} hint={t('showTokensHint')}>
        <Toggle label={t('showTokens')} checked={s.showTokens} onChange={(showTokens) => update({ showTokens })} />
      </SettingRow>
      <SettingRow label={t('showCost')} hint={t('showCostHint')}>
        <Toggle label={t('showCost')} checked={s.showCost} onChange={(showCost) => update({ showCost })} />
      </SettingRow>
      <SettingRow label={t('autoScroll')}>
        <Toggle label={t('autoScroll')} checked={s.autoScroll} onChange={(autoScroll) => update({ autoScroll })} />
      </SettingRow>

      <h4>{t('sectionNotify')}</h4>
      <SettingRow label={t('notifyDone')}>
        <Segmented
          label={t('notifyDone')}
          value={s.notifyDone}
          options={[
            { value: 'off', label: t('notifyOff') },
            { value: 'background', label: t('notifyBackground') },
            { value: 'always', label: t('notifyAlways') }
          ]}
          onChange={(notifyDone) => update({ notifyDone })}
        />
      </SettingRow>
      <SettingRow label={t('notifySound')}>
        <Toggle label={t('notifySound')} checked={s.notifySound} onChange={(notifySound) => update({ notifySound })} />
      </SettingRow>
    </>
  )
}

function GeneralPane(): ReactElement {
  const t = useT()
  const [s, update] = useSettings()
  return (
    <>
      <h4>{t('homeDir')}</h4>
      <div className="account">
        <Icon name="folder" />
        <div className="account-info">
          <strong>{s.homeDir}</strong>
          <span className="muted small">{t('homeDirHint')}</span>
        </div>
        <button
          className="btn"
          onClick={() => void call<string | null>('app:pickFolder').then((dir) => dir && update({ homeDir: dir }))}
        >
          {t('change')}
        </button>
      </div>
      <h4>{t('sectionWorkspaces')}</h4>
      <SettingRow label={t('confirmArchive')}>
        <Toggle label={t('confirmArchive')} checked={s.confirmArchive} onChange={(confirmArchive) => update({ confirmArchive })} />
      </SettingRow>
      <SettingRow label={t('archiveDeleteBranchDefault')}>
        <Toggle
          label={t('archiveDeleteBranchDefault')}
          checked={s.archiveDeleteBranch}
          onChange={(archiveDeleteBranch) => update({ archiveDeleteBranch })}
        />
      </SettingRow>
      <SettingRow label={t('branchCheck')}>
        <Slider
          label={t('branchCheck')}
          value={s.branchCheckMinutes}
          min={1}
          max={30}
          unit={t('minutesShort')}
          onChange={(branchCheckMinutes) => update({ branchCheckMinutes })}
        />
      </SettingRow>
      <UpdatesSection />
      <TextSetting
        label={t('branchPatternDefault')}
        hint={t('tokensHint', { tokens: '{name} {repo} {date} {user}' })}
        value={s.branchPattern}
        onSave={(v) => update({ branchPattern: v.trim() || 'takode/{name}' })}
      />
    </>
  )
}

// ── Performance ─────────────────────────────────────────────────────────────

function PerformancePane(): ReactElement {
  const t = useT()
  const [s, update] = useSettings()
  const [stats, setStats] = useState<PerfStats | null>(null)
  const [freed, setFreed] = useState<string>('')
  const [freeing, setFreeing] = useState(false)

  // Live figures, only while this page is open.
  useEffect(() => {
    let alive = true
    const load = (): void => void call<PerfStats>('perf:stats').then((x) => alive && setStats(x))
    load()
    const id = setInterval(load, 2000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const preset = matchPreset(s)
  const presetHint = { saver: 'presetSaverHint', balanced: 'presetBalancedHint', full: 'presetFullHint', custom: 'presetCustomHint' } as const
  const procName = (type: string): string =>
    type === 'Browser' ? t('procBrowser') : type === 'Tab' ? t('procTab') : type === 'GPU' ? t('procGPU') : t('procUtility')
  // Group the small helper processes into one row.
  const rows = stats
    ? Object.entries(
        stats.processes.reduce<Record<string, number>>((acc, p) => {
          const name = procName(p.type)
          acc[name] = (acc[name] ?? 0) + p.memoryMB
          return acc
        }, {})
      ).sort((a, b) => b[1] - a[1])
    : []
  const restartNeeded = stats !== null && stats.hardwareAccel !== s.hardwareAccel

  const free = (): void => {
    setFreeing(true)
    void call<number>('perf:free')
      .then((mb) => setFreed(mb > 0 ? t('perfFreed', { n: mb }) : t('perfFreedNone')))
      .finally(() => setFreeing(false))
  }

  return (
    <>
      <p className="muted">{t('perfIntro')}</p>

      <div className="perf-usage">
        <div className="perf-head">
          <div className="perf-big">
            <span className="muted small">{t('perfMemory')}</span>
            <strong>{stats ? `${stats.memoryMB} MB` : '…'}</strong>
          </div>
          <div className="perf-big">
            <span className="muted small">{t('perfCpu')}</span>
            <strong>{stats ? `${stats.cpu}%` : '…'}</strong>
          </div>
          <span className="spacer" />
          <button className="btn" disabled={freeing} onClick={free} title={t('perfFreeHint')}>
            <Icon name="leaf" size={14} />
            {t('perfFree')}
          </button>
        </div>
        {stats && (
          <>
            <div className="perf-bar" aria-hidden="true">
              {rows.map(([name, mb], i) => (
                <span key={name} className={`perf-seg seg-${i}`} style={{ flexGrow: Math.max(mb, 1) }} title={`${name} ${mb} MB`} />
              ))}
            </div>
            <div className="perf-legend">
              {rows.map(([name, mb], i) => (
                <span key={name} className="small">
                  <i className={`perf-dot seg-${i}`} />
                  {name} <span className="muted">{mb} MB</span>
                </span>
              ))}
            </div>
            <span className="muted small">
              {t('perfOpen', { terminals: stats.terminals, runs: stats.claudeRuns, chats: stats.cachedChats })}
            </span>
          </>
        )}
        {freed && <span className="small perf-freed">{freed}</span>}
      </div>

      <h4>{t('perfPreset')}</h4>
      <div className="perf-presets" role="radiogroup" aria-label={t('perfPreset')}>
        {(
          [
            ['saver', 'leaf'],
            ['balanced', 'gauge'],
            ['full', 'bolt']
          ] as [PerfPreset, string][]
        ).map(([id, icon]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={preset === id}
            className={`perf-preset ${preset === id ? 'active' : ''}`}
            onClick={() => update({ ...PERF_PRESETS[id] })}
          >
            <Icon name={icon} size={18} />
            <strong>{t(id === 'saver' ? 'presetSaver' : id === 'balanced' ? 'presetBalanced' : 'presetFull')}</strong>
          </button>
        ))}
      </div>
      <p className="muted small">
        {preset === 'custom' && <strong>{t('presetCustom')} · </strong>}
        {t(presetHint[preset])}
      </p>

      <h4>{t('sectionLooks')}</h4>
      <SettingRow label={t('liteEffects')} hint={t('liteEffectsHint')}>
        <Toggle label={t('liteEffects')} checked={s.liteEffects} onChange={(liteEffects) => update({ liteEffects })} />
      </SettingRow>
      <SettingRow label={t('motion')} hint={t('motionHint')}>
        <Toggle label={t('motion')} checked={s.motion} onChange={(motion) => update({ motion })} />
      </SettingRow>
      <SettingRow label={t('pauseUnfocused')} hint={t('pauseUnfocusedHint')}>
        <Toggle label={t('pauseUnfocused')} checked={s.pauseUnfocused} onChange={(pauseUnfocused) => update({ pauseUnfocused })} />
      </SettingRow>
      <SettingRow label={t('chatLimit')} hint={t('chatLimitHint')}>
        <Segmented
          label={t('chatLimit')}
          value={String(s.chatLimit)}
          options={[80, 150, 300, 0].map((n) => ({ value: String(n), label: n ? String(n) : t('chatLimitAll') }))}
          onChange={(v) => update({ chatLimit: Number(v) })}
        />
      </SettingRow>

      <h4>{t('sectionBackground')}</h4>
      <SettingRow label={t('terminalIdle')} hint={t('terminalIdleHint')}>
        <Segmented
          label={t('terminalIdle')}
          value={String(s.terminalIdleMinutes)}
          options={[5, 15, 30, 60, 0].map((n) => ({ value: String(n), label: n ? `${n}${t('minutesShort')}` : t('never') }))}
          onChange={(v) => update({ terminalIdleMinutes: Number(v) })}
        />
      </SettingRow>
      <SettingRow label={t('branchCheck')}>
        <Slider
          label={t('branchCheck')}
          value={s.branchCheckMinutes}
          min={1}
          max={30}
          unit={t('minutesShort')}
          onChange={(branchCheckMinutes) => update({ branchCheckMinutes })}
        />
      </SettingRow>
      <SettingRow label={t('spellcheck')} hint={t('spellcheckHint')}>
        <Toggle label={t('spellcheck')} checked={s.spellcheck} onChange={(spellcheck) => update({ spellcheck })} />
      </SettingRow>
      <SettingRow label={t('hardwareAccel')} hint={t('hardwareAccelHint')}>
        <Toggle label={t('hardwareAccel')} checked={s.hardwareAccel} onChange={(hardwareAccel) => update({ hardwareAccel })} />
      </SettingRow>
      {restartNeeded && (
        <div className="perf-restart">
          <Icon name="refresh" size={14} />
          <span>{t('restartNeeded')}</span>
          <span className="spacer" />
          <button className="btn primary" onClick={() => void call('app:relaunch')}>
            {t('restartNow')}
          </button>
        </div>
      )}
    </>
  )
}
