import { useEffect, useState, type ReactElement } from 'react'
import { quotaLevel, timeLeft, usedNow, type QuotaWindow } from '../../shared/quota'
import { call } from './api'
import { useApp } from './App'
import { useT, type Key, type T } from './i18n'
import { Icon } from './icons'

const NAMES: Record<string, Key> = { five_hour: 'quotaFiveHour', seven_day: 'quotaSevenDay' }

function windowName(t: T, key: string): string {
  return NAMES[key] ? t(NAMES[key]) : key.replace(/_/g, ' ')
}

/** "resets in 2h 10m" within a day, otherwise the date and time. */
function resetText(t: T, lang: string, w: QuotaWindow, now: number): string {
  const left = timeLeft(w.resetsAt, now)
  if (!left) return t('quotaReset')
  if (left.days === 0) {
    const parts = [left.hours ? `${left.hours}${t('unitHour')}` : '', `${left.minutes}${t('unitMinute')}`]
    return t('quotaResetsIn', { time: parts.filter(Boolean).join(' ') })
  }
  const date = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return t('quotaResetsAt', { date: date.format(w.resetsAt) })
}

/** Claude usage against each limit, with when it resets. */
export function QuotaPanel({ compact }: { compact?: boolean }): ReactElement | null {
  const { state, claude, run } = useApp()
  const t = useT()
  const lang = state.settings.language
  const quota = state.quota
  const [now, setNow] = useState(Date.now())
  const [checking, setChecking] = useState(false)

  // Keep the countdowns moving.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (compact && !quota && !claude?.loggedIn) return null

  const refresh = (): void => {
    setChecking(true)
    void run(() => call('quota:refresh')).then(() => {
      setChecking(false)
      setNow(Date.now())
    })
  }
  const exact = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' })
  const clock = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' })

  return (
    <section className={`quota ${compact ? 'compact' : ''}`} aria-label={t('quota')}>
      <div className="quota-head">
        <strong>{t('quota')}</strong>
        {!compact && quota && <span className="small">{t('quotaUpdated', { time: clock.format(quota.updatedAt) })}</span>}
        <button
          className="icon-btn"
          title={`${t('quotaRefresh')} · ${t('quotaRefreshTip')}`}
          aria-label={t('quotaRefresh')}
          disabled={checking}
          onClick={refresh}
        >
          <span className={checking ? 'spin' : ''} style={{ display: 'inline-flex' }}>
            <Icon name="refresh" size={compact ? 13 : 15} />
          </span>
        </button>
      </div>
      {!quota && <span className="muted">{t('quotaNone')}</span>}
      {quota && !quota.allowed && quota.windows.some((w) => now < w.resetsAt) && (
        <span className="quota-blocked">{t('quotaBlocked')}</span>
      )}
      {quota?.windows.map((w) => {
        const used = usedNow(w, now)
        const pct = Math.round(used * 100)
        return (
          <div key={w.key} className={`quota-row ${quotaLevel(used)}`} title={exact.format(w.resetsAt)}>
            <div className="quota-line">
              <span>{windowName(t, w.key)}</span>
              <span className="quota-pct">{pct}%</span>
            </div>
            <div
              className="quota-bar"
              role="progressbar"
              aria-label={windowName(t, w.key)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <i style={{ width: `${pct}%` }} />
            </div>
            <span className="muted small">{resetText(t, lang, w, now)}</span>
          </div>
        )
      })}
    </section>
  )
}
