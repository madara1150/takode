// Each repository gets a badge: a shape and the colour of one level. A few shapes
// are there from the start; the rest unlock as you level up.
// Without a choice, both come from the repository id, so every repo looks different.
import { MAX_LEVEL } from './level'

export interface RepoIcon {
  shape: string
  /** Whose colour the badge wears (1–100, see levelColor). */
  level: number
}

export interface IconDef {
  id: string
  /** Level that unlocks it. */
  level: number
  /** SVG path in a 24×24 box. */
  path: string
  /** Holes in the shape (rings, targets). */
  evenOdd?: boolean
  /** The top prize: colours that keep cycling. */
  rgb?: boolean
}

// ── Shape builders ──────────────────────────────────────────────────────────
const f = (n: number): string => n.toFixed(2)

function star(points: number, inner: number, turn = 0, r = 10.5, cx = 12, cy = 12): string {
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner
    const a = (Math.PI / points) * i - Math.PI / 2 + turn
    pts.push(`${f(cx + rad * Math.cos(a))} ${f(cy + rad * Math.sin(a))}`)
  }
  return `M${pts.join('L')}Z`
}

function polygon(sides: number, turn = 0, r = 10): string {
  const pts: string[] = []
  for (let i = 0; i < sides; i++) {
    const a = ((Math.PI * 2) / sides) * i - Math.PI / 2 + turn
    pts.push(`${f(12 + r * Math.cos(a))} ${f(12 + r * Math.sin(a))}`)
  }
  return `M${pts.join('L')}Z`
}

const circle = (cx: number, cy: number, r: number): string => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`

function flower(petals: number, petal: number, ring: number, centre: number): string {
  const parts = [circle(12, 12, centre)]
  for (let i = 0; i < petals; i++) {
    const a = ((Math.PI * 2) / petals) * i - Math.PI / 2
    parts.push(circle(12 + ring * Math.cos(a), 12 + ring * Math.sin(a), petal))
  }
  return parts.join('')
}

function gear(teeth: number, outer = 10.5, inner = 8): string {
  const pts: string[] = []
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a = step * i - Math.PI / 2
    const at = (r: number, d: number): string => `${f(12 + r * Math.cos(a + d))} ${f(12 + r * Math.sin(a + d))}`
    pts.push(at(inner, -step * 0.5), at(inner, -step * 0.28), at(outer, -step * 0.18), at(outer, step * 0.18), at(inner, step * 0.28))
  }
  return `M${pts.join('L')}Z${circle(12, 12, 3)}`
}

// ── The collection, roughly from plain to fancy ────────────────────────────
type Raw = Omit<IconDef, 'level'>
const STARTERS: Raw[] = [
  { id: 'classic', path: star(5, 0.45) },
  { id: 'spark', path: star(4, 0.32) },
  { id: 'circle', path: circle(12, 12, 9.5) },
  { id: 'diamond', path: polygon(4, 0, 10.5) },
  { id: 'hex', path: star(6, 0.55) },
  { id: 'heart', path: 'M12 21s-8.5-5.3-8.5-11.4A4.7 4.7 0 0 1 12 6.8a4.7 4.7 0 0 1 8.5 2.8C20.5 15.7 12 21 12 21Z' }
]

const UNLOCKS: Raw[] = [
  { id: 'triangle', path: polygon(3, 0, 10.5) },
  { id: 'fat', path: star(5, 0.62) },
  { id: 'pentagon', path: polygon(5) },
  { id: 'drop', path: 'M12 2.5s7 7.6 7 12.3a7 7 0 0 1-14 0C5 10.1 12 2.5 12 2.5Z' },
  { id: 'moon', path: 'M20 14.6A8.6 8.6 0 1 1 9.4 4a7 7 0 0 0 10.6 10.6Z' },
  { id: 'hexagon', path: polygon(6, Math.PI / 6) },
  { id: 'tri-star', path: star(3, 0.4) },
  { id: 'ring', path: circle(12, 12, 9.5) + circle(12, 12, 5), evenOdd: true },
  { id: 'leaf', path: 'M20 4C9 4 4 9 4 15.5 4 18 5 20 5 20s1.6-5.4 8-9.5c-4.6 3.6-6.6 7.6-7 10 0 0 1.7.5 4 .5C16.6 21 20 15.3 20 4Z' },
  { id: 'clover4', path: flower(4, 4, 4.6, 2) },
  { id: 'seven', path: star(7, 0.5) },
  { id: 'cloud', path: 'M7 19a4.5 4.5 0 0 1-.7-8.9 6 6 0 0 1 11.5-1.6A5 5 0 0 1 17.5 19Z' },
  { id: 'octagon', path: polygon(8, Math.PI / 8) },
  { id: 'shield', path: 'M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6Z' },
  { id: 'compass', path: star(8, 0.42) },
  { id: 'bubbles', path: circle(9, 14, 6) + circle(17.5, 7.5, 3.5) + circle(18, 17.5, 2.2) },
  { id: 'fish', path: 'M2.5 12c3-5.2 9.2-6.6 13.6-3l5.4-3.2v12.4L16.1 15c-4.4 3.6-10.6 2.2-13.6-3Z' },
  { id: 'flower5', path: flower(5, 3.8, 5.2, 2.6) },
  { id: 'snow', path: star(6, 0.24) },
  { id: 'shell', path: 'M12 3c5.2 0 9 3.8 9 8.6L18 19H6l-3-7.4C3 6.8 6.8 3 12 3Zm-1 15h2V8h-2Z', evenOdd: true },
  { id: 'gear6', path: gear(6), evenOdd: true },
  { id: 'bolt', path: 'M13.5 2 4.5 13.5h6L9.5 22l9-12h-6Z' },
  { id: 'flame', path: 'M12 2.5c1 3.5 5.6 5.6 5.6 11a5.6 5.6 0 0 1-11.2 0c0-2.6 1.2-4.1 2.6-5.1 0 2 1 3.1 2 3.3C10 9.2 11 6 12 2.5Z' },
  { id: 'nine', path: star(9, 0.6) },
  { id: 'target', path: circle(12, 12, 10) + circle(12, 12, 7) + circle(12, 12, 4) + circle(12, 12, 1.6), evenOdd: true },
  { id: 'cat', path: 'M4 3l4.5 4h7L20 3v10.5a8 8 0 0 1-16 0Z' },
  { id: 'sparkles', path: star(4, 0.3, 0, 7, 9, 13) + star(4, 0.3, 0, 4, 18, 6) + star(4, 0.3, 0, 3, 18.5, 17.5) },
  { id: 'hourglass', path: 'M6 2h12v2.5L13.3 12l4.7 7.5V22H6v-2.5L10.7 12 6 4.5Z' },
  { id: 'mushroom', path: 'M3 12.5a9 8.5 0 0 1 18 0ZM9 13.5h6V19a3 3 0 0 1-6 0Z' },
  { id: 'gem', path: 'M7 3h10l4.5 6L12 21.5 2.5 9Z' },
  { id: 'flower6', path: flower(6, 3.4, 5.6, 2.8) },
  { id: 'music', path: 'M9 17.5a3.2 3.2 0 1 1-2-3V4.3L19 2v13.5a3.2 3.2 0 1 1-2-3V5.5l-8 1.6Z' },
  { id: 'gear8', path: gear(8), evenOdd: true },
  { id: 'cross-star', path: star(4, 0.5, Math.PI / 4) },
  { id: 'paw', path: circle(12, 15.5, 5) + circle(5.2, 10, 2.2) + circle(9, 5.5, 2.3) + circle(15, 5.5, 2.3) + circle(18.8, 10, 2.2) },
  { id: 'planet', path: circle(12, 12, 6.5) + 'M1.5 15.5c1.5 2.3 8 .8 13.6-2.6S24 5.3 22.5 3.1c-.6-.9-2-1.2-3.8-.9l-.8 1.6c1.2-.1 2 .1 2.3.5.8 1.3-2.7 4.4-7.5 7.3s-9.6 4.3-10.4 3c-.3-.5 0-1.4.9-2.4L3 12.5c-1.5 1.3-2 2.3-1.5 3Z' },
  { id: 'eight-soft', path: star(8, 0.7) },
  { id: 'crystal', path: 'M9 2h6l3.5 7L12 22 5.5 9Z' },
  { id: 'ghost', path: 'M12 3a7 7 0 0 1 7 7v11l-2.3-1.8-2.4 1.8L12 19.2 9.7 21l-2.4-1.8L5 21V10a7 7 0 0 1 7-7Z' },
  { id: 'butterfly', path: 'M12 8.5C10 4.4 4.2 2.5 3 5.3c-1.2 2.9 2 6.8 6 6.9-3 1-4.9 4.1-3 5.9 1.9 1.9 4.9-.9 6-3.9 1.1 3 4.1 5.8 6 3.9 1.9-1.8 0-4.9-3-5.9 4-.1 7.2-4 6-6.9-1.2-2.8-7-.9-9 3.2Z' },
  { id: 'sun', path: star(10, 0.68) },
  { id: 'rocket', path: 'M12 2c3.2 2.1 5.2 6.3 4.6 11.2l2.6 3.1-1.1 4-3.6-2.1H9.5L5.9 20.3l-1.1-4 2.6-3.1C6.8 8.3 8.8 4.1 12 2Z' },
  { id: 'clover', path: flower(4, 4.3, 4.3, 1) + 'M11.3 14h1.4l1.6 8h-1.6Z' },
  { id: 'gear12', path: gear(12, 10.5, 8.6), evenOdd: true },
  { id: 'octopus', path: 'M12 3a6 6 0 0 1 6 6v3c0 1 .8 1.5 1.5 2.5.6 1 .5 2.5-.5 2.5s-1.5-1-2-2c-.3 2-1 4-2.5 4.5-.8-1-.5-3-.5-4.5-.5 2-1 4-2 4.5s-1.5-2.5-2-4.5c0 1.5.3 3.5-.5 4.5C7 20 6.3 18 6 16c-.5 1-1 2-2 2s-1.1-1.5-.5-2.5C4.2 14.5 6 14 6 12V9a6 6 0 0 1 6-6Z' },
  { id: 'burst', path: star(12, 0.78) },
  { id: 'comet', path: circle(16, 8, 5) + 'M2 22l9.2-12.4 3.2 3.2Z' },
  { id: 'trophy', path: 'M7 3h10v4.5a5 5 0 0 1-4 4.9V16h3.5v3h-9v-3H11v-3.6a5 5 0 0 1-4-4.9ZM3 4h3v2.5H5c0 1.5.8 2.5 2.2 3l-.6 1.8C4.3 10.6 3 8.7 3 6.5Zm18 0h-3v2.5h1c0 1.5-.8 2.5-2.2 3l.6 1.8c2.3-.7 3.6-2.6 3.6-4.8Z' },
  { id: 'flower8', path: flower(8, 3, 6.2, 3.4) },
  { id: 'seal', path: star(16, 0.86) },
  { id: 'crown', path: 'M3 8l4.6 4.2L12 4.5l4.4 7.7L21 8l-2 11H5Z' },
  { id: 'galaxy', path: star(4, 0.25, 0, 10.5) + star(4, 0.25, Math.PI / 4, 7) },
  { id: 'badge', path: star(24, 0.88) },
  { id: 'kraken', path: 'M12 2.5a6.5 6.5 0 0 1 6.5 6.5v2.4c1.6.6 3 2.2 2.6 3.9-.3 1.3-1.8 1.4-2.6.5.2 2.3-.6 4.7-2.5 5.6-.4-1.3-.2-3-.4-4.3-.6 2-1.6 4-3.6 4.6-1.9-.6-2.9-2.6-3.5-4.6-.2 1.3 0 3-.4 4.3-1.9-.9-2.7-3.3-2.5-5.6-.8.9-2.3.8-2.6-.5-.4-1.7 1-3.3 2.6-3.9V9A6.5 6.5 0 0 1 12 2.5Zm-2.6 6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Zm5.2 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z', evenOdd: true }
]

const LEGEND: Raw = { id: 'legend', path: star(5, 0.45) + circle(12, 12, 2.4), evenOdd: true, rgb: true }

/** Every icon with the level that unlocks it: starters at 1, the rest spread over 2–99, the legend at 100. */
export const REPO_ICONS: IconDef[] = [
  ...STARTERS.map((r) => ({ ...r, level: 1 })),
  ...UNLOCKS.map((r, i) => ({ ...r, level: 2 + Math.round((i * 97) / (UNLOCKS.length - 1)) })),
  { ...LEGEND, level: MAX_LEVEL }
]
const BY_ID = new Map(REPO_ICONS.map((d) => [d.id, d]))
export const SHAPE_IDS = REPO_ICONS.map((d) => d.id)

export const iconDef = (id: string): IconDef => BY_ID.get(id) ?? BY_ID.get('classic')!
export const iconsUnlockedAt = (level: number): IconDef[] => REPO_ICONS.filter((d) => d.level === level && level > 1)
export const unlockedIconCount = (level: number): number => REPO_ICONS.filter((d) => d.level <= level).length

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

export function repoIcon(repo: { id: string; icon?: Partial<RepoIcon> }): RepoIcon {
  const h = hash(repo.id)
  // The automatic pick only uses the shapes everyone starts with.
  const shape = repo.icon?.shape && BY_ID.has(repo.icon.shape) ? repo.icon.shape : STARTERS[h % STARTERS.length].id
  const raw = Number(repo.icon?.level)
  const level = Number.isInteger(raw) && raw >= 1 && raw <= MAX_LEVEL ? raw : 1 + (Math.floor(h / STARTERS.length) % MAX_LEVEL)
  return { shape, level }
}
