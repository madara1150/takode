// What each level unlocks. Rewards come every few levels so there is always
// something close to aim for, and they are things you can actually use.
import { TIER_STARTS, type Tier } from './level'

export type RewardKind = 'title' | 'theme' | 'accent' | 'ring' | 'effect'

export interface Reward {
  level: number
  kind: RewardKind
  /** Theme id, accent colour, ring style or effect id. */
  id: string
  name: { en: string; th: string }
}

const R = (level: number, kind: RewardKind, id: string, en: string, th: string): Reward => ({ level, kind, id, name: { en, th } })

const TITLES: Record<Tier, [string, string]> = {
  hatchling: ['Hatchling', 'ลูกหมึกแรกเกิด'],
  swimmer: ['Swimmer', 'นักว่ายน้ำ'],
  explorer: ['Explorer', 'นักสำรวจ'],
  navigator: ['Navigator', 'ต้นหน'],
  diver: ['Deep Diver', 'นักดำน้ำลึก'],
  captain: ['Captain', 'กัปตัน'],
  admiral: ['Admiral', 'พลเรือเอก'],
  kraken: ['Kraken', 'คราเคน'],
  leviathan: ['Leviathan', 'เลวีอาธาน'],
  abyss: ['Lord of the Abyss', 'เจ้าแห่งห้วงลึก'],
  legend: ['Legend of the Deep', 'ตำนานใต้ทะเลลึก']
}

export const REWARDS: Reward[] = [
  ...TIER_STARTS.filter((s) => s.level > 1).map((s) =>
    R(s.level, 'title', s.tier, `Title: ${TITLES[s.tier][0]}`, `ฉายา: ${TITLES[s.tier][1]}`)
  ),
  R(2, 'accent', '#ff7f6e', 'Coral accent colour', 'สีเน้นปะการัง'),
  R(3, 'ring', 'glow', 'Glowing level ring', 'วงเลเวลเรืองแสง'),
  R(5, 'theme', 'reef', 'Reef theme', 'ธีมแนวปะการัง'),
  R(7, 'accent', '#5eead4', 'Mint accent colour', 'สีเน้นมิ้นต์'),
  R(10, 'ring', 'double', 'Double ring', 'วงคู่'),
  R(12, 'accent', '#fb923c', 'Sunset accent colour', 'สีเน้นพระอาทิตย์ตก'),
  R(15, 'theme', 'lagoon', 'Lagoon theme (light)', 'ธีมลากูน (สว่าง)'),
  R(18, 'effect', 'bubbles', 'Bubble celebration', 'ฉลองแบบฟองน้ำ'),
  R(20, 'ring', 'sparkle', 'Sparkling ring', 'วงประกายระยิบ'),
  R(25, 'theme', 'coral', 'Coral theme', 'ธีมปะการังแดง'),
  R(30, 'accent', '#fbbf24', 'Gold accent colour', 'สีเน้นทอง'),
  R(35, 'ring', 'orbit', 'Orbiting moon', 'ดวงจันทร์โคจร'),
  R(40, 'theme', 'abyss', 'Abyss theme', 'ธีมห้วงลึก'),
  R(45, 'effect', 'ripple', 'Ripple when you send', 'ระลอกคลื่นตอนกดส่ง'),
  R(50, 'ring', 'comet', 'Comet ring', 'วงดาวหาง'),
  R(55, 'accent', '#ff2bd6', 'Neon accent colour', 'สีเน้นนีออน'),
  R(60, 'theme', 'synthwave', 'Synthwave theme', 'ธีมซินธ์เวฟ'),
  R(65, 'effect', 'stars', 'Starfall celebration', 'ฉลองแบบดาวตก'),
  R(70, 'ring', 'pulse', 'Heartbeat ring', 'วงชีพจร'),
  R(75, 'theme', 'kraken', 'Kraken ink theme', 'ธีมหมึกคราเคน'),
  R(80, 'accent', '#a5f3fc', 'Ice accent colour', 'สีเน้นน้ำแข็ง'),
  R(85, 'effect', 'aura', 'Aura around your level', 'ออร่ารอบเลเวล'),
  R(90, 'ring', 'flame', 'Flame ring', 'วงเปลวไฟ'),
  R(95, 'theme', 'treasure', 'Sunken treasure theme', 'ธีมสมบัติใต้ทะเล'),
  R(100, 'ring', 'rgb', 'RGB light ring', 'วงไฟวิ่ง RGB'),
  R(100, 'accent', 'rgb', 'RGB accent colour (cycles through every colour)', 'สีเน้น RGB (วนทุกสี)'),
  R(100, 'effect', 'fireworks', 'Fireworks celebration', 'ฉลองแบบพลุ'),
  R(100, 'effect', 'rgbFrame', 'RGB light frame around the window', 'กรอบไฟวิ่ง RGB รอบหน้าต่าง')
].sort((a, b) => a.level - b.level)

// Rewards given by redeem codes, whatever the level.
const extra = new Set<string>()
export function setExtraUnlocks(list: string[] = []): void {
  extra.clear()
  for (const item of list) extra.add(item)
}
export const hasExtraUnlock = (kind: RewardKind, id: string): boolean => extra.has(`${kind}:${id}`)

/** Level needed for a reward; 0 when it is available from the start (or was redeemed). */
export function unlockLevel(kind: RewardKind, id: string): number {
  if (extra.has(`${kind}:${id}`)) return 0
  return REWARDS.find((r) => r.kind === kind && r.id === id)?.level ?? 0
}

export const isUnlocked = (kind: RewardKind, id: string, level: number): boolean => level >= unlockLevel(kind, id)

export const rewardsAt = (level: number): Reward[] => REWARDS.filter((r) => r.level === level)

/** The next level that brings something, and what it brings. */
export function nextRewards(level: number): { level: number; rewards: Reward[] } | null {
  const next = REWARDS.find((r) => r.level > level)
  return next ? { level: next.level, rewards: rewardsAt(next.level) } : null
}

export const RING_STYLES = ['basic', 'glow', 'double', 'sparkle', 'orbit', 'comet', 'pulse', 'flame', 'rgb'] as const
export const LEVEL_UP_EFFECTS = ['confetti', 'bubbles', 'stars', 'fireworks'] as const
