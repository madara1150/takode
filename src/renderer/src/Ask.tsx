import { useEffect, useState, type ReactElement } from 'react'
import type { PermissionAnswer, PermissionRequest } from '../../shared/permission'
import { call, on } from './api'
import { useT } from './i18n'
import { Icon } from './icons'

/** Open questions from Claude ("may I run this?"), kept in sync with the main process. */
export function usePermissionRequests(): PermissionRequest[] {
  const [list, setList] = useState<PermissionRequest[]>([])
  useEffect(() => {
    void call<PermissionRequest[]>('permission:pending').then(setList, () => undefined)
    const offAdd = on('permission:request', (r: PermissionRequest) => setList((prev) => [...prev.filter((x) => x.id !== r.id), r]))
    const offDone = on('permission:done', (id: string) => setList((prev) => prev.filter((x) => x.id !== id)))
    return () => {
      offAdd()
      offDone()
    }
  }, [])
  return list
}

const TOOL_ICON: Record<string, string> = { Bash: 'terminal', Edit: 'code', Write: 'code', MultiEdit: 'code', NotebookEdit: 'code', WebFetch: 'external', WebSearch: 'search' }

/** "Claude wants to run …" with Allow / Always allow / Don't allow. */
export function AskCard({ req }: { req: PermissionRequest }): ReactElement {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const answer = (a: PermissionAnswer): void => {
    setBusy(true)
    void call('permission:answer', req.id, a)
  }
  // Enter allows once, Esc says no, while the card is the latest question.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = (e.target as HTMLElement | null)?.closest('textarea, input, .cm-editor')
      if (typing || busy) return
      if (e.key === 'Enter') answer('allow')
      if (e.key === 'Escape') answer('deny')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const isCommand = req.tool === 'Bash'
  const verb = isCommand ? t('askRun') : ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(req.tool) ? t('askEdit') : t('askUse', { tool: req.tool })
  const always = isCommand ? t('askAlwaysCommand', { cmd: (req.rule || req.detail).slice(0, 40) }) : t('askAlwaysTool', { tool: req.tool })
  return (
    <div className="ask-card" role="alertdialog" aria-label={verb} data-testid="ask-card">
      <div className="ask-head">
        <span className="ask-icon">
          <Icon name={TOOL_ICON[req.tool] ?? 'tool'} size={15} />
        </span>
        <strong>{verb}</strong>
        <span className="muted small">{req.tool}</span>
      </div>
      {req.detail && <pre className="ask-detail">{req.detail}</pre>}
      {req.description && req.description !== req.detail && <span className="muted small">{req.description}</span>}
      <div className="ask-actions">
        <button className="btn primary" disabled={busy} onClick={() => answer('allow')} data-testid="ask-allow">
          {t('askAllow')} <kbd>↵</kbd>
        </button>
        <button className="btn" disabled={busy} onClick={() => answer('always')} title={always} data-testid="ask-always">
          {always}
        </button>
        <span className="spacer" />
        <button className="btn ghost" disabled={busy} onClick={() => answer('deny')} data-testid="ask-deny">
          {t('askDeny')} <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
