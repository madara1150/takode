interface Bridge {
  platform: string
  pathForFile(file: File): string
  invoke(name: string, ...args: unknown[]): Promise<{ ok: boolean; data?: unknown; error?: string }>
  on(event: string, cb: (payload: any) => void): () => void
}

declare global {
  interface Window {
    takode: Bridge
  }
}

/** Calls an action in the main process; rejects with the action's error message. */
export async function call<T = any>(name: string, ...args: unknown[]): Promise<T> {
  const res = await window.takode.invoke(name, ...args)
  if (!res.ok) throw new Error(res.error)
  return res.data as T
}

export const on = (event: string, cb: (payload: any) => void): (() => void) => window.takode.on(event, cb)
export const isMac = window.takode.platform === 'darwin'
