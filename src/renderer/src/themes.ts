import { isUnlocked } from '../../shared/rewards'
import type { Settings } from '../../shared/types'

export interface Theme {
  id: string
  dark: boolean
  bg: string
  panel: string
  raised: string
  border: string
  text: string
  muted: string
}

export const THEMES: Theme[] = [
  { id: 'midnight', dark: true, bg: '#0e1016', panel: '#141722', raised: '#1c2030', border: '#272c3f', text: '#e7e9f3', muted: '#8b91a8' },
  { id: 'graphite', dark: true, bg: '#111111', panel: '#181818', raised: '#222222', border: '#303030', text: '#ececec', muted: '#919191' },
  { id: 'aurora', dark: true, bg: '#120f1c', panel: '#191527', raised: '#231d37', border: '#342b4e', text: '#ece8f7', muted: '#9a90b5' },
  { id: 'forest', dark: true, bg: '#0d1512', panel: '#121c18', raised: '#1a2722', border: '#273a32', text: '#e3efe9', muted: '#86a095' },
  { id: 'paper', dark: false, bg: '#f4f4f1', panel: '#ffffff', raised: '#eeeeea', border: '#deded8', text: '#1c1d21', muted: '#6a6d76' },
  { id: 'sand', dark: false, bg: '#f3ecdf', panel: '#fbf7ef', raised: '#ece3d2', border: '#dccfb8', text: '#2b2620', muted: '#7a6f60' },
  // Unlocked by levelling up (see shared/rewards.ts).
  { id: 'reef', dark: true, bg: '#08161a', panel: '#0d1f24', raised: '#142b31', border: '#1f3d44', text: '#e3f6f7', muted: '#7fa9ae' },
  { id: 'lagoon', dark: false, bg: '#eef8f7', panel: '#ffffff', raised: '#e2f1ef', border: '#c9e4e0', text: '#10302d', muted: '#557673' },
  { id: 'coral', dark: true, bg: '#1a0f0f', panel: '#241414', raised: '#301c1b', border: '#46292a', text: '#fbe9e6', muted: '#b48c88' },
  { id: 'abyss', dark: true, bg: '#05060d', panel: '#0a0c18', raised: '#121528', border: '#1d2240', text: '#dfe3ff', muted: '#7d84b0' },
  { id: 'synthwave', dark: true, bg: '#160a24', panel: '#1f0d33', raised: '#2a1345', border: '#3f1d63', text: '#fde8ff', muted: '#b48dc9' },
  { id: 'kraken', dark: true, bg: '#0b0710', panel: '#120b18', raised: '#1b1124', border: '#2c1b3a', text: '#eee2f5', muted: '#9a86a8' },
  { id: 'treasure', dark: true, bg: '#120f07', panel: '#1b160b', raised: '#262012', border: '#3b311c', text: '#fbf1d8', muted: '#b5a37a' }
]

export const ACCENTS = ['#7c8cff', '#4cc2ff', '#3ecf8e', '#f5a524', '#ff6b6b', '#e879f9', '#f472b6']
/** Extra accent colours earned by levelling up; "rgb" cycles through every colour. */
export const REWARD_ACCENTS = ['#ff7f6e', '#5eead4', '#fb923c', '#fbbf24', '#ff2bd6', '#a5f3fc', 'rgb']

export function resolveTheme(id: string, systemDark: boolean): Theme {
  if (id === 'system') return THEMES.find((t) => t.id === (systemDark ? 'graphite' : 'paper'))!
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#111318' : '#ffffff'
}

const SYSTEM = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Sukhumvit Set', 'Thonburi', 'Leelawadee UI', sans-serif"
export const FONTS: Record<string, string> = {
  system: SYSTEM,
  rounded: `ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', ${SYSTEM}`,
  serif: "ui-serif, 'New York', Georgia, 'Noto Serif Thai', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
}

export function applyTheme(settings: Settings, systemDark: boolean, level: number): void {
  // Something chosen at a higher level (e.g. before a reset) falls back to the default.
  const theme = resolveTheme(isUnlocked('theme', settings.theme, level) ? settings.theme : 'midnight', systemDark)
  const root = document.documentElement
  const rgb = settings.accent === 'rgb' && isUnlocked('accent', 'rgb', level)
  const accent =
    /^#[0-9a-f]{6}$/i.test(settings.accent) && isUnlocked('accent', settings.accent, level) ? settings.accent : ACCENTS[0]
  root.dataset.rgbAccent = rgb ? 'on' : 'off'
  root.dataset.dark = String(theme.dark)
  root.lang = settings.language
  const vars: Record<string, string> = {
    '--bg': theme.bg,
    '--panel': theme.panel,
    '--raised': theme.raised,
    '--border': theme.border,
    '--text': theme.text,
    '--muted': theme.muted,
    '--accent': accent,
    '--on-accent': rgb ? '#111318' : readableOn(accent),
    '--font-size': `${settings.fontSize}px`,
    '--radius': `${settings.radius}px`,
    '--rs': `${Math.round(settings.radius * 0.8)}px`,
    '--rl': `${Math.round(settings.radius * 1.4)}px`,
    '--ui-font': FONTS[settings.uiFont] ?? FONTS.system,
    '--code-size': `${settings.codeFontSize}px`,
    '--gap': { compact: '0.7', normal: '1', spacious: '1.3' }[settings.density] ?? '1'
  }
  root.dataset.density = settings.density
  root.dataset.motion = settings.motion && !settings.liteEffects ? 'on' : 'off'
  root.dataset.lite = settings.liteEffects ? 'on' : 'off'
  root.dataset.pauseUnfocused = settings.pauseUnfocused ? 'on' : 'off'
  root.dataset.bubbles = settings.bubbleStyle
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
}
