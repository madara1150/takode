import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { PerfStats } from '../../shared/perf'
import { quotaLevel, timeLeft, usedNow } from '../../shared/quota'
import { call } from './api'
import { useApp } from './App'
import { useT, type T } from './i18n'
import { Icon } from './icons'
import { QuotaPanel } from './Quota'

function shortLeft(t: T, resetsAt: number, now: number): string {
  const left = timeLeft(resetsAt, now)
  if (!left) return t('quotaReset')
  if (left.days) return `${left.days}${t('unitDay')} ${left.hours}${t('unitHour')}`
  return left.hours ? `${left.hours}${t('unitHour')} ${left.minutes}${t('unitMinute')}` : `${left.minutes}${t('unitMinute')}`
}

const SHORT: Record<string, 'quotaShort5h' | 'quotaShort7d'> = { five_hour: 'quotaShort5h', seven_day: 'quotaShort7d' }

/** Thin bar along the bottom of the window: connections, Claude limits and memory. */
export function StatusBar(): ReactElement {
  const { state, claude, github, setModal, busy } = useApp()
  const t = useT()
  const [now, setNow] = useState(Date.now())
  const [stats, setStats] = useState<PerfStats | null>(null)
  const [quotaOpen, setQuotaOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    let alive = true
    const load = (): void => {
      // No need to measure while nobody can see it.
      if (document.hidden) return
      void call<PerfStats>('perf:stats').then((s) => alive && setStats(s), () => undefined)
    }
    load()
    const poll = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [])

  useEffect(() => {
    if (!quotaOpen) return
    const close = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setQuotaOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setQuotaOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [quotaOpen])

  const quota = state.quota
  const ramTip = stats
    ? [`${t('perfMemory')} ${stats.memoryMB} MB · CPU ${stats.cpu}%`, ...stats.processes.map((p) => `${p.type}: ${p.memoryMB} MB`), t('perfOpen', { terminals: stats.terminals, runs: stats.claudeRuns, chats: stats.cachedChats })].join('\n')
    : ''
  const ramLevel = !stats ? '' : stats.memoryMB > 1500 ? 'high' : stats.memoryMB > 900 ? 'warn' : 'ok'

  return (
    <footer className="status-bar" role="status" aria-label={t('statusBar')}>
      <button className="sb-item" onClick={() => setModal({ type: 'settings', tab: 'claude' })} title={claude?.email || t('claude')}>
        <span className={`dot ${claude === null ? 'wait' : claude?.loggedIn ? 'ok' : 'off'}`} />
        Claude
      </button>
      <button className="sb-item" onClick={() => setModal({ type: 'settings', tab: 'github' })} title={github?.login ? `GitHub · ${github.login}` : 'GitHub'}>
        <span className={`dot ${github === null ? 'wait' : github?.loggedIn ? 'ok' : 'off'}`} />
        GitHub
      </button>
      {busy.length > 0 && (
        <span className="sb-item sb-busy">
          <span className="pulse" />
          {t('statusBusy', { n: busy.length })}
        </span>
      )}

      <div className="sb-quota-wrap" ref={box}>
        <button className="sb-item sb-quota" onClick={() => setQuotaOpen((v) => !v)} aria-expanded={quotaOpen} data-testid="status-quota">
          <Icon name="gauge" size={12} />
          {!quota ? (
            <span className="muted">{t('quotaNone')}</span>
          ) : (
            quota.windows.slice(0, 2).map((w) => {
              const used = usedNow(w, now)
              const pct = Math.round(used * 100)
              return (
                <span key={w.key} className={`sb-q ${quotaLevel(used)}`}>
                  <span className="sb-q-name">{SHORT[w.key] ? t(SHORT[w.key]) : w.key}</span>
                  <span className="sb-q-bar">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <b>{pct}%</b>
                  <span className="muted">↻ {shortLeft(t, w.resetsAt, now)}</span>
                </span>
              )
            })
          )}
          {quota && !quota.allowed && quota.windows.some((w) => now < w.resetsAt) && <span className="sb-blocked">{t('quotaBlockedShort')}</span>}
        </button>
        {quotaOpen && (
          <div className="sb-pop">
            <QuotaPanel />
          </div>
        )}
      </div>

      <span className="spacer" />
      {stats && (
        <button className={`sb-item sb-ram ${ramLevel}`} title={ramTip} onClick={() => setModal({ type: 'settings', tab: 'performance' })} data-testid="status-ram">
          <Icon name="gauge" size={12} />
          RAM <b>{stats.memoryMB >= 1024 ? `${(stats.memoryMB / 1024).toFixed(1)} GB` : `${stats.memoryMB} MB`}</b>
          <span className="muted">CPU {Math.round(stats.cpu)}%</span>
          {stats.terminals > 0 && (
            <span className="muted">
              <Icon name="terminal" size={11} /> {stats.terminals}
            </span>
          )}
        </button>
      )}
    </footer>
  )
}
