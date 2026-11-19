import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type AppCommand,
  type AppInfo,
  type AppPreferences,
  type BoardDocument,
  type BoardMeta,
  type ExportRequest,
  type ExportResult,
  type ImportedImage,
  type MenuCommand,
  type RecoveryEntry,
  type SaveResult,
  type TitlebarTheme,
  type WhiteboardApi
} from '@shared/ipc-contract'

/**
 * The renderer's entire view of the outside world.
 *
 * Deliberately absent:
 *   - `fs`, `path`, `child_process`, `shell` — no direct filesystem reach
 *   - `ipcRenderer` itself — the renderer cannot invent new channels
 *   - any function that takes a file path
 *
 * What remains is an enumerated list of named operations. Adding a capability
 * means adding it here *and* in the main-process handler, which is exactly the
 * review gate you want on the boundary that can write to disk.
 */

/** Wrap an event subscription so the renderer only ever sees the payload. */
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: WhiteboardApi = {
  boards: {
    list: (): Promise<BoardMeta[]> => ipcRenderer.invoke(IPC.boardList),
    create: (name: string): Promise<BoardDocument> => ipcRenderer.invoke(IPC.boardCreate, name),
    load: (id: string): Promise<BoardDocument> => ipcRenderer.invoke(IPC.boardLoad, id),
    save: (doc: BoardDocument): Promise<SaveResult> => ipcRenderer.invoke(IPC.boardSave, doc),
    rename: (id: string, name: string): Promise<BoardMeta> => ipcRenderer.invoke(IPC.boardRename, id, name),
    remove: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.boardDelete, id),
    duplicate: (id: string, name: string): Promise<BoardDocument> =>
      ipcRenderer.invoke(IPC.boardDuplicate, id, name),
    exists: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.boardExists, id)
  },

  recovery: {
    list: (): Promise<RecoveryEntry[]> => ipcRenderer.invoke(IPC.recoveryList),
    read: (boardId: string): Promise<BoardDocument> => ipcRenderer.invoke(IPC.recoveryRead, boardId),
    write: (doc: BoardDocument): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.recoveryWrite, doc),
    clear: (boardId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.recoveryClear, boardId)
  },

  io: {
    exportFile: (req: ExportRequest): Promise<ExportResult> => ipcRenderer.invoke(IPC.exportSave, req),
    importImages: (): Promise<ImportedImage[]> => ipcRenderer.invoke(IPC.imageImport)
  },

  prefs: {
    get: (): Promise<AppPreferences> => ipcRenderer.invoke(IPC.prefsGet),
    set: (patch: Partial<AppPreferences>): Promise<AppPreferences> => ipcRenderer.invoke(IPC.prefsSet, patch)
  },

  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),
    flushDone: (): void => ipcRenderer.send(IPC.appFlushDone),
    command: (command: AppCommand): Promise<void> => ipcRenderer.invoke(IPC.appCommand, command),
    setTitlebarTheme: (theme: TitlebarTheme): Promise<void> =>
      ipcRenderer.invoke(IPC.appTitlebarTheme, theme),
    onBeforeQuit: (cb: () => void): (() => void) => subscribe<void>(IPC.onBeforeQuit, () => cb()),
    onMenuCommand: (cb: (command: MenuCommand) => void): (() => void) =>
      subscribe<MenuCommand>(IPC.onMenuCommand, cb)
  }
}

// `contextBridge` already deep-clones across the boundary, and the object is
// frozen so a renderer script cannot monkey-patch the bridge itself.
contextBridge.exposeInMainWorld('whiteboard', Object.freeze(api))

// Pinch and ctrl+wheel page zoom would fight the canvas's own zoom. Locking the
// visual zoom level means ctrl+wheel only ever reaches the whiteboard.
webFrame.setVisualZoomLevelLimits(1, 1)
