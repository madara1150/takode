// Asking the user before Claude uses a tool ("ask every time" mode).

export interface PermissionRequest {
  id: string
  wsId: string
  tabId: string
  tool: string
  /** What the tool would do: a command, a file path… */
  detail: string
  description?: string
  /** For Bash: the command prefix "always allow" would cover. */
  rule?: string
  at: number
}

export type PermissionAnswer = 'allow' | 'always' | 'deny'

/** The short text a person needs to judge the request. */
export function describeTool(tool: string, input: any): string {
  if (!input || typeof input !== 'object') return ''
  if (typeof input.command === 'string') return input.command
  if (typeof input.file_path === 'string') return input.file_path
  if (typeof input.notebook_path === 'string') return input.notebook_path
  if (typeof input.url === 'string') return input.url
  if (typeof input.pattern === 'string') return input.pattern
  try {
    return JSON.stringify(input).slice(0, 300)
  } catch {
    return tool
  }
}

/** "npm test *" or "npm test:*" from Claude Code's suggestion → "npm test". */
export function ruleFrom(suggestions: unknown): string | undefined {
  if (!Array.isArray(suggestions)) return undefined
  for (const s of suggestions) {
    for (const r of Array.isArray(s?.rules) ? s.rules : []) {
      if (r?.toolName === 'Bash' && typeof r.ruleContent === 'string') return r.ruleContent.replace(/(:\*|\s\*)$/, '').trim() || undefined
    }
  }
  return undefined
}

/** What one chat was told to always allow. */
export interface Allowed {
  tools: Set<string>
  commands: string[]
}

export function isAllowed(a: Allowed | undefined, tool: string, detail: string): boolean {
  if (!a) return false
  if (tool === 'Bash') return a.commands.some((p) => detail === p || detail.startsWith(`${p} `))
  return a.tools.has(tool)
}

export function remember(a: Allowed, req: Pick<PermissionRequest, 'tool' | 'detail' | 'rule'>): void {
  if (req.tool === 'Bash') a.commands.push(req.rule || req.detail)
  else a.tools.add(req.tool)
}
