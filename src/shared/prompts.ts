// Prompts behind the agent buttons. Each repository can add its own
// instructions to any of them in Settings → Repositories → Actions.
import type { FeedbackItem } from './feedback'
import type { ActionsConfig } from './types'

export type AgentAction = 'review' | 'fixErrors' | 'resolveConflicts'

const BASE: Record<AgentAction, (base: string) => string> = {
  review: (base) =>
    `Review the changes in this workspace compared with the base branch \`${base}\`, both committed and uncommitted. ` +
    'Report bugs, risky changes and missing tests, most important first. Do not modify any files.',
  fixErrors: () =>
    "Find and fix the errors in this workspace. Run the project's checks (type check, lint, tests) where you can, " +
    'read the failures and fix their causes. Then say what you fixed and what still fails.',
  resolveConflicts: (base) =>
    `Bring this branch up to date with \`${base}\` and resolve any merge conflicts, keeping the intent of both sides. ` +
    'Then say how you resolved each conflict.'
}

const withExtra = (prompt: string, extra: string): string =>
  extra.trim() ? `${prompt}\n\nAdditional instructions:\n${extra.trim()}` : prompt

export function agentPrompt(action: AgentAction, base: string, config: ActionsConfig): string {
  return withExtra(BASE[action](base), config[action])
}

export function prDraftPrompt(base: string, stat: string, diff: string, config: ActionsConfig): string {
  return withExtra(
    `Write a pull request title and description for the changes below (branch compared with \`${base}\`). ` +
      'Reply with the title on the first line, then a blank line, then the description in Markdown. ' +
      'No preamble and no code fence around the whole reply.',
    config.createPr
  ) + `\n\nChanged files:\n${stat}\n\nDiff:\n${diff}`
}

export function branchNamePrompt(task: string, config: ActionsConfig): string {
  return withExtra(
    'Suggest a short git branch slug for the task below: 2 to 5 lowercase English words joined by hyphens, ' +
      'at most 40 characters. Reply with the slug only.',
    config.branchRename
  ) + `\n\nTask:\n${task.slice(0, 2000)}`
}

/** Splits a "title, blank line, body" reply into its two parts. */
export function parsePrDraft(reply: string): { title: string; body: string } {
  const lines = reply.trim().split('\n')
  const title = (lines.shift() ?? '').replace(/^#+\s*/, '').replace(/^(title:)\s*/i, '').trim()
  return { title, body: lines.join('\n').trim() }
}

export function feedbackPrompt(items: FeedbackItem[], changesRequested: boolean, config: ActionsConfig): string {
  const list = items
    .map((item, i) => {
      const where = item.path ? ` on ${item.path}${item.line ? `:${item.line}` : ''}` : ''
      return `${i + 1}. @${item.author}${where}:\n${item.body}`
    })
    .join('\n\n')
  return withExtra(
    `Address the review feedback on this branch's pull request${changesRequested ? ' (changes were requested)' : ''}. ` +
      'Make the change each comment asks for. If a comment is unclear or you disagree, leave the code alone and say why. ' +
      'Do not push. Finish with one line per comment saying what you did.',
    config.addressFeedback
  ) + `\n\nFeedback:\n\n${list}`
}

/** Sent when the user accepts a plan made in plan mode. */
export const RUN_PLAN_PROMPT = 'Go ahead and implement the plan.'
