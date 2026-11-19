/**
 * The renderer's only route to persistence.
 *
 * In the packaged app this forwards to the preload bridge. When the renderer is
 * opened in a plain browser (the Vite dev server, for UI work) there is no
 * preload, so an in-memory + localStorage fallback keeps the UI functional. The
 * fallback is deliberately obvious about its limits — `isDesktop()` is exported
 * so the UI can tell the user their work is not being written to disk.
 */

import {
  BOARD_ID_PATTERN,
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
import { createBoardId } from '@/lib/id'

const bridge = (): WhiteboardApi | null =>
  typeof window !== 'undefined' && window.whiteboard ? window.whiteboard : null

export const isDesktop = (): boolean => bridge() !== null

// ------------------------------------------------------------ browser shim ---

const LS_PREFIX = 'whiteboard:board:'

function lsKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(LS_PREFIX)) keys.push(key)
  }
  return keys
}

function lsRead(id: string): BoardDocument | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + id)
    return raw ? (JSON.parse(raw) as BoardDocument) : null
  } catch {
    return null
  }
}

function lsWrite(doc: BoardDocument): void {
  try {
    localStorage.setItem(LS_PREFIX + doc.id, JSON.stringify(doc))
  } catch {
    // Quota exceeded — expected once a board contains imported images.
    throw new Error('Browser preview storage is full. Run the desktop app to save this board.')
  }
}

const shim: WhiteboardApi = {
  boards: {
    async list(): Promise<BoardMeta[]> {
      return lsKeys()
        .map((key) => lsRead(key.slice(LS_PREFIX.length)))
        .filter((doc): doc is BoardDocument => doc !== null)
        .map((doc) => ({
          id: doc.id,
          name: doc.name,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          shapeCount: doc.shapes.length,
          sizeBytes: JSON.stringify(doc).length
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async create(name) {
      const now = new Date().toISOString()
      const doc: BoardDocument = {
        version: 1,
        id: createBoardId(),
        name,
        createdAt: now,
        updatedAt: now,
        viewport: { x: 0, y: 0, scale: 1 },
        shapes: []
      }
      lsWrite(doc)
      return doc
    },
    async load(id) {
      const doc = lsRead(id)
      if (!doc) throw new Error(`Board ${id} not found`)
      return doc
    },
    async save(doc): Promise<SaveResult> {
      lsWrite(doc)
      return { ok: true, savedAt: new Date().toISOString(), sizeBytes: JSON.stringify(doc).length }
    },
    async rename(id, name) {
      const doc = lsRead(id)
      if (!doc) throw new Error(`Board ${id} not found`)
      const next = { ...doc, name, updatedAt: new Date().toISOString() }
      lsWrite(next)
      return { ...next, shapeCount: next.shapes.length, sizeBytes: JSON.stringify(next).length }
    },
    async remove(id) {
      localStorage.removeItem(LS_PREFIX + id)
      return { ok: true }
    },
    async duplicate(id, name) {
      const doc = lsRead(id)
      if (!doc) throw new Error(`Board ${id} not found`)
      const now = new Date().toISOString()
      const copy = { ...doc, id: createBoardId(), name, createdAt: now, updatedAt: now }
      lsWrite(copy)
      return copy
    },
    async exists(id) {
      return lsRead(id) !== null
    }
  },

  recovery: {
    async list(): Promise<RecoveryEntry[]> {
      return []
    },
    async read(id) {
      const doc = lsRead(id)
      if (!doc) throw new Error(`No snapshot for ${id}`)
      return doc
    },
    async write() {
      return { ok: true }
    },
    async clear() {
      return { ok: true }
    }
  },

  io: {
    async exportFile(req: ExportRequest): Promise<ExportResult> {
      // In a browser the best we can do is trigger a download.
      const blob =
        req.format === 'svg' || req.format === 'json'
          ? new Blob([req.text ?? ''], { type: 'text/plain' })
          : new Blob([(req.bytes ?? new Uint8Array()) as BlobPart], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${req.suggestedName}.${req.format}`
      anchor.click()
      URL.revokeObjectURL(url)
      return { ok: true, canceled: false }
    },
    async importImages(): Promise<ImportedImage[]> {
      throw new Error('Importing images requires the desktop app.')
    }
  },

  prefs: {
    async get(): Promise<AppPreferences> {
      const raw = localStorage.getItem('whiteboard:prefs')
      return raw
        ? (JSON.parse(raw) as AppPreferences)
        : {
            theme: 'system',
            lastBoardId: null,
            showGrid: true,
            snapToGrid: false,
            gridSize: 24,
            autosaveEnabled: true
          }
    },
    async set(patch): Promise<AppPreferences> {
      const current = await shim.prefs.get()
      const next = { ...current, ...patch }
      localStorage.setItem('whiteboard:prefs', JSON.stringify(next))
      return next
    }
  },

  app: {
    async info(): Promise<AppInfo> {
      return {
        version: 'dev',
        electron: '—',
        chrome: navigator.userAgent,
        node: '—',
        platform: 'win32',
        userDataPath: 'browser preview (localStorage)'
      }
    },
    flushDone: () => {},
    // There is no window to drive in a browser preview, and no native overlay
    // to repaint. Both are deliberate no-ops rather than errors, so the UI code
    // that calls them does not need an `isDesktop()` branch.
    async command(): Promise<void> {},
    async setTitlebarTheme(): Promise<void> {},
    onBeforeQuit: () => () => {},
    onMenuCommand: () => () => {}
  }
}

const api = (): WhiteboardApi => bridge() ?? shim

// --------------------------------------------------------------- services ---

export const boardService = {
  list: () => api().boards.list(),
  create: (name: string) => api().boards.create(name),
  load: (id: string) => api().boards.load(id),
  save: (doc: BoardDocument) => api().boards.save(doc),
  rename: (id: string, name: string) => api().boards.rename(id, name),
  remove: (id: string) => api().boards.remove(id),
  duplicate: (id: string, name: string) => api().boards.duplicate(id, name),
  exists: (id: string) => api().boards.exists(id)
}

export const recoveryService = {
  list: () => api().recovery.list(),
  read: (id: string) => api().recovery.read(id),
  write: (doc: BoardDocument) => api().recovery.write(doc),
  clear: (id: string) => api().recovery.clear(id)
}

export const ioService = {
  exportFile: (req: ExportRequest) => api().io.exportFile(req),
  importImages: () => api().io.importImages()
}

export const prefsService = {
  get: () => api().prefs.get(),
  set: (patch: Partial<AppPreferences>) => api().prefs.set(patch)
}

export const appService = {
  info: () => api().app.info(),
  flushDone: () => api().app.flushDone(),
  command: (command: AppCommand) => api().app.command(command),
  setTitlebarTheme: (theme: TitlebarTheme) => api().app.setTitlebarTheme(theme),
  onBeforeQuit: (cb: () => void) => api().app.onBeforeQuit(cb),
  onMenuCommand: (cb: (command: MenuCommand) => void) => api().app.onMenuCommand(cb)
}

export { BOARD_ID_PATTERN }
