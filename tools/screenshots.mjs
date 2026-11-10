// Takes the README screenshots from the real app: creates a small demo
// repository, starts Takode in screenshot mode (see src/main/shots.ts) and lets
// Claude Code make a real change in two workspaces.
// Run with: npm run screenshots   (needs Claude Code installed and signed in)
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = mkdtempSync(path.join(os.tmpdir(), 'takode-shots-'))
const demo = path.join(tmp, 'coffee-shop')
mkdirSync(demo, { recursive: true })

writeFileSync(
  path.join(demo, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Coffee Shop</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <div id="root"></div>
    <main>
      <p>Fresh beans, roasted every morning.</p>
    </main>
    <script type="module" src="src/main.tsx"></script>
  </body>
</html>
`
)
writeFileSync(
  path.join(demo, 'style.css'),
  `body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #faf7f2;
  color: #2b2620;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
}
main {
  padding: 24px;
}
`
)
mkdirSync(path.join(demo, 'src'))
writeFileSync(
  path.join(demo, 'src', 'Header.tsx'),
  `export function Header({ title }: { title: string }) {
  return (
    <header>
      <h1>{title}</h1>
    </header>
  )
}
`
)
writeFileSync(
  path.join(demo, 'src', 'main.tsx'),
  `import { createRoot } from 'react-dom/client'
import { Header } from './Header'

createRoot(document.getElementById('root')!).render(<Header title="Coffee Shop" />)
`
)
writeFileSync(path.join(demo, 'package.json'), JSON.stringify({ name: 'coffee-shop', private: true }, null, 2) + '\n')

const git = (...args) => execFileSync('git', args, { cwd: demo, stdio: 'ignore' })
git('init', '-q', '-b', 'main')
git('-c', 'user.name=Demo', '-c', 'user.email=demo@localhost', 'add', '-A')
git('-c', 'user.name=Demo', '-c', 'user.email=demo@localhost', 'commit', '-q', '-m', 'Initial commit')
// A local stand-in for GitHub, so pushing from the app really works.
execFileSync('git', ['init', '-q', '--bare', path.join(tmp, 'origin.git')])
git('remote', 'add', 'origin', path.join(tmp, 'origin.git'))
git('config', 'user.name', 'Demo')
git('config', 'user.email', 'demo@localhost')
git('push', '-q', '-u', 'origin', 'main')

const electron = createRequire(import.meta.url)('electron')
const res = spawnSync(electron, [root], {
  stdio: 'inherit',
  env: {
    ...process.env,
    TAKODE_SHOTS: process.env.TAKODE_SHOTS_DIR || path.join(root, 'docs', 'screenshots'),
    TAKODE_USER_DATA: path.join(tmp, 'user-data'),
    TAKODE_HOME: path.join(tmp, 'home'),
    TAKODE_DEMO_REPO: demo
  }
})
rmSync(tmp, { recursive: true, force: true })
process.exit(res.status ?? 1)
