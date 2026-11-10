import { useState, type FormEvent, type ReactElement } from 'react'
import iconUrl from '../../../assets/icon.png'
import { isEmail, normalizeServer, PASSWORD_MIN } from '../../shared/auth'
import { call } from './api'
import { useApp } from './App'
import { errorText, useT } from './i18n'
import { Icon } from './icons'
import { RedeemBox } from './Redeem'

/** Full-window sign-in screen, shown until the user signs in or chooses to go without an account. */
export function LoginScreen(): ReactElement {
  const { state } = useApp()
  const t = useT()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [server, setServer] = useState(state.auth.server)
  const [showServer, setShowServer] = useState(!state.auth.server)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  const serverOk = normalizeServer(server) !== null
  const ready =
    serverOk && isEmail(email) && (mode === 'login' ? password.length > 0 : name.trim() !== '' && password.length >= PASSWORD_MIN)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!ready || working) return
    setError('')
    setWorking(true)
    try {
      if (mode === 'login') await call('auth:login', server, email, password)
      else await call('auth:register', server, name, email, password)
    } catch (err) {
      setError(errorText(t, err))
      setPassword('')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="login">
      <div className="drag login-drag" />
      <div className="login-glow" aria-hidden="true" />
      <form className="login-card" onSubmit={(e) => void submit(e)}>
        <img className="login-logo" src={iconUrl} width={76} height={76} alt="" />
        <h1>{mode === 'login' ? t('loginTitle') : t('registerTitle')}</h1>
        <p className="muted">{t('loginSub')}</p>

        <div className="seg login-switch" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            {t('signIn')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            {t('createAccount')}
          </button>
        </div>

        {mode === 'register' && (
          <label className="login-field">
            <span>{t('yourName')}</span>
            <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="login-field">
          <span>{t('email')}</span>
          <input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="login-field">
          <span>{t('password')}</span>
          <div className="password-box">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              title={showPassword ? t('hidePassword') : t('showPassword')}
              onClick={() => setShowPassword((v) => !v)}
            >
              <Icon name="eye" size={15} />
            </button>
          </div>
          {mode === 'register' && <span className="muted small">{t('passwordHint', { n: PASSWORD_MIN })}</span>}
        </label>

        <button type="button" className="login-server-toggle" onClick={() => setShowServer((v) => !v)} aria-expanded={showServer}>
          <Icon name="cloud" size={14} />
          {t('serverAddress')}
          {!showServer && serverOk && <span className="muted">{normalizeServer(server)}</span>}
          <Icon name="chevron" size={13} />
        </button>
        {showServer && (
          <label className="login-field">
            <input placeholder="https://api.example.com" value={server} onChange={(e) => setServer(e.target.value)} spellCheck={false} />
            <span className={`small ${server && !serverOk ? 'login-bad' : 'muted'}`}>
              {server && !serverOk ? t('serverBad') : t('serverHint')}
            </span>
          </label>
        )}

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn primary login-submit" disabled={!ready || working}>
          {working ? t('signingIn') : mode === 'login' ? t('signIn') : t('createAccount')}
        </button>
        <button type="button" className="login-guest" onClick={() => void call('auth:guest')}>
          {t('continueGuest')}
        </button>
        <p className="muted small login-note">{t('guestNote')}</p>
      </form>
    </div>
  )
}

/** Settings → Account. */
export function AccountPane(): ReactElement {
  const { state, run } = useApp()
  const t = useT()
  const auth = state.auth
  return (
    <>
      <h4>{t('account')}</h4>
      <div className="account">
        <Avatar size={40} />
        <div className="account-info">
          <strong>{auth.mode === 'account' ? auth.account?.name : t('guestName')}</strong>
          <span className="muted small">{auth.mode === 'account' ? `${auth.account?.email} · ${auth.server}` : t('guestNote')}</span>
        </div>
        {auth.mode === 'account' ? (
          <button className="btn" onClick={() => void run(() => call('auth:logout'))}>
            {t('signOut')}
          </button>
        ) : (
          <button className="btn primary" onClick={() => void run(() => call('auth:logout'))}>
            {t('signIn')}
          </button>
        )}
      </div>
      <p className="muted small">{t('accountLater')}</p>
      <h4>{t('redeemTitle')}</h4>
      <RedeemBox />
    </>
  )
}

/** The signed-in person's picture, or their initial on the level colour. */
export function Avatar({ size = 26 }: { size?: number }): ReactElement {
  const { state } = useApp()
  const account = state.auth.mode === 'account' ? state.auth.account : undefined
  const letter = (account?.name || '?').trim().charAt(0).toUpperCase()
  if (account?.avatarUrl) return <img className="avatar" src={account.avatarUrl} width={size} height={size} alt="" />
  return (
    <span className={`avatar ${account ? '' : 'guest'}`} style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
      {account ? letter : <Icon name="laptop" size={Math.round(size * 0.55)} />}
    </span>
  )
}
