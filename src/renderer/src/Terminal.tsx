import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { call, on } from './api'
import { useApp } from './App'
import { useT } from './i18n'
import { Icon } from './icons'

/** Colours for the terminal, taken from the current Takode theme. */
function themeFromCss(): Record<string, string> {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string): string => css.getPropertyValue(name).trim()
  const dark = document.documentElement.dataset.dark !== 'false'
  return {
    background: v('--panel'),
    foreground: v('--text'),
    cursor: v('--accent'),
    cursorAccent: v('--panel'),
    selectionBackground: `${v('--accent')}55`,
    black: dark ? '#1b1e2b' : '#3b3f4c',
    brightBlack: dark ? '#5c6370' : '#6a6d76',
    red: '#ff6b6b',
    green: dark ? '#3ecf8e' : '#15803d',
    yellow: dark ? '#f5c451' : '#b45309',
    blue: dark ? '#6ea8ff' : '#2563eb',
    magenta: dark ? '#c792ea' : '#7c3aed',
    cyan: dark ? '#4cc2ff' : '#0b7fc2',
    white: dark ? '#d7dae0' : '#1c1d21'
  }
}

/** A real shell in the workspace folder. It keeps running while you look at other things. */
export function TerminalView({ wsId, visible }: { wsId: string; visible: boolean }): ReactElement {
  const { state } = useApp()
  const t = useT()
  const host = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [exited, setExited] = useState(false)
  // Closed to save memory: starts again by itself when you come back to it.
  const slept = useRef(false)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: Math.max(11, state.settings.fontSize - 1),
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      theme: themeFromCss()
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current!)
    termRef.current = term
    fitRef.current = fit
    setExited(false)
    slept.current = false

    const size = (): { cols: number; rows: number } => {
      try {
        fit.fit()
      } catch {
        /* not visible yet */
      }
      return { cols: Math.max(term.cols, 20), rows: Math.max(term.rows, 5) }
    }
    const { cols, rows } = size()
    void call<string>('term:open', wsId, cols, rows).then((buffer) => buffer && term.write(buffer))

    const input = term.onData((data) => {
      if (slept.current) restart()
      else void call('term:write', wsId, data)
    })
    const offData = on('term:data', (p: { wsId: string; data: string }) => p.wsId === wsId && term.write(p.data))
    const offExit = on('term:exit', (p: { wsId: string; idle?: boolean }) => {
      if (p.wsId !== wsId) return
      term.write(`\r\n\x1b[2m${t(p.idle ? 'termSlept' : 'termExited')}\x1b[0m\r\n`)
      setExited(true)
      slept.current = !!p.idle
    })
    const observer = new ResizeObserver(() => {
      if (!host.current?.offsetWidth) return
      const next = size()
      void call('term:resize', wsId, next.cols, next.rows)
    })
    observer.observe(host.current!)

    return () => {
      observer.disconnect()
      input.dispose()
      offData()
      offExit()
      term.dispose()
      termRef.current = null
    }
    // The shell itself lives in the main process; only the view is rebuilt here.
  }, [wsId, generation]) // eslint-disable-line react-hooks/exhaustive-deps

  // Follow theme, accent and text size changes.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const id = requestAnimationFrame(() => {
      term.options.theme = themeFromCss()
      term.options.fontSize = Math.max(11, state.settings.fontSize - 1)
      try {
        fitRef.current?.fit()
      } catch {
        /* hidden */
      }
    })
    return () => cancelAnimationFrame(id)
  }, [state.settings.theme, state.settings.accent, state.settings.fontSize])

  const restart = (): void => {
    void call('term:restart', wsId).then(() => setGeneration((g) => g + 1))
  }

  useEffect(() => {
    if (!visible) return
    if (slept.current) restart()
    else requestAnimationFrame(() => termRef.current?.focus())
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="terminal-wrap">
      <div className="terminal-bar">
        <Icon name="terminal" size={14} />
        <span className="muted small terminal-path" title={state.workspaces.find((w) => w.id === wsId)?.path}>
          {state.workspaces.find((w) => w.id === wsId)?.name}
        </span>
        <span className="spacer" />
        {exited && <span className="muted small">{t('termExited')}</span>}
        <button className="icon-btn" title={t('termRestart')} aria-label={t('termRestart')} onClick={restart}>
          <Icon name="refresh" size={14} />
        </button>
      </div>
      <div className="terminal-host" ref={host} data-testid="terminal" />
    </div>
  )
}
