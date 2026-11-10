import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { downloadUpdate, installedAppPath, macInstallScript } from '../src/main/updater'
import { compareVersions, parseRelease } from '../src/shared/update'

describe('versions', () => {
  it('orders versions the way people expect', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBeGreaterThan(0)
    expect(compareVersions('v0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0-beta.2', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.9')).toBeGreaterThan(0)
  })

  const release = {
    tag_name: 'v0.2.0',
    name: 'Takode 0.2.0',
    body: '- Faster\n',
    html_url: 'https://github.com/madara1150/multi-tasker/releases/tag/v0.2.0',
    published_at: '2026-11-10T00:00:00Z',
    assets: [
      { name: 'Takode-macOS.dmg', browser_download_url: 'https://x/mac.dmg', size: 10, digest: 'sha256:abc' },
      { name: 'Takode-Windows-Setup.exe', browser_download_url: 'https://x/win.exe', size: 20 }
    ]
  }

  it('offers a newer release with the file for this platform', () => {
    expect(parseRelease(release, '0.1.0', 'darwin')).toMatchObject({
      version: '0.2.0',
      current: '0.1.0',
      asset: { name: 'Takode-macOS.dmg', size: 10, sha256: 'abc' }
    })
    expect(parseRelease(release, '0.1.0', 'win32')?.asset).toMatchObject({ name: 'Takode-Windows-Setup.exe', sha256: undefined })
    expect(parseRelease(release, '0.1.0', 'linux')?.asset).toBeUndefined()
  })

  it('ignores releases that are not newer, drafts and pre-releases', () => {
    expect(parseRelease(release, '0.2.0', 'darwin')).toBeNull()
    expect(parseRelease({ ...release, prerelease: true }, '0.1.0', 'darwin')).toBeNull()
    expect(parseRelease({ ...release, draft: true }, '0.1.0', 'darwin')).toBeNull()
    expect(parseRelease(null, '0.1.0', 'darwin')).toBeNull()
  })
})

describe('download', () => {
  const payload = Buffer.alloc(300_000, 7)
  const sha = createHash('sha256').update(payload).digest('hex')
  let server: Server
  let base = ''

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Length': payload.length })
      res.end(payload)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(() => server.close())

  it('saves the file, reports progress and accepts a matching SHA-256', async () => {
    const seen: number[] = []
    const file = await downloadUpdate({ name: 'Takode-test.bin', url: `${base}/f`, size: payload.length, sha256: sha }, (p) =>
      seen.push(p)
    )
    expect(readFileSync(file).equals(payload)).toBe(true)
    expect(seen.at(-1)).toBe(1)
    rmSync(file)
  })

  it('throws away a file that does not match', async () => {
    const asset = { name: 'Takode-bad.bin', url: `${base}/f`, size: payload.length, sha256: '0'.repeat(64) }
    await expect(downloadUpdate(asset, () => undefined)).rejects.toThrow('UPDATE_BROKEN')
    await expect(downloadUpdate({ ...asset, sha256: undefined, size: 5 }, () => undefined)).rejects.toThrow('UPDATE_BROKEN')
  })
})

describe('install', () => {
  it('finds the app bundle it runs from', () => {
    expect(installedAppPath('/Applications/Takode.app/Contents/MacOS/Takode')).toBe('/Applications/Takode.app')
    expect(installedAppPath('/repo/node_modules/electron/dist/electron')).toBeNull()
  })

  it.runIf(process.platform === 'darwin')('swaps the app for the one in the disk image', () => {
    const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'takode-install-')))
    try {
      const fakeApp = (dir: string, version: string): void => {
        mkdirSync(path.join(dir, 'Takode.app', 'Contents'), { recursive: true })
        writeFileSync(path.join(dir, 'Takode.app', 'Contents', 'version.txt'), version)
      }
      fakeApp(path.join(tmp, 'Applications'), '0.1.0')
      fakeApp(path.join(tmp, 'image'), '0.2.0')
      const dmg = path.join(tmp, 'Takode-macOS.dmg')
      execFileSync('hdiutil', ['create', '-quiet', '-fs', 'HFS+', '-srcfolder', path.join(tmp, 'image'), '-volname', 'Takode', dmg])
      const script = path.join(tmp, 'install.sh')
      writeFileSync(script, macInstallScript)
      const target = path.join(tmp, 'Applications', 'Takode.app')
      const res = spawnSync('/bin/sh', [script], {
        env: { ...process.env, TAKODE_PID: '999999', TAKODE_DMG: dmg, TAKODE_TARGET: target, TAKODE_NO_RELAUNCH: '1' },
        timeout: 60_000
      })
      expect(res.status).toBe(0)
      expect(readFileSync(path.join(target, 'Contents', 'version.txt'), 'utf8')).toBe('0.2.0')
      expect(existsSync(`${target}.old`)).toBe(false)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 90_000)
})
