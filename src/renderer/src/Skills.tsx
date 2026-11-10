import { useEffect, useState, type ReactElement } from 'react'
import { call } from './api'
import { useApp } from './App'
import { Toggle } from './Controls'
import { useT } from './i18n'
import { Icon } from './icons'

interface SkillInfo {
  slug: string
  name: string
  description: string
  enabled: boolean
  extraFiles: number
}

interface Draft {
  slug?: string
  name: string
  description: string
  body: string
}

const EMPTY: Draft = { name: '', description: '', body: '' }

/** Settings → Skills: Claude skills Takode loads in every workspace, kept outside the repositories. */
export function SkillsPane(): ReactElement {
  const { run } = useApp()
  const t = useT()
  const [list, setList] = useState<SkillInfo[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const load = (): void => void call<SkillInfo[]>('skills:list').then(setList)
  useEffect(load, [])

  const edit = async (slug: string): Promise<void> => {
    const s = await call<{ description: string; body: string }>('skills:get', slug)
    setDraft({ slug, name: slug, ...s })
  }
  const save = async (): Promise<void> => {
    if (!draft) return
    const ok = await run(() => call('skills:save', draft))
    if (ok !== undefined) {
      setDraft(null)
      load()
    }
  }
  const remove = (s: SkillInfo): void => {
    if (window.confirm(t('skillDeleteConfirm', { name: s.name }))) void run(() => call('skills:remove', s.slug)).then(load)
  }

  if (draft) {
    return (
      <>
        <h4>{draft.slug ? t('skillEdit', { name: draft.slug }) : t('skillNew')}</h4>
        {!draft.slug && (
          <label className="field">
            <span className="field-label">{t('skillName')}</span>
            <input value={draft.name} placeholder="review-thai-copy" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <span className="muted small">{t('skillNameHint')}</span>
          </label>
        )}
        <label className="field">
          <span className="field-label">{t('skillDescription')}</span>
          <input
            value={draft.description}
            placeholder={t('skillDescriptionPlaceholder')}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <span className="muted small">{t('skillDescriptionHint')}</span>
        </label>
        <label className="field">
          <span className="field-label">{t('skillBody')}</span>
          <textarea
            className="skill-body"
            rows={14}
            value={draft.body}
            placeholder={t('skillBodyPlaceholder')}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            spellCheck={false}
          />
        </label>
        <div className="row-end">
          <button className="btn" onClick={() => setDraft(null)}>
            {t('cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!draft.description.trim() || !draft.body.trim() || (!draft.slug && !draft.name.trim())}
            onClick={() => void save()}
          >
            {t('save')}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <p className="muted">{t('skillsIntro')}</p>
      <div className="skill-actions">
        <button className="btn primary" onClick={() => setDraft({ ...EMPTY })} data-testid="skill-new">
          <Icon name="plus" size={14} />
          {t('skillNew')}
        </button>
        <button className="btn" onClick={() => void run(() => call<string | null>('skills:import')).then((slug) => slug && load())}>
          <Icon name="upload" size={14} />
          {t('skillImport')}
        </button>
        <span className="spacer" />
        <button className="btn ghost small" onClick={() => void call('skills:reveal')}>
          <Icon name="folder" size={14} />
          {t('skillFolder')}
        </button>
      </div>
      {list === null ? null : list.length === 0 ? (
        <div className="skill-empty muted">
          <Icon name="sparkle" size={22} />
          <span>{t('skillsEmpty')}</span>
        </div>
      ) : (
        <ul className="skill-list">
          {list.map((s) => (
            <li key={s.slug} className={s.enabled ? '' : 'off'}>
              <div className="skill-info">
                <strong>
                  /takode:{s.slug}
                  {s.extraFiles > 0 && <span className="muted small"> · {t('skillFiles', { n: s.extraFiles })}</span>}
                </strong>
                <span className="muted small">{s.description || '—'}</span>
              </div>
              <button className="icon-btn" title={t('edit')} aria-label={t('edit')} onClick={() => void edit(s.slug)}>
                <Icon name="tool" size={14} />
              </button>
              <button className="icon-btn" title={t('delete')} aria-label={t('delete')} onClick={() => remove(s)}>
                <Icon name="trash" size={14} />
              </button>
              <Toggle
                label={s.name}
                checked={s.enabled}
                onChange={(on) => void run(() => call('skills:enable', s.slug, on)).then(load)}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">{t('skillsHow')}</p>
    </>
  )
}
