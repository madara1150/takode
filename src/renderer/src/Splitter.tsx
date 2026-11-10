import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'

const read = (key: string, fallback: number): number => {
  try {
    const n = Number(localStorage.getItem(key))
    return Number.isFinite(n) && n > 0 ? n : fallback
  } catch {
    return fallback
  }
}

/** A width the user can drag, remembered between launches. */
export function useStoredWidth(key: string, fallback: number): [number, (w: number) => void, () => void] {
  const [width, setWidth] = useState(() => read(key, fallback))
  const save = useCallback(
    (w: number) => {
      setWidth(w)
      try {
        localStorage.setItem(key, String(Math.round(w)))
      } catch {
        /* storage unavailable: the size just isn't remembered */
      }
    },
    [key]
  )
  const reset = useCallback(() => {
    setWidth(fallback)
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }, [key, fallback])
  return [width, save, reset]
}

interface Props {
  label: string
  value: number
  min: number
  /** Upper limit, worked out when dragging starts (it depends on the window size). */
  max: () => number
  onChange: (value: number) => void
  onReset: () => void
  /** "left": the panel is left of the handle and grows when dragged right. "right": the opposite. */
  side: 'left' | 'right'
}

/** Thin handle between two panels. Drag it, use the arrow keys, or double-click to reset. */
export function Splitter({ label, value, min, max, onChange, onReset, side }: Props): ReactElement {
  const start = useRef<{ x: number; value: number; max: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const clamp = (v: number, upper: number): number => Math.round(Math.min(Math.max(v, min), Math.max(min, upper)))

  useEffect(() => {
    document.body.classList.toggle('resizing', dragging)
    return () => document.body.classList.remove('resizing')
  }, [dragging])

  const down = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, value, max: max() }
    setDragging(true)
  }
  const move = (e: PointerEvent<HTMLDivElement>): void => {
    const s = start.current
    if (!s) return
    const delta = e.clientX - s.x
    onChange(clamp(s.value + (side === 'left' ? delta : -delta), s.max))
  }
  const up = (): void => {
    start.current = null
    setDragging(false)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 48 : 16
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
    if (e.key === grow) onChange(clamp(value + step, max()))
    else if (e.key === shrink) onChange(clamp(value - step, max()))
    else if (e.key === 'Home') onReset()
    else return
    e.preventDefault()
  }

  return (
    <div
      className={`splitter ${side} ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={key}
    />
  )
}
