import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { yaml } from '@codemirror/lang-yaml'
import { bracketMatching, foldGutter, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { EditorState, type Extension } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Workspace } from '../../shared/types'
import { call, on } from './api'
import { useApp } from './App'
import { FileIcon } from './FileIcon'
import { errorText, useT } from './i18n'
import { Icon } from './icons'

interface Opened {
  path: string
  state: EditorState
  /** Text as it is on disk, to know whether there are unsaved changes. */
  saved: string
  mtime: number
  eol: '\n' | '\r\n'
  /** The file was changed on disk while it had unsaved edits here. */
  conflict?: boolean
}

/** Asks the Files panel of a workspace to open a file (from Changes, @mentions…). */
export function openInEditor(wsId: string, path: string, line?: number): void {
  window.dispatchEvent(new CustomEvent('takode:open-file', { detail: { wsId, path, line } }))
}

function languageFor(path: string): Extension {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'mts', 'cts'].includes(ext)) return javascript({ typescript: true })
  if (ext === 'tsx') return javascript({ typescript: true, jsx: true })
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return javascript({ jsx: true })
  if (['css', 'scss', 'less'].includes(ext)) return css()
  if (['html', 'htm', 'vue', 'svelte', 'xml', 'svg'].includes(ext)) return html()
  if (ext === 'json' || ext === 'jsonc') return json()
  if (['md', 'mdx', 'markdown'].includes(ext)) return markdown()
  if (ext === 'py') return python()
  if (ext === 'yml' || ext === 'yaml') return yaml()
  return []
}

// Colours come from CSS variables so the editor follows the app theme, light or dark.
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], color: 'var(--syn-keyword)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--syn-string)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--syn-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syn-function)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--syn-type)' },
  { tag: [tags.tagName, tags.heading], color: 'var(--syn-tag)', fontWeight: '600' },
  { tag: [tags.attributeName, tags.propertyName], color: 'var(--syn-prop)' },
  { tag: tags.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: tags.invalid, color: '#ff6b6b' }
])

const look = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--code-size)', backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent) !important'
  },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)', outline: 'none' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, #f5a524 35%, transparent)' },
  '.cm-panels': { backgroundColor: 'var(--raised)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-foldGutter span': { color: 'var(--muted)' }
})

interface TreeNode {
  name: string
  path: string
  dirs: Map<string, TreeNode>
  files: string[]
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join('/')
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { name: parts[i], path: p, dirs: new Map(), files: [] })
      node = node.dirs.get(parts[i])!
    }
    node.files.push(f)
  }
  return root
}

function Tree({
  node,
  depth,
  open,
  toggle,
  active,
  onOpen
}: {
  node: TreeNode
  depth: number
  open: Set<string>
  toggle: (p: string) => void
  active: string
  onOpen: (p: string) => void
}): ReactElement {
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
  const files = [...node.files].sort((a, b) => a.localeCompare(b))
  return (
    <>
      {dirs.map((d) => (
        <li key={d.path}>
          <button className="tree-row dir" style={{ paddingLeft: 8 + depth * 12 }} onClick={() => toggle(d.path)} aria-expanded={open.has(d.path)}>
            <span className={`tree-caret ${open.has(d.path) ? 'open' : ''}`}>
              <Icon name="chevron" size={11} />
            </span>
            <Icon name="folder" size={14} />
            <span className="tree-name">{d.name}</span>
          </button>
          {open.has(d.path) && (
            <ul>
              <Tree node={d} depth={depth + 1} open={open} toggle={toggle} active={active} onOpen={onOpen} />
            </ul>
          )}
        </li>
      ))}
      {files.map((f) => (
        <li key={f}>
          <button className={`tree-row ${f === active ? 'active' : ''}`} style={{ paddingLeft: 22 + depth * 12 }} onClick={() => onOpen(f)} title={f}>
            <FileIcon path={f} size={14} />
            <span className="tree-name">{f.slice(f.lastIndexOf('/') + 1)}</span>
          </button>
        </li>
      ))}
    </>
  )
}

/** Files tab: browse the workspace and edit files by hand. */
export function FilesView({ ws, visible, onSaved }: { ws: Workspace; visible: boolean; onSaved: () => void }): ReactElement {
  const { toast } = useApp()
  const t = useT()
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const [tabs, setTabs] = useState<Opened[]>([])
  const [active, setActive] = useState('')
  const [error, setError] = useState('')
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const activeRef = useRef(active)
  activeRef.current = active

  const loadList = (fresh = false): void => void call<string[]>('ws:files', ws.id, fresh).then(setFiles, () => setFiles([]))
  useEffect(() => {
    if (visible) loadList()
  }, [visible, ws.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = (o: Opened): boolean => o.state.doc.toString() !== o.saved
  const update = (path: string, patch: Partial<Opened>): void =>
    setTabs((prev) => prev.map((o) => (o.path === path ? { ...o, ...patch } : o)))

  // Remembers the editor state (text, cursor, undo history) of the tab being left.
  const stash = (): void => {
    const v = view.current
    if (!v || !activeRef.current) return
    const state = v.state
    setTabs((prev) => prev.map((o) => (o.path === activeRef.current ? { ...o, state } : o)))
    tabsRef.current = tabsRef.current.map((o) => (o.path === activeRef.current ? { ...o, state } : o))
  }

  const save = async (): Promise<void> => {
    const path = activeRef.current
    const o = tabsRef.current.find((x) => x.path === path)
    const v = view.current
    if (!o || !v) return
    const text = v.state.doc.toString()
    try {
      const res = await call<{ mtime: number }>('file:write', ws.id, path, text, { expectMtime: o.mtime, eol: o.eol, force: o.conflict === false })
      update(path, { saved: text, mtime: res.mtime, conflict: undefined, state: v.state })
      onSaved()
    } catch (err) {
      if ((err as Error).message === 'FILE_CHANGED') update(path, { conflict: true, state: v.state })
      else toast(errorText(t, err), 'error')
    }
  }
  const saveRef = useRef(save)
  saveRef.current = save

  const makeState = (path: string, text: string): EditorState =>
    EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        syntaxHighlighting(highlight),
        EditorState.tabSize.of(2),
        languageFor(path),
        look,
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (void saveRef.current(), true) },
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap
        ]),
        // Re-render tabs when the text changes so the unsaved dot shows.
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const state = u.state
            setTabs((prev) => prev.map((o) => (o.path === activeRef.current ? { ...o, state } : o)))
          }
        })
      ]
    })

  const show = (path: string, line?: number): void => {
    const o = tabsRef.current.find((x) => x.path === path)
    if (!o) return
    if (!view.current) view.current = new EditorView({ state: o.state, parent: host.current! })
    else view.current.setState(o.state)
    setActive(path)
    activeRef.current = path
    if (line && line > 0) {
      const l = view.current.state.doc.line(Math.min(line, view.current.state.doc.lines))
      view.current.dispatch({ selection: { anchor: l.from }, scrollIntoView: true })
    }
    requestAnimationFrame(() => view.current?.focus())
  }

  const open = async (path: string, line?: number): Promise<void> => {
    setError('')
    // Show the file's folders in the tree.
    setOpenDirs((prev) => {
      const next = new Set(prev)
      path.split('/').slice(0, -1).forEach((_, i, parts) => next.add(parts.slice(0, i + 1).join('/')))
      return next
    })
    stash()
    if (!tabsRef.current.some((o) => o.path === path)) {
      try {
        const f = await call<{ text: string; mtime: number; eol: '\n' | '\r\n' }>('file:read', ws.id, path)
        const opened: Opened = { path, state: makeState(path, f.text), saved: f.text, mtime: f.mtime, eol: f.eol }
        tabsRef.current = [...tabsRef.current, opened]
        setTabs(tabsRef.current)
      } catch (err) {
        setError(`${path}: ${errorText(t, err)}`)
        return
      }
    }
    show(path, line)
  }

  const close = (path: string): void => {
    const o = tabsRef.current.find((x) => x.path === path)
    if (o && dirty(o) && !window.confirm(t('editorDiscard', { name: path }))) return
    const rest = tabsRef.current.filter((x) => x.path !== path)
    tabsRef.current = rest
    setTabs(rest)
    if (activeRef.current === path) {
      const next = rest[rest.length - 1]
      if (next) show(next.path)
      else {
        view.current?.destroy()
        view.current = null
        setActive('')
        activeRef.current = ''
      }
    }
  }

  /** Reloads open files that changed on disk; files with unsaved edits get a warning instead. */
  const checkDisk = async (): Promise<void> => {
    for (const o of tabsRef.current) {
      let f: { text: string; mtime: number; eol: '\n' | '\r\n' }
      try {
        f = await call('file:read', ws.id, o.path)
      } catch {
        continue
      }
      if (Math.abs(f.mtime - o.mtime) <= 1) continue
      const current = o.path === activeRef.current && view.current ? view.current.state : o.state
      if (current.doc.toString() !== o.saved) {
        update(o.path, { conflict: true })
        continue
      }
      // Clean file: take the new text, keeping the cursor where it can be.
      const state = current.update({ changes: { from: 0, to: current.doc.length, insert: f.text } }).state
      const fresh = { ...o, state, saved: f.text, mtime: f.mtime, eol: f.eol, conflict: undefined }
      tabsRef.current = tabsRef.current.map((x) => (x.path === o.path ? fresh : x))
      setTabs(tabsRef.current)
      if (o.path === activeRef.current) view.current?.setState(state)
    }
  }
  const checkRef = useRef(checkDisk)
  checkRef.current = checkDisk

  const reload = async (path: string): Promise<void> => {
    const f = await call<{ text: string; mtime: number; eol: '\n' | '\r\n' }>('file:read', ws.id, path)
    const state = makeState(path, f.text)
    tabsRef.current = tabsRef.current.map((x) => (x.path === path ? { ...x, state, saved: f.text, mtime: f.mtime, eol: f.eol, conflict: undefined } : x))
    setTabs(tabsRef.current)
    if (path === activeRef.current) view.current?.setState(state)
  }

  // Requests to open a file from elsewhere in the app.
  useEffect(() => {
    const onOpen = (e: Event): void => {
      const d = (e as CustomEvent<{ wsId: string; path: string; line?: number }>).detail
      if (d.wsId === ws.id) void open(d.path, d.line)
    }
    window.addEventListener('takode:open-file', onOpen)
    return () => window.removeEventListener('takode:open-file', onOpen)
  }, [ws.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Claude may change files: look again when a reply ends and when the window comes back.
  useEffect(() => {
    const offChat = on('chat:item', (p: { wsId: string; item: { role: string } }) => {
      if (p.wsId === ws.id && p.item.role === 'result') void checkRef.current()
    })
    const onFocus = (): void => void checkRef.current()
    window.addEventListener('focus', onFocus)
    return () => {
      offChat()
      window.removeEventListener('focus', onFocus)
    }
  }, [ws.id])
  useEffect(() => {
    if (visible) void checkRef.current()
  }, [visible])

  useEffect(() => () => view.current?.destroy(), [])

  const tree = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return buildTree(q ? files.filter((f) => f.toLowerCase().includes(q)) : files)
  }, [files, filter])
  const filtering = filter.trim() !== ''
  const allDirs = useMemo(() => {
    if (!filtering) return openDirs
    const s = new Set<string>()
    const walk = (n: TreeNode): void => n.dirs.forEach((d) => (s.add(d.path), walk(d)))
    walk(tree)
    return s
  }, [filtering, tree, openDirs])
  const toggle = (p: string): void =>
    setOpenDirs((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })

  const newFile = async (): Promise<void> => {
    const name = window.prompt(t('editorNewFilePrompt'))?.trim()
    if (!name) return
    try {
      await call('file:write', ws.id, name, '', { create: true })
      loadList(true)
      setFiles((prev) => [...prev, name])
      await open(name)
      onSaved()
    } catch (err) {
      toast(errorText(t, err), 'error')
    }
  }

  const current = tabs.find((o) => o.path === active)
  return (
    <div className="files-view">
      <div className="file-tree">
        <div className="file-tree-head">
          <input placeholder={t('editorFilter')} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('editorFilter')} />
          <button className="icon-btn" title={t('editorNewFile')} aria-label={t('editorNewFile')} onClick={() => void newFile()}>
            <Icon name="plus" size={14} />
          </button>
          <button className="icon-btn" title={t('refresh')} aria-label={t('refresh')} onClick={() => loadList(true)}>
            <Icon name="refresh" size={13} />
          </button>
        </div>
        <ul className="tree" data-testid="file-tree">
          <Tree node={tree} depth={0} open={allDirs} toggle={toggle} active={active} onOpen={(p) => void open(p)} />
        </ul>
      </div>
      <div className="editor-pane">
        {tabs.length > 0 && (
          <div className="editor-tabs" role="tablist">
            {tabs.map((o) => (
              <div key={o.path} className={`editor-tab ${o.path === active ? 'active' : ''}`} role="tab" aria-selected={o.path === active} title={o.path}>
                <button
                  className="editor-tab-name"
                  onClick={() => {
                    stash()
                    show(o.path)
                  }}
                >
                  <FileIcon path={o.path} size={13} />
                  {o.path.slice(o.path.lastIndexOf('/') + 1)}
                </button>
                {dirty(o) ? (
                  <button className="editor-tab-x dirty" aria-label={t('editorClose')} title={t('editorUnsaved')} onClick={() => close(o.path)}>
                    <span className="dot" />
                  </button>
                ) : (
                  <button className="editor-tab-x" aria-label={t('editorClose')} onClick={() => close(o.path)}>
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {current?.conflict && (
          <div className="editor-conflict" role="alert">
            <Icon name="refresh" size={14} />
            <span>{t('editorChangedOnDisk')}</span>
            <span className="spacer" />
            <button className="btn small" onClick={() => void reload(current.path)}>
              {t('editorReload')}
            </button>
            <button
              className="btn small danger"
              onClick={() => {
                update(current.path, { conflict: false })
                tabsRef.current = tabsRef.current.map((x) => (x.path === current.path ? { ...x, conflict: false } : x))
                void saveRef.current()
              }}
            >
              {t('editorOverwrite')}
            </button>
          </div>
        )}
        {error && <div className="editor-error small">{error}</div>}
        {current && (
          <div className="editor-bar small muted">
            <span className="editor-path">{current.path}</span>
            <span className="spacer" />
            {dirty(current) && <span className="editor-unsaved">{t('editorUnsaved')}</span>}
            <button
              className="btn small"
              title={t('openInCode')}
              onClick={() => {
                const v = view.current
                const line = v ? v.state.doc.lineAt(v.state.selection.main.head).number : undefined
                void call('ws:openCode', ws.id, current.path, line).catch((err) => toast(errorText(t, err), 'error'))
              }}
              data-testid="editor-vscode"
            >
              <Icon name="external" size={12} />
              VS Code
            </button>
            <button className="btn small primary" disabled={!dirty(current)} onClick={() => void save()} data-testid="editor-save">
              {t('save')} <kbd>⌘S</kbd>
            </button>
          </div>
        )}
        <div className="editor-host" ref={host} hidden={!current} data-testid="editor" />
        {!current && (
          <div className="editor-empty muted">
            <Icon name="list" size={24} />
            <span>{t('editorEmpty')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
