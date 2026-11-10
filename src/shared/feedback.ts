// Review feedback on a pull request, as returned by GitHub's GraphQL API.

export interface FeedbackItem {
  author: string
  body: string
  /** File and line for comments left on the diff. */
  path?: string
  line?: number
  createdAt: string
}

export interface PrFeedback {
  /** OPEN, CLOSED or MERGED. */
  state: string
  changesRequested: boolean
  items: FeedbackItem[]
}

export const FEEDBACK_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      state
      reviewDecision
      reviews(last: 50) { nodes { author { login } state body submittedAt } }
      comments(last: 50) { nodes { author { login } body createdAt } }
      reviewThreads(first: 100) {
        nodes { isResolved comments(first: 30) { nodes { author { login } body path line createdAt } } }
      }
    }
  }
}`

export function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url)
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null
}

/**
 * Keeps what still needs attention: unresolved diff comments, review summaries
 * and conversation comments from other people, newer than `since`.
 */
export function parsePrFeedback(data: any, opts: { self?: string; since?: number } = {}): PrFeedback {
  const pr = data?.data?.repository?.pullRequest
  if (!pr) return { state: 'UNKNOWN', changesRequested: false, items: [] }
  const since = opts.since ?? 0
  const keep = (author: string, body: string, at: string): boolean =>
    !!body?.trim() && author !== opts.self && !author.endsWith('[bot]') && Date.parse(at) > since

  const items: FeedbackItem[] = []
  for (const r of pr.reviews?.nodes ?? []) {
    const author = r.author?.login ?? 'unknown'
    if (keep(author, r.body, r.submittedAt)) items.push({ author, body: r.body.trim(), createdAt: r.submittedAt })
  }
  for (const c of pr.comments?.nodes ?? []) {
    const author = c.author?.login ?? 'unknown'
    if (keep(author, c.body, c.createdAt)) items.push({ author, body: c.body.trim(), createdAt: c.createdAt })
  }
  for (const thread of pr.reviewThreads?.nodes ?? []) {
    if (thread.isResolved) continue
    for (const c of thread.comments?.nodes ?? []) {
      const author = c.author?.login ?? 'unknown'
      if (keep(author, c.body, c.createdAt)) {
        items.push({ author, body: c.body.trim(), path: c.path, line: c.line ?? undefined, createdAt: c.createdAt })
      }
    }
  }
  const latestRequest = (pr.reviews?.nodes ?? [])
    .filter((r: any) => r.state === 'CHANGES_REQUESTED')
    .some((r: any) => Date.parse(r.submittedAt) > since)
  return {
    state: pr.state,
    changesRequested: pr.reviewDecision === 'CHANGES_REQUESTED' && latestRequest,
    items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
}
