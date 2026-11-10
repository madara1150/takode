// Claude skills kept by Takode, outside any repository. They are packed as one
// local Claude Code plugin and loaded with --plugin-dir for every Takode run,
// so they work in every workspace without being committed anywhere.
// No Electron imports so it can be unit-tested.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface SkillInfo {
  /** Folder name; also how Claude calls it (takode:<slug>). */
  slug: string
  name: string
  description: string
  enabled: boolean
  /** Files besides SKILL.md (scripts, templates…). */
  extraFiles: number
}

const ON = 'skills'
const OFF = 'skills-off'

export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'skill'
}

/** Reads the name and description from SKILL.md front matter. */
export function parseSkill(text: string): { name: string; description: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return { name: '', description: '', body: text }
  const field = (key: string): string => {
    const line = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(m[1])?.[1]?.trim() ?? ''
    return line.replace(/^(['"])(.*)\1$/, '$2')
  }
  return { name: field('name'), description: field('description'), body: m[2] }
}

const yamlText = (s: string): string => JSON.stringify(s.replace(/\s+/g, ' ').trim())

export function skillFile(slug: string, description: string, body: string): string {
  return `---\nname: ${slug}\ndescription: ${yamlText(description)}\n---\n\n${body.trim()}\n`
}

function countFiles(dir: string): number {
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1
  }
  return n
}

export class SkillStore {
  constructor(private root: string) {}

  private dir(enabled: boolean, slug = ''): string {
    return path.join(this.root, enabled ? ON : OFF, slug)
  }

  private where(slug: string): string | null {
    if (!/^[a-z0-9-]+$/.test(slug)) return null
    if (existsSync(this.dir(true, slug))) return this.dir(true, slug)
    if (existsSync(this.dir(false, slug))) return this.dir(false, slug)
    return null
  }

  list(): SkillInfo[] {
    const out: SkillInfo[] = []
    for (const enabled of [true, false]) {
      const base = this.dir(enabled)
      if (!existsSync(base)) continue
      for (const slug of readdirSync(base)) {
        const file = path.join(base, slug, 'SKILL.md')
        if (!existsSync(file)) continue
        const meta = parseSkill(readFileSync(file, 'utf8'))
        out.push({ slug, name: meta.name || slug, description: meta.description, enabled, extraFiles: countFiles(path.join(base, slug)) - 1 })
      }
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug))
  }

  get(slug: string): { description: string; body: string } {
    const dir = this.where(slug)
    if (!dir) throw new Error('SKILL_MISSING')
    const meta = parseSkill(readFileSync(path.join(dir, 'SKILL.md'), 'utf8'))
    return { description: meta.description, body: meta.body.trim() }
  }

  private freeSlug(name: string): string {
    const base = slugify(name)
    let slug = base
    for (let i = 2; this.where(slug); i++) slug = `${base}-${i}`
    return slug
  }

  /** Creates a skill (no slug) or updates one. Returns its slug. */
  save(input: { slug?: string; name: string; description: string; body: string }): string {
    if (!input.description.trim()) throw new Error('SKILL_NEEDS_DESCRIPTION')
    if (!input.body.trim()) throw new Error('SKILL_NEEDS_BODY')
    const slug = input.slug && this.where(input.slug) ? input.slug : this.freeSlug(input.name)
    const dir = this.where(slug) ?? this.dir(true, slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'SKILL.md'), skillFile(slug, input.description, input.body))
    this.writeManifest()
    return slug
  }

  /** Adds a skill folder (with SKILL.md) or a single .md file. */
  import(source: string): string {
    const isDir = statSync(source).isDirectory()
    const skillMd = isDir ? path.join(source, 'SKILL.md') : source
    if (!existsSync(skillMd)) throw new Error('SKILL_NO_FILE')
    const meta = parseSkill(readFileSync(skillMd, 'utf8'))
    const name = meta.name || path.basename(isDir ? source : path.dirname(source)) || path.parse(source).name
    if (!isDir) return this.save({ name, description: meta.description || name, body: meta.body })
    const slug = this.freeSlug(name)
    const dest = this.dir(true, slug)
    cpSync(source, dest, { recursive: true, filter: (p) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(p) })
    // Claude finds the skill by folder; keep the name in SKILL.md in step with it.
    writeFileSync(path.join(dest, 'SKILL.md'), skillFile(slug, meta.description || name, meta.body))
    this.writeManifest()
    return slug
  }

  setEnabled(slug: string, enabled: boolean): void {
    const from = this.where(slug)
    if (!from) throw new Error('SKILL_MISSING')
    const to = this.dir(enabled, slug)
    if (from === to) return
    mkdirSync(path.dirname(to), { recursive: true })
    renameSync(from, to)
  }

  remove(slug: string): void {
    const dir = this.where(slug)
    if (dir) rmSync(dir, { recursive: true, force: true })
  }

  private writeManifest(): void {
    const file = path.join(this.root, '.claude-plugin', 'plugin.json')
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ name: 'takode', description: 'Skills added in Takode settings', version: '1.0.0' }, null, 2))
  }

  /** The plugin folder to pass to Claude, or null when no skill is turned on. */
  pluginDir(): string | null {
    if (!this.list().some((s) => s.enabled)) return null
    this.writeManifest()
    return this.root
  }

  get folder(): string {
    return this.root
  }
}
