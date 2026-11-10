// "Hide that AI was used": no Claude co-author line or "Generated with Claude Code"
// in commits and pull requests made from Takode.

/** Claude Code settings that turn off its own attribution (older and newer setting names). */
export const NO_ATTRIBUTION_SETTINGS = { includeCoAuthoredBy: false, attribution: { commit: '', pr: '' } }

export const NO_ATTRIBUTION_PROMPT =
  'When you write commit messages, pull request titles or descriptions, code comments or changelogs, never mention Claude, Anthropic, AI or that the work was generated, and never add Co-Authored-By trailers or "Generated with" lines.'

const LINES = [
  /^\s*co-authored-by:.*(claude|anthropic)/i,
  /generated with \[?claude/i,
  /^\s*🤖/u,
  /^\s*\(?written (with|by) (claude|ai)\)?\.?\s*$/i
]

/** Removes AI attribution lines from a commit message or PR text, and trailing blank lines left behind. */
export function stripAiAttribution(text: string): string {
  const kept = text.split('\n').filter((line) => !LINES.some((re) => re.test(line)))
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}
