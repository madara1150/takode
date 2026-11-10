// Which model, effort and permissions a message is sent with.
import type { Effort, ModelOption, PermissionMode, Settings, Workspace } from './types'

export const EFFORTS: Exclude<Effort, ''>[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** A model the signed-in Claude account can use, as reported by Claude Code. */
export interface AvailableModel {
  /** Value to pass to Claude Code ("" = its default). */
  id: string
  /** Versioned name, e.g. "Opus 5.5". */
  label: string
  /** Full model name it currently points at, e.g. "claude-opus-5-5". */
  resolved: string
  description: string
  /** Effort levels it accepts; empty when it has no effort setting. */
  efforts: Effort[]
}

/** Reads the model list from Claude Code's "initialize" response. */
export function toAvailable(raw: unknown): AvailableModel[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m) => m && typeof m.value === 'string')
    .map((m) => {
      const [version, ...rest] = String(m.description ?? '').split(' · ')
      const name = version.trim() || String(m.displayName ?? m.value)
      const isDefault = m.value === 'default'
      return {
        id: isDefault ? '' : m.value,
        label: isDefault ? `Default · ${name}` : name,
        resolved: String(m.resolvedModel ?? ''),
        description: rest.join(' · ').trim(),
        efforts: (Array.isArray(m.supportedEffortLevels) ? m.supportedEffortLevels : []).filter((e: string) =>
          (EFFORTS as string[]).includes(e)
        )
      }
    })
}

export const optionFrom = (m: AvailableModel): ModelOption => ({
  key: m.id || 'default',
  id: m.id,
  label: m.label,
  enabled: true,
  permission: '',
  effort: '',
  resolved: m.resolved,
  efforts: m.efforts
})

/** Used until the real list has been read (or when Claude Code is not installed). */
export const DEFAULT_MODELS: ModelOption[] = [
  { key: 'default', id: '', label: 'Default', enabled: true, permission: '', effort: '' },
  { key: 'opus', id: 'opus', label: 'Opus', enabled: true, permission: '', effort: '' },
  { key: 'sonnet', id: 'sonnet', label: 'Sonnet', enabled: true, permission: '', effort: '' },
  { key: 'haiku', id: 'haiku', label: 'Haiku', enabled: true, permission: '', effort: '' }
]

/**
 * Brings the chat's model list in line with what the account can really use.
 * A list the user has not customised is replaced; a customised one only gets
 * fresh details (version it points at, effort levels) for the models it has.
 */
export function syncModels(current: ModelOption[], available: AvailableModel[], customized: boolean): ModelOption[] {
  if (!available.length) return current
  if (!customized) return available.map(optionFrom)
  return current.map((m) => {
    const real = available.find((a) => a.id === m.id)
    return real ? { ...m, resolved: real.resolved, efforts: real.efforts } : m
  })
}

/** Finds the entry for a model saved under an older ID (e.g. a full name the list now offers as an alias). */
export function remapModel(id: string | undefined, models: ModelOption[]): string | undefined {
  if (id === undefined || models.some((m) => m.id === id)) return id
  return models.find((m) => m.resolved && (m.resolved === id || id.startsWith(m.resolved)))?.id ?? id
}

export interface RunChoice {
  model: string
  effort: Effort
  permissionMode: PermissionMode
}

/**
 * Workspace choices win over the model's own settings, which win over the
 * global defaults. Plan mode always means "change nothing".
 */
export function resolveRun(
  settings: Pick<Settings, 'model' | 'effort' | 'permissionMode' | 'models'>,
  ws: Pick<Workspace, 'model' | 'effort' | 'planMode' | 'permission'>
): RunChoice {
  const model = ws.model ?? settings.model
  const option = settings.models.find((m) => m.id === model)
  const wanted = ws.effort || option?.effort || settings.effort
  return {
    model,
    // A model that has no such effort level gets none rather than an error.
    effort: option?.efforts && wanted && !option.efforts.includes(wanted) ? '' : wanted,
    permissionMode: ws.planMode ? 'plan' : ws.permission || option?.permission || settings.permissionMode
  }
}
