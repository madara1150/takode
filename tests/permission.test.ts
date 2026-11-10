import { describe, expect, it } from 'vitest'
import { describeTool, isAllowed, remember, ruleFrom, type Allowed } from '../src/shared/permission'
import { resolveRun } from '../src/shared/models'
import { DEFAULT_SETTINGS } from '../src/shared/types'

describe('asking before tools', () => {
  it('shows the command or file the tool would touch', () => {
    expect(describeTool('Bash', { command: 'npm test', description: 'x' })).toBe('npm test')
    expect(describeTool('Edit', { file_path: '/a/b.ts', old_string: 'x' })).toBe('/a/b.ts')
  })
  it('reads the command prefix from Claude Code suggestions', () => {
    expect(ruleFrom([{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test:*' }] }])).toBe('npm test')
    expect(ruleFrom([{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'echo hi *' }] }])).toBe('echo hi')
    expect(ruleFrom(undefined)).toBeUndefined()
  })
  it('"always allow" covers the same command and the same tool, nothing else', () => {
    const a: Allowed = { tools: new Set(), commands: [] }
    remember(a, { tool: 'Bash', detail: 'npm test -- --watch', rule: 'npm test' })
    remember(a, { tool: 'Edit', detail: '/x.ts' })
    expect(isAllowed(a, 'Bash', 'npm test')).toBe(true)
    expect(isAllowed(a, 'Bash', 'npm test --coverage')).toBe(true)
    expect(isAllowed(a, 'Bash', 'npm testing')).toBe(false)
    expect(isAllowed(a, 'Bash', 'rm -rf /')).toBe(false)
    expect(isAllowed(a, 'Edit', '/y.ts')).toBe(true)
    expect(isAllowed(a, 'Write', '/y.ts')).toBe(false)
  })
  it('a workspace can choose its own mode; plan mode still wins', () => {
    const s = { ...DEFAULT_SETTINGS, models: [] }
    expect(resolveRun(s, { permission: 'default' }).permissionMode).toBe('default')
    expect(resolveRun(s, { permission: 'bypassPermissions', planMode: true }).permissionMode).toBe('plan')
    expect(resolveRun(s, {}).permissionMode).toBe('acceptEdits')
  })
})
