import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { call } from './api'
import { useApp } from './App'
import { useT } from './i18n'
import { Icon } from './icons'
import { THEMES } from './themes'

interface Entry {
  id: string
  icon: string
  label: string
  hint: string
  run: () => void
}

/** Spotlight-style launcher: one box to jump to any workspace or run any command. */
export function Palette({ onClose }: { onClose: () => void }): ReactElement {
  const { state, selected, select, setModal, toggleSpotlight, run } = useApp()
  const t = useT()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = []
    const repoName = (id: string): string => state.repos.find((r) => r.id === id)?.name ?? ''
    for (const ws of state.workspaces) {
      list.push({
        id: `ws-${ws.id}`,
        icon: 'branch',
        label: ws.name,
        hint: `${t('goTo')} · ${repoName(ws.repoId)}`,
        run: () => select(ws.id)
      })
    }
    for (const repo of state.repos) {
      list.push({
        id: `new-${repo.id}`,
        icon: 'plus',
        label: `${t('newWorkspace')}: ${repo.name}`,
        hint: t('command'),
        run: () => setModal({ type: 'newWorkspace', repoId: repo.id })
      })
    }
    if (selected) {
      list.push(
        { id: 'spot', icon: 'spotlight', label: `${t('spotlight')}: ${selected.name}`, hint: t('command'), run: () => toggleSpotlight(selected) },
        { id: 'newchat', icon: 'plus', label: `${t('newChat')}: ${selected.name}`, hint: t('command'), run: () => void run(() => call('tabs:add', selected.id)) },
        { id: 'review', icon: 'eye', label: `${t('review')}: ${selected.name}`, hint: t('command'), run: () => void run(() => call('ws:agentAction', selected.id, 'review')) },
        { id: 'fix', icon: 'tool', label: `${t('fixErrors')}: ${selected.name}`, hint: t('command'), run: () => void run(() => call('ws:agentAction', selected.id, 'fixErrors')) },
        { id: 'resolve', icon: 'branch', label: `${t('resolveConflicts')}: ${selected.name}`, hint: t('command'), run: () => void run(() => call('ws:agentAction', selected.id, 'resolveConflicts')) },
        ...(state.repos.find((r) => r.id === selected.repoId)?.actions.custom ?? [])
          .filter((a) => a.name.trim() && a.command.trim())
          .map((a) => ({ id: `act-${a.id}`, icon: 'play', label: a.name, hint: a.command, run: () => void run(() => call('ws:runAction', selected.id, a.id)) })),
        { id: 'push', icon: 'upload', label: `${t('push')}: ${selected.name}`, hint: t('command'), run: () => setModal({ type: 'push', wsId: selected.id }) },
        { id: 'pr', icon: 'pr', label: `${t('createPr')}: ${selected.name}`, hint: t('command'), run: () => setModal({ type: 'createPr', wsId: selected.id }) },
        { id: 'finder', icon: 'folder', label: `${t('openIn')} ${t('finder')}`, hint: t('command'), run: () => void run(() => call('ws:open', selected.id, 'finder')) },
        { id: 'term', icon: 'folder', label: `${t('openIn')} ${t('terminal')}`, hint: t('command'), run: () => void run(() => call('ws:open', selected.id, 'terminal')) },
        { id: 'editor', icon: 'folder', label: `${t('openIn')} ${t('editor')}`, hint: t('command'), run: () => void run(() => call('ws:open', selected.id, 'editor')) }
      )
    }
    list.push(
      { id: 'add', icon: 'plus', label: t('addRepo'), hint: t('command'), run: () => setModal({ type: 'addRepo' }) },
      { id: 'settings', icon: 'gear', label: t('settings'), hint: t('command'), run: () => setModal({ type: 'settings' }) },
      {
        id: 'lang',
        icon: 'chat',
        label: t('switchLanguage'),
        hint: t('command'),
        run: () => void call('settings:update', { language: state.settings.language === 'th' ? 'en' : 'th' })
      }
    )
    for (const th of [...THEMES.map((x) => x.id), 'system']) {
      list.push({
        id: `theme-${th}`,
        icon: 'palette',
        label: `${t('themeWord')}: ${th === 'system' ? t('themeSystem') : th}`,
        hint: t('command'),
        run: () => void call('settings:update', { theme: th })
      })
    }
    return list
  }, [state, selected, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = entries.filter((e) => words.every((w) => `${e.label} ${e.hint}`.toLowerCase().includes(w)))
  const active = Math.min(index, Math.max(0, shown.length - 1))

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (entry: Entry | undefined): void => {
    if (!entry) return
    onClose()
    entry.run()
  }

  return (
    <div className="overlay palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('search')}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            autoFocus
            value={query}
            placeholder={t('palettePlaceholder')}
            aria-label={t('palettePlaceholder')}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex(Math.min(active + 1, shown.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex(Math.max(active - 1, 0))
              } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                choose(shown[active])
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="palette-list" ref={listRef} role="listbox">
          {shown.length === 0 && <li className="palette-empty muted">{t('paletteEmpty')}</li>}
          {shown.map((e, i) => (
            <li
              key={e.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(e)}
            >
              <Icon name={e.icon} />
              <span className="palette-label">{e.label}</span>
              <span className="muted small">{e.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
