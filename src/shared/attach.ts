// Files attached to a chat message, and @file mentions in what you type.

export interface Attachment {
  /** File name as the user knows it. */
  name: string
  /** Absolute path of Takode's copy, which Claude reads. */
  path: string
  size: number
}

/** Largest file that can be attached. */
export const MAX_ATTACH_BYTES = 25 * 1024 * 1024
export const MAX_ATTACHMENTS = 10

const MENTION = /(^|[\s([{"'`])@((?:[\w.\-]+\/)*[\w.\-]+)/g

/** Project paths mentioned as @path in a message, in order, without repeats. */
export function mentionsIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(MENTION)) {
    const p = m[2].replace(/[.,;:!?)]+$/, '')
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

/** Splits text into plain parts and @mentions (only those in `known`, when given) for display. */
export function splitMentions(text: string, known?: (p: string) => boolean): { text: string; mention?: boolean }[] {
  const parts: { text: string; mention?: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(MENTION)) {
    const p = m[2].replace(/[.,;:!?)]+$/, '')
    if (known && !known(p)) continue
    const start = m.index! + m[1].length
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: `@${p}`, mention: true })
    last = start + 1 + p.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/**
 * The @mention being typed right before the caret, if any:
 * where the "@" is and what has been typed after it.
 */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|[\s([{"'`])@([^\s@]*)$/.exec(text.slice(0, caret))
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2] }
}

/** Replaces the mention being typed with `@path ` and returns the new text and caret position. */
export function insertMention(text: string, caret: number, path: string): { text: string; caret: number } {
  const active = activeMention(text, caret)
  const start = active ? active.start : caret
  const insert = `@${path} `
  const rest = text.slice(caret).replace(/^\S*/, '').replace(/^ /, '')
  return { text: text.slice(0, start) + insert + rest, caret: start + insert.length }
}

/** Project files that best match what was typed after "@" (file name first, then path, then loose). */
export function rankFiles(files: string[], query: string, limit = 8): string[] {
  const q = query.toLowerCase()
  if (!q) return files.slice(0, limit)
  const scored: [number, string][] = []
  for (const f of files) {
    const lower = f.toLowerCase()
    const base = lower.slice(lower.lastIndexOf('/') + 1)
    let score: number
    if (base === q) score = 0
    else if (base.startsWith(q)) score = 1
    else if (lower.startsWith(q)) score = 2
    else if (base.includes(q)) score = 3
    else if (lower.includes(q)) score = 4
    else if (subsequence(lower, q)) score = 6
    else continue
    scored.push([score * 1000 + f.length, f])
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, f]) => f)
}

function subsequence(s: string, q: string): boolean {
  let i = 0
  for (const c of s) if (c === q[i] && ++i === q.length) return true
  return false
}

/** What Claude receives: your message plus where the attached and mentioned files are. */
export function buildPrompt(text: string, attachments: Attachment[], mentioned: string[]): string {
  const notes: string[] = []
  if (attachments.length) {
    notes.push('Attached files (read them with the Read tool):', ...attachments.map((a) => `- ${a.path}  (${a.name})`))
  }
  if (mentioned.length) {
    if (notes.length) notes.push('')
    notes.push('Files referenced with @ (paths relative to the project root):', ...mentioned.map((p) => `- ${p}`))
  }
  return notes.length ? `${text}\n\n${notes.join('\n')}` : text
}

/** A file name safe to store on disk. */
export function safeName(name: string): string {
  const clean = name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(-120)
  return clean || 'file'
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
