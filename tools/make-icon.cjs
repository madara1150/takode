// Renders the app icon to assets/icon-1024.png and assets/icon.png.
// Run with: npm run icon
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#21113f"/><stop offset="1" stop-color="#06050d"/>
    </linearGradient>
    <linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="220" y1="200" x2="820" y2="860">
      <stop offset="0" stop-color="#ff4fd8"/><stop offset=".5" stop-color="#8f6bff"/><stop offset="1" stop-color="#1fe6ff"/>
    </linearGradient>
    <radialGradient id="glow" cx=".5" cy=".42" r=".55">
      <stop offset="0" stop-color="#8f6bff" stop-opacity=".38"/><stop offset="1" stop-color="#8f6bff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="210" fill="url(#bg)"/>
  <rect x="64" y="64" width="896" height="896" rx="210" fill="url(#glow)"/>
  <rect x="78" y="78" width="868" height="868" rx="196" fill="none" stroke="url(#ink)" stroke-opacity=".35" stroke-width="6"/>
  <!-- tentacles that end in commit nodes -->
  <g fill="none" stroke="url(#ink)" stroke-width="58" stroke-linecap="round">
    <path d="M356 520C356 650 236 640 236 742"/>
    <path d="M460 540C460 690 396 700 396 800"/>
    <path d="M564 540C564 690 628 700 628 800"/>
    <path d="M668 520C668 650 788 640 788 742"/>
  </g>
  <g fill="#0b0916" stroke="url(#ink)" stroke-width="30">
    <circle cx="236" cy="778" r="42"/><circle cx="396" cy="836" r="42"/>
    <circle cx="628" cy="836" r="42"/><circle cx="788" cy="778" r="42"/>
  </g>
  <!-- head -->
  <path d="M300 560V412a212 212 0 0 1 424 0v148a40 40 0 0 1-40 40H340a40 40 0 0 1-40-40z" fill="url(#ink)"/>
  <!-- single eye with a slit pupil -->
  <circle cx="512" cy="418" r="112" fill="#0b0916"/>
  <circle cx="512" cy="418" r="84" fill="#f4f1ff"/>
  <ellipse cx="512" cy="418" rx="24" ry="66" fill="#0b0916"/>
  <circle cx="540" cy="384" r="16" fill="#fff"/>
</svg>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 500))
  const image = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024, quality: 'best' })
  const assets = path.join(__dirname, '..', 'assets')
  fs.mkdirSync(assets, { recursive: true })
  fs.writeFileSync(path.join(assets, 'icon-1024.png'), image.toPNG())
  fs.writeFileSync(path.join(assets, 'icon.png'), image.resize({ width: 256, height: 256, quality: 'best' }).toPNG())
  console.log('icons written to assets/')
  app.quit()
})
