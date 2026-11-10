// Performance presets: how much memory and CPU Takode may spend on looks and background work.
import type { Settings } from './types'

export type PerfKey = 'liteEffects' | 'motion' | 'pauseUnfocused' | 'chatLimit' | 'terminalIdleMinutes' | 'branchCheckMinutes' | 'spellcheck'
export type PerfSettings = Pick<Settings, PerfKey>
export type PerfPreset = 'saver' | 'balanced' | 'full'

export const PERF_PRESETS: Record<PerfPreset, PerfSettings> = {
  saver: {
    liteEffects: true,
    motion: false,
    pauseUnfocused: true,
    chatLimit: 80,
    terminalIdleMinutes: 15,
    branchCheckMinutes: 10,
    spellcheck: false
  },
  balanced: {
    liteEffects: false,
    motion: true,
    pauseUnfocused: true,
    chatLimit: 300,
    terminalIdleMinutes: 60,
    branchCheckMinutes: 2,
    spellcheck: true
  },
  full: {
    liteEffects: false,
    motion: true,
    pauseUnfocused: false,
    chatLimit: 0,
    terminalIdleMinutes: 0,
    branchCheckMinutes: 2,
    spellcheck: true
  }
}

/** Which preset the current settings match, or "custom" after the user changed one value. */
export function matchPreset(s: PerfSettings): PerfPreset | 'custom' {
  for (const [id, preset] of Object.entries(PERF_PRESETS) as [PerfPreset, PerfSettings][]) {
    if ((Object.keys(preset) as PerfKey[]).every((k) => s[k] === preset[k])) return id
  }
  return 'custom'
}

/** The last `limit` rows (0 = all) and how many were left out. */
export function lastRows<T>(rows: T[], limit: number): { shown: T[]; hidden: number } {
  if (!limit || rows.length <= limit) return { shown: rows, hidden: 0 }
  return { shown: rows.slice(rows.length - limit), hidden: rows.length - limit }
}

export interface PerfStats {
  /** Memory of every Takode process (main, window, GPU, helpers), in MB. */
  memoryMB: number
  cpu: number
  processes: { type: string; memoryMB: number; cpu: number }[]
  terminals: number
  claudeRuns: number
  cachedChats: number
  hardwareAccel: boolean
}
