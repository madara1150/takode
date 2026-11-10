// Screenshot mode (TAKODE_SHOTS=<dir>): drives the real app against a demo
// repository and saves PNGs for the README. Started by tools/screenshots.mjs.
import { app, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AppState, Language, Workspace } from '../shared/types'

type Actions = Record<string, (...args: any[]) => unknown>
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const PROMPTS: Record<Language, string> = {
  th: 'เพิ่มปุ่มสลับโหมดมืด/สว่างใน src/Header.tsx จัดสไตล์ใน style.css และจำค่าที่เลือกไว้ใน localStorage ตอบสั้นๆ เป็นภาษาไทย',
  en: 'Add a dark/light mode toggle button to src/Header.tsx, style it in style.css and remember the choice in localStorage. Keep your reply short.'
}

export async function runShots(win: BrowserWindow, actions: Actions, getState: () => AppState): Promise<void> {
  const dir = process.env.TAKODE_SHOTS!
  mkdirSync(dir, { recursive: true })
  const js = (code: string): Promise<unknown> => win.webContents.executeJavaScript(code)
  const shot = async (name: string): Promise<void> => {
    await sleep(700)
    // Wait for a fresh frame, otherwise capturePage can return the previous one.
    await js('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))')
    await sleep(200)
    writeFileSync(path.join(dir, `${name}.png`), (await win.webContents.capturePage()).toPNG())
    console.log(`saved ${name}.png`)
  }

  try {
    await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
    win.setContentSize(1440, 900)
    await sleep(1200)

    // Haiku keeps the Claude usage of a screenshot run small.
    await actions['settings:update']({ language: 'th', theme: 'midnight', permissionMode: 'acceptEdits', model: 'haiku', pauseUnfocused: false })
    // (The screenshot window stays in the background, so animations must not pause there.)
    await js('window.__takode.select(null)')
    // The login screen, in both languages, then carry on without an account.
    await actions['auth:logout']()
    await sleep(500)
    await shot('login-th')
    await actions['settings:update']({ language: 'en' })
    await shot('login-en')
    await actions['settings:update']({ language: 'th' })
    // A demo account (nothing is sent anywhere), so levels and rewards show as they do for a signed-in user.
    const state = getState()
    state.auth = { mode: 'account', server: 'https://api.example.com', account: { id: 'demo', name: 'Demo', email: 'you@example.com' } }
    state.stats.xp = 600_000_000
    await actions['settings:update']({})
    await shot('welcome-th')
    await actions['settings:update']({ language: 'en' })
    await shot('welcome-en')

    const repo = (await actions['repo:add'](process.env.TAKODE_DEMO_REPO)) as { id: string }
    const spaces: Record<Language, Workspace> = {
      th: (await actions['ws:create'](repo.id, { name: 'allegro' })) as Workspace,
      en: (await actions['ws:create'](repo.id, { name: 'adagio' })) as Workspace
    }
    await actions['repo:update'](repo.id, {
      actions: {
        custom: [
          { id: 'status', name: 'Status', command: 'git status --short' },
          { id: 'dev', name: 'Dev server', command: 'npm run dev' }
        ],
        autoRename: true,
        review: 'Focus on accessibility and security.',
        createPr: 'Write the title in the imperative mood and add a "How to test" section.'
      }
    })
    // Two real Claude Code runs, in parallel, one per workspace.
    // A second chat tab in each workspace, so the tab bar has something to show.
    const second: Record<Language, string> = {
      th: (await actions['tabs:add'](spaces.th.id)) as string,
      en: (await actions['tabs:add'](spaces.en.id)) as string
    }
    for (const lang of ['th', 'en'] as Language[]) await actions['tabs:select'](spaces[lang].id, getState().workspaces.find((w) => w.id === spaces[lang].id)!.tabs[0].id)
    if (process.env.TAKODE_SHOTS_NO_CLAUDE) {
      await actions['tabs:rename'](spaces.th.id, second.th, 'อธิบาย main.tsx')
      await actions['tabs:rename'](spaces.en.id, second.en, 'Explain main.tsx')
    } else {
      // Three Claude runs at once: one per workspace, plus a second tab in the English one.
      const peek = setInterval(() => {
        const busy = actions['claude:busy']() as string[]
        if (busy.includes(second.en)) console.log(`CHECK tabs running together: ${busy.length}`)
      }, 3000)
      await Promise.all([
        ...(['th', 'en'] as Language[]).map((lang) => actions['claude:send'](spaces[lang].id, PROMPTS[lang])),
        actions['claude:send'](spaces.en.id, 'In one or two sentences, what does src/main.tsx do? Do not change any files.', second.en),
        actions['claude:send'](spaces.th.id, 'อธิบายสั้นๆ หนึ่งถึงสองประโยคว่า src/main.tsx ทำอะไร ห้ามแก้ไฟล์ ตอบภาษาไทย', second.th)
      ])
      clearInterval(peek)
      const roles = (tabId: string): string => (actions['chat:get'](tabId) as { role: string }[]).map((i) => i.role).filter((r) => r !== 'tool').join(',')
      console.log(`CHECK tab 1: ${roles(getState().workspaces.find((w) => w.id === spaces.en.id)!.tabs[0].id)}`)
      console.log(`CHECK tab 2: ${roles(second.en)}`)
      console.log(`CHECK tab titles: ${getState().workspaces.find((w) => w.id === spaces.en.id)!.tabs.map((t) => t.title).join(' | ')}`)
    }

    if (!process.env.TAKODE_SHOTS_NO_CLAUDE) {
      // Exercise the rest of the Actions features for real and log what came back.
      for (const lang of ['th', 'en'] as Language[]) {
        await actions['ws:runAction'](spaces[lang].id, 'status')
      }
      while ((actions['actions:running']() as string[]).length) await sleep(200)
      // Push one workspace so the two show different branch states.
      await actions['ws:push'](spaces.en.id, 'Add a dark mode toggle')
      await actions['branches:refresh']()
      console.log(`CHECK branch states: ${getState().workspaces.map((w) => `${w.name}=${w.git?.state}`).join(', ')}`)
      if (process.env.TAKODE_SHOTS_CHECKS) {
        const draft = (await actions['ws:draftPr'](spaces.en.id)) as { title: string; body: string }
        console.log(`CHECK draft title: ${draft.title} | body chars: ${draft.body.length}`)
        // Plan mode with a chosen model and effort: Claude must plan and change nothing.
        const plan = (await actions['ws:create'](repo.id, { name: 'presto' })) as Workspace
        await actions['ws:update'](plan.id, { planMode: true, model: 'haiku', effort: 'low' })
        await actions['claude:send'](plan.id, 'Plan how to add a footer with opening hours. Keep the plan short.')
        const chat = (actions['chat:get'](plan.id) as { role: string; text: string }[]).filter((i) => i.role !== 'tool')
        const changed = ((await actions['ws:diff'](plan.id)) as unknown[]).length
        console.log(`CHECK plan mode: roles=${chat.map((i) => i.role).join(',')} | files changed=${changed}`)
        console.log(`CHECK plan text: ${chat.filter((i) => i.role === 'assistant').pop()?.text.slice(0, 160).replace(/\n/g, ' ')}`)
        await actions['ws:archive'](plan.id, true)
      }
      const stats = getState().stats
      console.log(`CHECK level stats: replies=${stats.replies} xp=${stats.xp} input=${stats.input} output=${stats.output}`)
      console.log(`CHECK branches: ${getState().workspaces.map((w) => w.branch).join(', ')}`)
    }

    if (process.env.TAKODE_SHOTS_DEBUG) {
      // Close-up checks of the chat controls, not used in the README.
      await actions['settings:update']({ language: 'th', theme: 'midnight' })
      await js(`window.__takode.select(${JSON.stringify(spaces.th.id)})`)
      for (const effort of ['low', 'high', 'xhigh', 'max']) {
        await actions['ws:update'](spaces.th.id, { effort, planMode: effort === 'xhigh' })
        await shot(`debug-effort-${effort}`)
      }
      // Every branch state side by side (placed by hand here; only to check the icons).
      for (const [i, state] of ['local', 'pushed', 'draft', 'open', 'merged', 'closed'].entries()) {
        const ws = (await actions['ws:create'](repo.id, { name: `state-${state}` })) as Workspace
        ws.git = { state, ahead: i === 1 ? 2 : 0, prNumber: i > 1 ? 10 + i : undefined, checkedAt: Date.now() } as Workspace['git']
      }
      await actions['settings:update']({})
      await js(`window.__takode.select(${JSON.stringify(getState().workspaces.at(-2)!.id)})`)
      await shot('debug-states')
      await actions['settings:update']({ theme: 'paper' })
      await shot('debug-states-light')
      await actions['settings:update']({ theme: 'midnight' })
      await js(`document.querySelectorAll('.composer .select.pill')[1].click()`)
      await shot('debug-effort-menu')
      await js(`document.querySelectorAll('.composer .select.pill')[1].click()`)
      await js(`document.querySelectorAll('.composer .select.pill')[0].click()`)
      await shot('debug-model-menu')
      await js(`document.querySelectorAll('.composer .select.pill')[0].click()`)
      await actions['settings:update']({ theme: 'paper' })
      await js(`window.__takode.setModal({ type: 'settings', tab: 'repos' })`)
      await sleep(400)
      await js(`document.querySelector('.dialog .select.boxed').click()`)
      await shot('debug-field-menu')
      return
    }

    for (const lang of ['th', 'en'] as Language[]) {
      await actions['settings:update']({ language: lang, theme: 'midnight', accent: '#7c8cff' })
      await js(`window.__takode.select(${JSON.stringify(spaces[lang].id)})`)
      await sleep(1200)
      await shot(`workspace-${lang}`)

      // The terminal in the right panel, running real commands in the workspace.
      await js(`document.querySelector('[data-testid="tab-terminal"]').click()`)
      await sleep(1500)
      await actions['term:write'](spaces[lang].id, 'git status --short && git --no-pager log --oneline -3 && ls\r')
      await sleep(1500)
      await shot(`terminal-${lang}`)
      const shown = (await actions['term:open'](spaces[lang].id, 80, 24)) as string
      console.log(`CHECK terminal (${lang}): ran git=${shown.includes('Initial commit')} in workspace=${shown.includes('index.html')}`)
      // The built-in editor with a file Claude just changed.
      await js(`window.dispatchEvent(new CustomEvent('takode:open-file', { detail: { wsId: ${JSON.stringify(spaces[lang].id)}, path: 'src/Header.tsx', line: 3 } }))`)
      await sleep(1200)
      await shot(`editor-${lang}`)
      await js(`document.querySelector('.side-tabs button').click()`)

      await actions['spotlight:on'](spaces[lang].id)
      await shot(`spotlight-${lang}`)
      await actions['spotlight:off'](repo.id)

      await js('window.__takode.setPalette(true)')
      await shot(`palette-${lang}`)
      await js('window.__takode.setPalette(false)')

      await js(`window.__takode.showUpdate(${JSON.stringify({
        current: '0.1.0',
        version: '0.2.0',
        name: 'Takode 0.2.0',
        publishedAt: '2026-11-10T04:00:00Z',
        pageUrl: 'https://github.com/madara1150/takode/releases',
        notes: lang === 'th'
          ? '## ฟีเจอร์ใหม่\n- **แก้โค้ดเองในแอป** พร้อมเปิดใน VS Code\n- โหมด **ถามทุกครั้ง** ก่อน Claude แก้ไฟล์หรือรันคำสั่ง\n- แถบสถานะด้านล่าง: โควตา Claude และแรม\n\n## แก้ไข\n- เปลี่ยนชื่อ branch จากแชทได้'
          : '## New features\n- **Edit code by hand** in the app, or open it in VS Code\n- **Ask every time** mode before Claude edits files or runs commands\n- Status bar with Claude limits and memory use\n\n## Fixes\n- Renaming a branch from the chat now works',
        asset: { name: 'Takode-macOS.dmg', url: 'https://example.invalid', size: 1 }
      })})`)
      await shot(`update-${lang}`)
      await js('window.__takode.setModal(null)')
      await js('window.__takode.showUpdate(null)')

      await js(`window.__takode.setModal({ type: 'settings', tab: 'appearance' })`)
      await shot(`themes-${lang}`)
      await js(`window.__takode.setModal({ type: 'settings', tab: 'chat' })`)
      await shot(`chat-settings-${lang}`)
      await js(`window.__takode.setModal({ type: 'settings', tab: 'level' })`)
      await shot(`level-${lang}`)
      await js('window.__takode.setModal(null)')
      await js('window.__takode.setLevelUp(20)')
      await shot(`levelup-${lang}`)
      await js('window.__takode.setLevelUp(null)')
      await js(`window.__takode.setModal({ type: 'settings', tab: 'models' })`)
      await shot(`models-${lang}`)
      await js(`window.__takode.setModal({ type: 'settings', tab: 'repos' })`)
      await shot(`repo-settings-${lang}`)
      await js(`window.__takode.setModal({ type: 'settings', tab: 'repos', repoTab: 'actions' })`)
      await shot(`actions-${lang}`)
      await js('window.__takode.setModal(null)')

      await actions['settings:update']({ theme: 'paper', accent: '#3ecf8e' })
      await shot(`light-${lang}`)
    }
    // Other looks from the settings, saved with a "check-" prefix (not used in the README).
    await js('window.__takode.setModal(null)')
    await actions['settings:update']({ theme: 'midnight', accent: '#7c8cff', uiFont: 'rounded', radius: 16, density: 'spacious', bubbleStyle: 'plain', toolCalls: 'compact', showCost: true, uiScale: 110 })
    await js(`window.__takode.select(${JSON.stringify(spaces.en.id)})`)
    await shot('check-look')
    await actions['settings:update']({ uiFont: 'system', radius: 10, density: 'normal', bubbleStyle: 'bubble', toolCalls: 'all', showCost: false, uiScale: 100 })
    console.log(`spotlights left on: ${getState().spotlights.length}`)
  } catch (err) {
    console.error('screenshot run failed:', err)
    process.exitCode = 1
  } finally {
    app.quit()
  }
}
