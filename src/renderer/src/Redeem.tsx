import { useState, type FormEvent, type ReactElement } from 'react'
import type { RedeemReward } from '../../shared/auth'
import { compact } from '../../shared/level'
import { REWARDS, type RewardKind } from '../../shared/rewards'
import { call } from './api'
import { useApp } from './App'
import { errorText, useT } from './i18n'
import { Icon } from './icons'

/** Human name of an unlock such as "effect:rgbFrame". */
export function unlockName(unlock: string, lang: string): string {
  const [kind, id] = unlock.split(':') as [RewardKind, string]
  const r = REWARDS.find((x) => x.kind === kind && x.id === id)
  return r ? (lang === 'th' ? r.name.th : r.name.en) : unlock
}

/** A box to type a coupon code; the account server decides what it gives. */
export function RedeemBox(): ReactElement {
  const { state } = useApp()
  const t = useT()
  const lang = state.settings.language
  const [code, setCode] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RedeemReward | null>(null)
  const signedIn = state.auth.mode === 'account'

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!code.trim() || working) return
    setWorking(true)
    setError('')
    setResult(null)
    try {
      setResult(await call<RedeemReward>('redeem:code', code))
      setCode('')
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="redeem">
      <div className="redeem-head">
        <span className="redeem-icon">
          <Icon name="gift" size={18} />
        </span>
        <div>
          <strong>{t('redeemTitle')}</strong>
          <span className="muted small">{signedIn ? t('redeemHint') : t('redeemSignIn')}</span>
        </div>
      </div>
      {signedIn ? (
        <form className="redeem-form" onSubmit={(e) => void submit(e)}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            aria-label={t('redeemTitle')}
            spellCheck={false}
            autoComplete="off"
            maxLength={64}
            data-testid="redeem-input"
          />
          <button className="btn primary" disabled={!code.trim() || working} data-testid="redeem-submit">
            {working ? t('redeemWorking') : t('redeemButton')}
          </button>
        </form>
      ) : (
        <button className="btn" onClick={() => void call('auth:logout')}>
          {t('signIn')}
        </button>
      )}
      {error && (
        <p className="redeem-error small" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="redeem-result" role="status">
          <Icon name="sparkle" size={16} />
          <div>
            <strong>{t('redeemSuccess')}</strong>
            <ul>
              {result.xp > 0 && <li>+{compact(result.xp)} XP</li>}
              {result.unlocks.map((u) => (
                <li key={u}>{t('redeemUnlocked', { name: unlockName(u, lang) })}</li>
              ))}
            </ul>
            {result.message && <span className="muted small">{result.message}</span>}
          </div>
        </div>
      )}
      {state.redeemed.length > 0 && (
        <details className="redeem-history">
          <summary className="muted small">{t('redeemHistory', { n: state.redeemed.length })}</summary>
          <ul>
            {state.redeemed.map((r) => (
              <li key={r.code} className="small">
                <code>{r.code}</code>
                <span className="muted">
                  {[r.xp > 0 && `+${compact(r.xp)} XP`, ...r.unlocks.map((u) => unlockName(u, lang))].filter(Boolean).join(' · ')}
                </span>
                <span className="muted">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(r.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
