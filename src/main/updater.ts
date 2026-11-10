// Downloads a new Takode from GitHub Releases and installs it over this one.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, createWriteStream, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parseRelease, RELEASES_REPO, type UpdateAsset, type UpdateInfo } from '../shared/update'

const API = process.env.TAKODE_UPDATE_URL || `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`

/** Asks GitHub for the latest release; null when there is nothing newer (or no release yet). */
export async function checkForUpdate(current: string): Promise<UpdateInfo | null> {
  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Takode' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return parseRelease(await res.json(), current, process.platform)
}

/** Downloads the installer, reporting progress (0 to 1), and checks it against GitHub's SHA-256. */
export async function downloadUpdate(asset: UpdateAsset, onProgress: (share: number) => void): Promise<string> {
  const dir = path.join(os.tmpdir(), 'takode-update')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, asset.name)
  rmSync(file, { force: true })

  const res = await fetch(asset.url, { headers: { 'User-Agent': 'Takode' } })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || asset.size
  const hash = createHash('sha256')
  let received = 0
  let lastSent = 0
  const body = Readable.fromWeb(res.body as never)
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk)
    received += chunk.length
    const now = Date.now()
    if (total && now - lastSent > 100) {
      lastSent = now
      onProgress(Math.min(1, received / total))
    }
  })
  await pipeline(body, createWriteStream(file))
  onProgress(1)

  if (asset.size && received !== asset.size) {
    rmSync(file, { force: true })
    throw new Error('UPDATE_BROKEN')
  }
  if (asset.sha256 && hash.digest('hex') !== asset.sha256.toLowerCase()) {
    rmSync(file, { force: true })
    throw new Error('UPDATE_BROKEN')
  }
  return file
}

/** The .app bundle this copy of Takode runs from (macOS), or null in development. */
export function installedAppPath(execPath = process.execPath): string | null {
  const bundle = path.resolve(execPath, '../../..')
  return bundle.endsWith('.app') ? bundle : null
}

// Waits for Takode to quit, swaps the app bundle for the one in the disk image
// (putting the old one back if the copy fails), then opens the new version.
const MAC_SCRIPT = `#!/bin/sh
while kill -0 "$TAKODE_PID" 2>/dev/null; do sleep 0.3; done
MNT=$(mktemp -d)
hdiutil attach -nobrowse -noautoopen -quiet -mountpoint "$MNT" "$TAKODE_DMG" || { open "$TAKODE_TARGET"; exit 1; }
SRC=$(ls -d "$MNT"/*.app 2>/dev/null | head -n 1)
if [ -n "$SRC" ]; then
  rm -rf "$TAKODE_TARGET.old"
  if mv "$TAKODE_TARGET" "$TAKODE_TARGET.old"; then
    if ditto "$SRC" "$TAKODE_TARGET"; then
      rm -rf "$TAKODE_TARGET.old"
    else
      rm -rf "$TAKODE_TARGET"
      mv "$TAKODE_TARGET.old" "$TAKODE_TARGET"
    fi
  fi
fi
hdiutil detach "$MNT" -quiet
rmdir "$MNT" 2>/dev/null
xattr -dr com.apple.quarantine "$TAKODE_TARGET" 2>/dev/null
[ -z "$TAKODE_NO_RELAUNCH" ] && open "$TAKODE_TARGET"
exit 0
`

/**
 * Starts the installer and returns; the caller must quit Takode right after,
 * because the installer waits for this process to exit.
 */
export function startInstall(file: string, target = installedAppPath()): void {
  if (process.platform === 'darwin') {
    if (!target) throw new Error('UPDATE_DEV')
    accessSync(path.dirname(target), constants.W_OK) // the app's folder must be writable to swap it
    const script = path.join(path.dirname(file), 'install.sh')
    writeFileSync(script, MAC_SCRIPT, { mode: 0o755 })
    spawn('/bin/sh', [script], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, TAKODE_PID: String(process.pid), TAKODE_DMG: file, TAKODE_TARGET: target }
    }).unref()
    return
  }
  if (process.platform === 'win32') {
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  throw new Error('UPDATE_UNSUPPORTED')
}

/** The macOS install script, for tests. */
export const macInstallScript = MAC_SCRIPT
