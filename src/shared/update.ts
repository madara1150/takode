// Finding a newer Takode on GitHub Releases. No Electron imports, so it can be unit-tested.

export const RELEASES_REPO = 'madara1150/takode'

/** File each platform installs from; the build scripts give them these exact names. */
export const ASSET_FOR: Record<string, string> = {
  darwin: 'Takode-macOS.dmg',
  win32: 'Takode-Windows-Setup.exe'
}

export interface UpdateAsset {
  name: string
  url: string
  size: number
  /** Hex SHA-256 from GitHub, when it published one. */
  sha256?: string
}

export interface UpdateInfo {
  current: string
  version: string
  name: string
  notes: string
  publishedAt: string
  pageUrl: string
  /** Undefined when the release has no file for this platform. */
  asset?: UpdateAsset
}

/** Turns "v1.2.3", "1.2.3-beta.1" into comparable parts. */
function parse(version: string): { nums: number[]; pre: string } {
  const [core, pre = ''] = version.trim().replace(/^v/i, '').split('-', 2)
  return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre }
}

/** Positive when `a` is newer than `b`. A pre-release is older than the same version without one. */
export function compareVersions(a: string, b: string): number {
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d) return d
  }
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return x.pre.localeCompare(y.pre, undefined, { numeric: true })
}

/** Reads GitHub's "latest release" reply; null when it is not newer than `current`. */
export function parseRelease(release: any, current: string, platform: string): UpdateInfo | null {
  if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') return null
  const version = release.tag_name.replace(/^v/i, '')
  if (compareVersions(version, current) <= 0) return null
  const wanted = ASSET_FOR[platform]
  const raw = (release.assets ?? []).find((a: any) => a?.name === wanted)
  const digest = typeof raw?.digest === 'string' && raw.digest.startsWith('sha256:') ? raw.digest.slice(7) : undefined
  return {
    current,
    version,
    name: String(release.name || `Takode ${version}`),
    notes: String(release.body ?? '').trim(),
    publishedAt: String(release.published_at ?? ''),
    pageUrl: String(release.html_url ?? `https://github.com/${RELEASES_REPO}/releases`),
    asset: raw
      ? { name: raw.name, url: raw.browser_download_url, size: Number(raw.size) || 0, sha256: digest }
      : undefined
  }
}
