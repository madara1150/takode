import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'

export interface Option<V extends string = string> {
  value: V
  label: string
  icon?: ReactNode
  hint?: string
}

interface Props<V extends string> {
  value: V
  options: Option<V>[]
  onChange: (value: V) => void
  ariaLabel: string
  /** "pill" is the compact look used in the chat box; "field" fills its row in forms. */
  variant?: 'pill' | 'field'
  /** Icon shown on the button instead of the selected option's own icon. */
  icon?: ReactNode
  title?: string
}

/** Themed dropdown that replaces the native select. Arrow keys, Enter and Escape work. */
export function Select<V extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  variant = 'field',
  icon,
  title
}: Props<V>): ReactElement {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [style, setStyle] = useState<CSSProperties>({})
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  const show = (): void => {
    const rect = button.current!.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom
    const upward = below < 260 && rect.top > below
    setStyle({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
      minWidth: Math.max(rect.width, 180),
      ...(upward
        ? { bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 16 }
        : { top: rect.bottom + 6, maxHeight: below - 16 })
    })
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!button.current?.contains(target) && !popup.current?.contains(target)) close()
    }
    const onScroll = (e: Event): void => {
      if (!popup.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (open) popup.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const choose = (option: Option<V> | undefined): void => {
    setOpen(false)
    if (option && option.value !== value) onChange(option.value)
  }

  const onKey = (e: KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        show()
      }
      return
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(options[active])
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`select ${variant === "field" ? "boxed" : "pill"} ${open ? 'open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${selected?.label ?? ''}`}
        title={title}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
      >
        {(icon ?? selected?.icon) && <span className="select-icon">{icon ?? selected?.icon}</span>}
        <span className="select-label">{selected?.label ?? value}</span>
        <Icon name="chevron" size={13} />
      </button>
      {open &&
        createPortal(
          <div ref={popup} className="select-popup" role="listbox" aria-label={ariaLabel} style={style}>
            {options.map((option, i) => (
              <div
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={`select-option ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.icon && <span className="select-icon">{option.icon}</span>}
                <span className="select-text">
                  <span>{option.label}</span>
                  {option.hint && <span className="muted small">{option.hint}</span>}
                </span>
                {option.value === value && <Icon name="check" size={14} />}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

/** Five bars that fill up with the effort level; empty means "auto". */
export function EffortIcon({ level, size = 14 }: { level: string; size?: number }): ReactElement {
  const filled = ['low', 'medium', 'high', 'xhigh', 'max'].indexOf(level) + 1
  return (
    <svg className={`effort-icon e-${level || 'auto'}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={0.5 + i * 3.2}
          y={11 - i * 2.4}
          width="2.200"
          height={4 + i * 2.4}
          rx="1"
          fill="currentColor"
          opacity={filled === 0 ? 0.45 : i < filled ? 1 : 0.22}
        />
      ))}
    </svg>
  )
}
