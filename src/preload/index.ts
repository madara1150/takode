import { contextBridge, ipcRenderer, webUtils } from 'electron'

const EVENTS = ['state', 'chat:item', 'busy', 'github:device', 'claude:login-output', 'actions:running', 'update:available', 'update:progress', 'term:data', 'term:exit', 'level:up', 'focus:workspace', 'permission:request', 'permission:done']

contextBridge.exposeInMainWorld('takode', {
  platform: process.platform,
  /** Disk path of a file dropped on the window ("" for pasted data). */
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  invoke: (name: string, ...args: unknown[]) => ipcRenderer.invoke('takode', name, ...args),
  on: (event: string, cb: (payload: unknown) => void) => {
    if (!EVENTS.includes(event)) return () => undefined
    const listener = (_e: unknown, payload: unknown): void => cb(payload)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  }
})
