import { useEffect, useRef, useState, type ReactElement } from 'react'
import { formatBytes, MAX_ATTACHMENTS, splitMentions, type Attachment } from '../../shared/attach'
import { call } from './api'
import { FileIcon } from './FileIcon'
import { useT } from './i18n'
import { Icon } from './icons'

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i

/** Turns dropped or pasted files into attachments (copied by the main process). */
export async function attachFiles(tabId: string, files: File[]): Promise<Attachment[]> {
  const out: Attachment[] = []
  const paths: string[] = []
  for (const file of files.slice(0, MAX_ATTACHMENTS)) {
    const p = window.takode.pathForFile(file)
    if (p) paths.push(p)
    else {
      // Pasted data such as a screenshot has no file on disk.
      const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
      const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${ext}`
      out.push(await call<Attachment>('attach:data', tabId, name, new Uint8Array(await file.arrayBuffer())))
    }
  }
  if (paths.length) out.push(...(await call<Attachment[]>('attach:paths', tabId, paths)))
  return out
}

function Thumb({ file }: { file: Attachment }): ReactElement {
  return IMAGE.test(file.name) ? (
    <img className="attach-thumb" src={`takode-file://${encodeURI(file.path)}`} alt="" />
  ) : (
    <FileIcon path={file.name} size={18} />
  )
}

/** Files waiting to be sent, above the message box. */
export function AttachChips({ files, onRemove }: { files: Attachment[]; onRemove?: (f: Attachment) => void }): ReactElement {
  const t = useT()
  return (
    <div className="attach-chips">
      {files.map((f) => (
        <span key={f.path} className="attach-chip" title={f.name}>
          <Thumb file={f} />
          <span className="attach-name">{f.name}</span>
          <span className="muted small">{formatBytes(f.size)}</span>
          {onRemove ? (
            <button type="button" className="attach-x" aria-label={t('attachRemove', { name: f.name })} onClick={() => onRemove(f)}>
              <Icon name="x" size={12} />
            </button>
          ) : (
            <button type="button" className="attach-x" aria-label={t('attachOpen')} title={t('attachOpen')} onClick={() => void call('attach:open', f.path)}>
              <Icon name="external" size={12} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

/** What you sent: @files shown as chips, then the attached files. */
export function UserMessage({ text, files, onOpenFile }: { text: string; files?: Attachment[]; onOpenFile?: (path: string) => void }): ReactElement {
  return (
    <div className="msg user">
      {text && (
        <div>
          {splitMentions(text).map((part, i) =>
            part.mention ? (
              <button
                key={i}
                type="button"
                className="mention"
                title={part.text.slice(1)}
                disabled={!onOpenFile}
                onClick={() => onOpenFile?.(part.text.slice(1))}
              >
                <FileIcon path={part.text} size={13} />
                {part.text.slice(1)}
              </button>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </div>
      )}
      {!!files?.length && <AttachChips files={files} />}
    </div>
  )
}

/** The project files that match what is typed after "@". */
export function MentionMenu({
  items,
  active,
  onPick,
  onHover
}: {
  items: string[]
  active: number
  onPick: (path: string) => void
  onHover: (i: number) => void
}): ReactElement {
  const t = useT()
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <div className="mention-menu" role="listbox" aria-label={t('mentionTitle')}>
      <div className="mention-head muted small">
        <Icon name="search" size={12} />
        {t('mentionTitle')}
        <span className="spacer" />
        <kbd>↑↓</kbd> <kbd>↵</kbd>
      </div>
      {items.length === 0 ? (
        <div className="muted small mention-empty">{t('mentionNone')}</div>
      ) : (
        <ul ref={list}>
          {items.map((p, i) => {
            const slash = p.lastIndexOf('/')
            return (
              <li
                key={p}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : ''}
                onMouseEnter={() => onHover(i)}
                // Keep focus in the message box.
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(p)
                }}
              >
                <FileIcon path={p} size={15} />
                <strong>{p.slice(slash + 1)}</strong>
                {slash > 0 && <span className="muted small">{p.slice(0, slash)}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The "+" button: attach from the computer or reference a project file. */
export function PlusMenu({ onAttach, onMention, disabled }: { onAttach: () => void; onMention: () => void; disabled?: boolean }): ReactElement {
  const t = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const pick = (fn: () => void): void => {
    setOpen(false)
    fn()
  }
  return (
    <div className="plus-wrap" ref={box}>
      <button
        type="button"
        className={`select pill plus-btn ${open ? 'on' : ''}`}
        aria-label={t('attachMenu')}
        title={t('attachMenu')}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        data-testid="plus"
      >
        <Icon name="plus" size={15} />
      </button>
      {open && (
        <div className="plus-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => pick(onAttach)}>
            <Icon name="upload" size={15} />
            <span>
              <strong>{t('attachFromComputer')}</strong>
              <span className="muted small">{t('attachFromComputerHint')}</span>
            </span>
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onMention)}>
            <span className="at-icon">@</span>
            <span>
              <strong>{t('mentionFile')}</strong>
              <span className="muted small">{t('mentionFileHint')}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
