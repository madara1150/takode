import type { ReactElement } from 'react'

interface Kind {
  label: string
  color: string
  /** Dark text on light badges. */
  dark?: boolean
}

const BY_EXT: Record<string, Kind> = {
  ts: { label: 'TS', color: '#3178c6' },
  mts: { label: 'TS', color: '#3178c6' },
  cts: { label: 'TS', color: '#3178c6' },
  js: { label: 'JS', color: '#f0db4f', dark: true },
  mjs: { label: 'JS', color: '#f0db4f', dark: true },
  cjs: { label: 'JS', color: '#f0db4f', dark: true },
  css: { label: '#', color: '#2965f1' },
  scss: { label: 'S', color: '#cf649a' },
  sass: { label: 'S', color: '#cf649a' },
  less: { label: 'L', color: '#1d365d' },
  html: { label: '<>', color: '#e44d26' },
  htm: { label: '<>', color: '#e44d26' },
  vue: { label: 'V', color: '#41b883' },
  svelte: { label: 'S', color: '#ff3e00' },
  json: { label: '{}', color: '#cbcb41', dark: true },
  yml: { label: 'Y', color: '#cb171e' },
  yaml: { label: 'Y', color: '#cb171e' },
  toml: { label: 'T', color: '#9c4221' },
  md: { label: 'M↓', color: '#519aba' },
  mdx: { label: 'M↓', color: '#519aba' },
  py: { label: 'Py', color: '#3776ab' },
  rs: { label: 'Rs', color: '#ce422b' },
  go: { label: 'Go', color: '#00add8' },
  java: { label: 'J', color: '#e76f00' },
  kt: { label: 'K', color: '#7f52ff' },
  swift: { label: 'Sw', color: '#f05138' },
  rb: { label: 'Rb', color: '#cc342d' },
  php: { label: 'P', color: '#777bb4' },
  c: { label: 'C', color: '#5c6bc0' },
  h: { label: 'H', color: '#5c6bc0' },
  cpp: { label: 'C+', color: '#00599c' },
  cs: { label: 'C#', color: '#68217a' },
  sh: { label: '$', color: '#4eaa25' },
  zsh: { label: '$', color: '#4eaa25' },
  bat: { label: '$', color: '#4eaa25' },
  sql: { label: 'DB', color: '#e38c00' },
  xml: { label: '<>', color: '#8bc34a', dark: true },
  png: { label: '▣', color: '#a074c4' },
  pdf: { label: 'PDF', color: '#e5252a' },
  doc: { label: 'W', color: '#2b579a' },
  docx: { label: 'W', color: '#2b579a' },
  xls: { label: 'X', color: '#217346' },
  xlsx: { label: 'X', color: '#217346' },
  csv: { label: 'CSV', color: '#217346' },
  ppt: { label: 'P', color: '#d24726' },
  pptx: { label: 'P', color: '#d24726' },
  zip: { label: 'ZIP', color: '#8b6f47' },
  jpg: { label: '▣', color: '#a074c4' },
  jpeg: { label: '▣', color: '#a074c4' },
  gif: { label: '▣', color: '#a074c4' },
  webp: { label: '▣', color: '#a074c4' },
  svg: { label: '◇', color: '#ffb13b', dark: true },
  lock: { label: '🔒', color: '#6b7280' },
  txt: { label: '≡', color: '#6b7280' }
}

const BY_NAME: Record<string, Kind> = {
  'package.json': { label: 'npm', color: '#cb3837' },
  'package-lock.json': { label: 'npm', color: '#cb3837' },
  dockerfile: { label: 'D', color: '#2496ed' },
  '.gitignore': { label: 'git', color: '#f05033' },
  '.gitattributes': { label: 'git', color: '#f05033' },
  license: { label: '§', color: '#d4aa00', dark: true },
  makefile: { label: 'M', color: '#6d8086' }
}

const REACT_EXT = new Set(['tsx', 'jsx'])

function ReactLogo({ size }: { size: number }): ReactElement {
  return (
    <svg className="file-icon" width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
      <circle r="2.100" fill="#61dafb" />
      <g fill="none" stroke="#61dafb" strokeWidth="1.100">
        <ellipse rx="11" ry="4.200" />
        <ellipse rx="11" ry="4.200" transform="rotate(60)" />
        <ellipse rx="11" ry="4.200" transform="rotate(120)" />
      </g>
    </svg>
  )
}

/** Small icon for a file, chosen by its name or extension (.tsx shows the React logo). */
export function FileIcon({ path, size = 16 }: { path: string; size?: number }): ReactElement {
  const name = path.split('/').pop()!.toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  if (REACT_EXT.has(ext)) return <ReactLogo size={size} />
  const kind = BY_NAME[name] ?? BY_EXT[ext] ?? { label: '', color: 'var(--muted)' }
  return (
    <span
      className={`file-icon badge ${kind.label ? '' : 'plain'}`}
      style={{ width: size, height: size, background: kind.color, color: kind.dark ? '#1b1b1b' : '#fff' }}
      aria-hidden="true"
    >
      {kind.label}
    </span>
  )
}
