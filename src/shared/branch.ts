// Where a workspace's branch stands: only local, pushed, in a pull request, or merged.

export type BranchState = 'local' | 'pushed' | 'draft' | 'open' | 'merged' | 'closed'

export interface BranchInfo {
  state: BranchState
  /** Commits on this computer that are not on the remote yet. */
  ahead: number
  /** New commits on the base branch (e.g. main) not in this branch yet. */
  behind?: number
  /** Commits others pushed to this branch that are not here yet. */
  behindRemote?: number
  prNumber?: number
  prUrl?: string
  checkedAt: number
}

/** One pull request as `gh pr list --json number,state,url,isDraft` returns it. */
export interface PrSummary {
  number: number
  state: string
  url: string
  isDraft?: boolean
}

/** A pull request decides the state; without one it depends on whether the branch is on the remote. */
export function branchState(onRemote: boolean, pr: PrSummary | null): BranchState {
  if (pr?.state === 'MERGED') return 'merged'
  if (pr?.state === 'OPEN') return pr.isDraft ? 'draft' : 'open'
  if (pr?.state === 'CLOSED') return 'closed'
  return onRemote ? 'pushed' : 'local'
}

/** With several pull requests for one branch, an open one wins, then a merged one. */
export function pickPr(list: PrSummary[]): PrSummary | null {
  return list.find((p) => p.state === 'OPEN') ?? list.find((p) => p.state === 'MERGED') ?? list[0] ?? null
}

/** Sidebar groups when chats are grouped by where their branch stands, in display order. */
export const STATUS_GROUPS = ['local', 'pushed', 'pr', 'merged', 'closed'] as const
export type StatusGroup = (typeof STATUS_GROUPS)[number]

/** Draft and open pull requests share one group; not checked yet counts as local. */
export function statusGroup(info?: { state: BranchState }): StatusGroup {
  const state = info?.state ?? 'local'
  return state === 'draft' || state === 'open' ? 'pr' : state
}

/** Workspaces split into status groups, keeping their order, leaving out empty groups. */
export function groupByStatus<T extends { git?: { state: BranchState } }>(list: T[]): { group: StatusGroup; items: T[] }[] {
  return STATUS_GROUPS.map((group) => ({ group, items: list.filter((w) => statusGroup(w.git) === group) })).filter((g) => g.items.length)
}
