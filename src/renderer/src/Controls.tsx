import type { ReactElement, ReactNode } from 'react'

/** One setting: label and hint on the left, the control on the right (or below with `wide`). */
export function SettingRow({
  label,
  hint,
  wide,
  children
}: {
  label: string
  hint?: string
  wide?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <div className={`setting-row ${wide ? 'wide' : ''}`}>
      <div className="setting-text">
        <span className="setting-label">{label}</span>
        {hint && <span className="muted small">{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }): ReactElement {
  return (
    <input
      type="checkbox"
      className="switch"
      role="switch"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}

export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: V
  options: { value: V; label: string; icon?: ReactNode }[]
  onChange: (v: V) => void
  label: string
}): ReactElement {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  label
}: {
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
  label: string
}): ReactElement {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ backgroundSize: `${pct}% 100%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-value">
        {value}
        {unit}
      </span>
    </div>
  )
}
