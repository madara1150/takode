import { describe, expect, it } from 'vitest'
import { lastRows, matchPreset, PERF_PRESETS } from '../src/shared/perf'
import { DEFAULT_SETTINGS } from '../src/shared/types'

describe('performance presets', () => {
  it('new installs start on Balanced', () => {
    expect(matchPreset(DEFAULT_SETTINGS)).toBe('balanced')
  })
  it('recognises each preset and anything else as custom', () => {
    for (const id of ['saver', 'balanced', 'full'] as const) expect(matchPreset({ ...DEFAULT_SETTINGS, ...PERF_PRESETS[id] })).toBe(id)
    expect(matchPreset({ ...DEFAULT_SETTINGS, chatLimit: 150 })).toBe('custom')
  })
  it('the saver preset is lighter than balanced in every way', () => {
    const { saver, balanced } = PERF_PRESETS
    expect(saver.liteEffects).toBe(true)
    expect(saver.chatLimit).toBeLessThan(balanced.chatLimit)
    expect(saver.terminalIdleMinutes).toBeLessThan(balanced.terminalIdleMinutes)
    expect(saver.branchCheckMinutes).toBeGreaterThan(balanced.branchCheckMinutes)
  })
})

describe('lastRows', () => {
  const rows = Array.from({ length: 10 }, (_, i) => i)
  it('keeps the newest rows and counts the rest', () => {
    expect(lastRows(rows, 3)).toEqual({ shown: [7, 8, 9], hidden: 7 })
  })
  it('0 or a big limit shows everything', () => {
    expect(lastRows(rows, 0).hidden).toBe(0)
    expect(lastRows(rows, 50).shown).toHaveLength(10)
  })
})

describe('chat memory', () => {
  it('keeps only the most recently used chats in memory and reloads the rest from disk', async () => {
    const { mkdtempSync } = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const { Store } = await import('../src/main/store')
    const store = new Store(mkdtempSync(path.join(os.tmpdir(), 'takode-')), '/tmp/home')
    store.maxCachedChats = 3
    for (const id of ['a', 'b', 'c', 'd']) store.addChat(id, { id: `${id}1`, role: 'user', text: id, ts: 0 } as never)
    expect(store.cachedChats).toBe(3)
    expect(store.chat('a')).toHaveLength(1) // read back from disk
    store.trimChats(1)
    expect(store.cachedChats).toBe(1)
  })
})
