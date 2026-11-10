// Templates used for branch names, commit messages and pull requests.
// Tokens look like {name}; unknown tokens are left as they are.

export const TOKENS = ['name', 'repo', 'branch', 'base', 'date', 'user'] as const
export type TemplateVars = Partial<Record<(typeof TOKENS)[number], string>>

export function fillTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key]
    return value === undefined ? whole : value
  })
}

/** Makes a filled template safe to use as a git branch name. */
export function toBranchName(text: string): string {
  return text
    .trim()
    .replace(/[^A-Za-z0-9._/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-/.]+|[-/.]+$/g, '')
}

export const today = (): string => new Date().toISOString().slice(0, 10)

export const splitList = (text: string): string[] =>
  text.split(',').map((s) => s.trim()).filter(Boolean)
