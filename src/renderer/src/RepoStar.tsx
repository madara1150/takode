import { useId, type ReactElement } from 'react'
import { activeXp, levelColor, levelFor, MAX_LEVEL } from '../../shared/level'
import { iconDef, REPO_ICONS, repoIcon, unlockedIconCount, type RepoIcon } from '../../shared/repoIcon'
import type { Repo } from '../../shared/types'
import { useApp } from './App'
import { useT } from './i18n'
import { Icon } from './icons'

/** A repository badge in a level's colours. */
export function Star({ shape, level, size = 16 }: { shape: string; level: number; size?: number }): ReactElement {
  const id = useId().replace(/:/g, '')
  const c = levelColor(level)
  const def = iconDef(shape)
  return (
    <svg className={`repo-star ${def.rgb ? 'rgb' : ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.main} />
          <stop offset="1" stopColor={c.second} />
        </linearGradient>
      </defs>
      <path
        d={def.path}
        fill={`url(#g${id})`}
        fillRule={def.evenOdd ? 'evenodd' : 'nonzero'}
        stroke={c.main}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RepoStar({ repo, size }: { repo: Pick<Repo, 'id' | 'icon'>; size?: number }): ReactElement {
  const icon = repoIcon(repo)
  return <Star shape={icon.shape} level={icon.level} size={size} />
}

/** Repository settings: choose the star shape and a colour from the levels you have reached. */
export function RepoIconPicker({ repo, onChange }: { repo: Repo; onChange: (icon: RepoIcon) => void }): ReactElement {
  const { state } = useApp()
  const t = useT()
  const current = repoIcon(repo)
  const reached = levelFor(activeXp(state)).level
  return (
    <div className="star-picker">
      <span className="muted small">{t('repoIconCount', { n: unlockedIconCount(reached), total: REPO_ICONS.length })}</span>
      <div className="star-shapes" role="radiogroup" aria-label={t('repoIconShape')}>
        {REPO_ICONS.map((def) => {
          const locked = def.level > reached && def.id !== current.shape
          return (
            <button
              key={def.id}
              type="button"
              role="radio"
              aria-checked={def.id === current.shape}
              disabled={locked}
              className={`${def.id === current.shape ? 'active' : ''} ${locked ? 'locked' : ''}`}
              title={locked ? t('repoIconLocked', { n: def.level }) : undefined}
              onClick={() => onChange({ ...current, shape: def.id })}
              data-testid={`icon-${def.id}`}
            >
              <Star shape={def.id} level={current.level} size={22} />
              {locked && <span className="star-lock">Lv {def.level}</span>}
            </button>
          )
        })}
      </div>
      <div className="star-colors" role="radiogroup" aria-label={t('repoIconColor')}>
        {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((n) => {
          // The current colour stays usable even if it came from the automatic pick.
          const locked = n > reached && n !== current.level
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === current.level}
              disabled={locked}
              className={`star-color ${n === current.level ? 'active' : ''} ${locked ? 'locked' : ''}`}
              style={{ background: locked ? undefined : `linear-gradient(135deg, ${levelColor(n).main}, ${levelColor(n).second})` }}
              title={locked ? t('repoIconLocked', { n }) : t('levelN', { n })}
              onClick={() => onChange({ ...current, level: n })}
            >
              {locked && <Icon name="lock" size={9} />}
            </button>
          )
        })}
      </div>
      <span className="muted small">{t('repoIconHint', { n: reached })}</span>
    </div>
  )
}
