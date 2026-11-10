import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import iconUrl from '../../../assets/icon.png'
import type { UpdateInfo } from '../../shared/update'
import { call, on } from './api'
import { useApp } from './App'
import { errorText, useT } from './i18n'
import { Icon } from './icons'

type Phase = 'idle' | 'downloading' | 'verifying' | 'ready' | 'installing'

/** Release notes are Markdown; this covers headings, lists, bold, inline code and links as text. */
function Notes({ text }: { text: string }): ReactElement {
  const inline = (line: string, key: number): ReactNode[] =>
    line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .split(/(`[^`]+`|\*\*[^*]+\*\*)/)
      .map((part, i) =>
        part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <code key={`${key}-${i}`}>{part.slice(1, -1)}</code>
        ) : part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
        ) : (
          part
        )
      )
  const blocks: ReactElement[] = []
  let list: ReactElement[] = []
  const flush = (): void => {
    if (list.length) blocks.push(<ul key={`ul-${blocks.length}`}>{list}</ul>)
    list = []
  }
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) return void list.push(<li key={i}>{inline(bullet[1], i)}</li>)
    flush()
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) blocks.push(<h5 key={i}>{inline(heading[1], i)}</h5>)
    else if (line.trim()) blocks.push(<p key={i}>{inline(line, i)}</p>)
  })
  flush()
  return <div className="update-notes">{blocks}</div>
}

export function UpdateModal({ info, onFound }: { info: UpdateInfo; onFound: (info: UpdateInfo | null) => void }): ReactElement {
  const { setModal, busy, toast } = useApp()
  const t = useT()
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(
    () =>
      on('update:progress', (share: number) => {
        setProgress(share)
        if (share >= 1) setPhase('verifying')
      }),
    []
  )

  const working = phase === 'downloading' || phase === 'verifying' || phase === 'installing'
  const close = (): void => {
    if (!working) setModal(null)
  }

  const download = async (): Promise<void> => {
    setError('')
    setProgress(0)
    setPhase('downloading')
    try {
      await call('update:download')
      setPhase('ready')
    } catch (err) {
      setPhase('idle')
      setError(errorText(t, err))
    }
  }

  const install = async (): Promise<void> => {
    setError('')
    setPhase('installing')
    try {
      await call('update:install')
    } catch (err) {
      setPhase('ready')
      setError(errorText(t, err))
    }
  }

  const skip = (): void => {
    void call('update:skip', info.version)
    onFound(null)
    setModal(null)
    toast(t('updateSkip'))
  }

  const pct = Math.round(progress * 100)
  const date = info.publishedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(info.publishedAt))
    : ''

  return (
    <div className="overlay update-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="update-card" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <div className="update-hero">
          <div className="update-glow" />
          <img className="update-icon" src={iconUrl} width={84} height={84} alt="" />
          <h3 id="update-title">{t('updateTitle')}</h3>
          <p className="muted">{t('updateSub', { version: info.version, current: info.current })}</p>
          <div className="version-flow" aria-hidden="true">
            <span className="v-old">{info.current}</span>
            <Icon name="send" size={14} />
            <span className="v-new">{info.version}</span>
          </div>
        </div>

        <div className="update-body">
          <div className="update-notes-head">
            <strong>{t('updateWhatsNew')}</strong>
            {date && <span className="muted small">{date}</span>}
          </div>
          {info.notes ? <Notes text={info.notes} /> : <p className="muted small">{t('updateNoNotes')}</p>}
        </div>

        <div className="update-foot">
          {phase === 'downloading' || phase === 'verifying' ? (
            <div className="update-progress">
              <div className="update-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="muted small">{phase === 'verifying' ? t('updateVerifying') : t('updateDownloading', { pct })}</span>
            </div>
          ) : phase === 'installing' ? (
            <p className="update-status">
              <span className="pulse" />
              {t('updateInstalling')}
            </p>
          ) : phase === 'ready' ? (
            <p className="update-status ok">
              <Icon name="check" size={15} />
              {t('updateReady')}
            </p>
          ) : null}

          {phase === 'ready' && busy.length > 0 && <p className="update-warn">{t('updateBusy', { n: busy.length })}</p>}
          {!info.asset && <p className="update-warn">{t('updateNoFile')}</p>}
          {error && <p className="update-error">{error}</p>}

          <div className="update-actions">
            {phase === 'idle' && (
              <button className="btn ghost small" onClick={skip}>
                {t('updateSkip')}
              </button>
            )}
            <span className="spacer" />
            {!working && (
              <button className="btn" onClick={close}>
                {t('updateLater')}
              </button>
            )}
            {!info.asset ? (
              <button className="btn primary" onClick={() => void call('app:openExternal', info.pageUrl)}>
                <Icon name="external" />
                {t('updateOpenPage')}
              </button>
            ) : phase === 'ready' || phase === 'installing' ? (
              <button className="btn primary update-go" disabled={phase === 'installing'} onClick={() => void install()}>
                <Icon name="refresh" />
                {t('updateRestart')}
              </button>
            ) : (
              <button className="btn primary update-go" disabled={working} onClick={() => void download()} autoFocus>
                <Icon name="upload" />
                {t('updateNow')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
