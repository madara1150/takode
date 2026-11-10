import type { ReactElement } from 'react'
import type { BranchInfo, BranchState } from '../../shared/branch'
import { useT, type Key } from './i18n'
import { Icon } from './icons'

const LOOK: Record<BranchState, { icon: string; full: Key; short: Key }> = {
  local: { icon: 'laptop', full: 'stLocal', short: 'stShortLocal' },
  pushed: { icon: 'cloud', full: 'stPushed', short: 'stShortPushed' },
  draft: { icon: 'pr', full: 'stDraft', short: 'stShortDraft' },
  open: { icon: 'pr', full: 'stOpen', short: 'stShortOpen' },
  merged: { icon: 'merge', full: 'stMerged', short: 'stShortMerged' },
  closed: { icon: 'pr', full: 'stClosed', short: 'stShortClosed' }
}

/** Icon whose shape and colour say where the branch stands: local, pushed, pull request or merged. */
export function BranchBadge({ info, withLabel }: { info?: BranchInfo; withLabel?: boolean }): ReactElement | null {
  const t = useT()
  if (!info) return null
  const look = LOOK[info.state]
  const number = info.prNumber ? ` #${info.prNumber}` : ''
  const ahead = info.ahead > 0 ? ` · ${t('stAhead', { n: info.ahead })}` : ''
  const text = `${t(look.full)}${number}${ahead}`
  return (
    <span className={`branch-badge st-${info.state} ${withLabel ? 'labelled' : ''}`} title={text} role="img" aria-label={text}>
      <Icon name={look.icon} size={withLabel ? 13 : 15} />
      {info.ahead > 0 && <span className="ahead-dot" />}
      {withLabel && (
        <span>
          {t(look.short)}
          {number}
        </span>
      )}
    </span>
  )
}
