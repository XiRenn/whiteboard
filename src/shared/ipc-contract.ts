/**
 * The single source of truth for the renderer <-> main wire protocol.
 *
 * Both sides import this file, so renaming a channel or changing a payload
 * shape breaks the TypeScript build instead of failing silently at runtime.
 *
 * SECURITY: every payload crossing this boundary is untrusted input. The main
 * process validates board ids against BOARD_ID_PATTERN and never accepts a
 * filesystem path from the renderer — paths are derived in main from a
 * validated id, or obtained from a native dialog the user interacted with.
 */

export const BOARD_ID_PATTERN = /^[a-z0-9][a-z0-9-]{5,63}$/

/** Maximum accepted size of a single board document (JSON bytes). */
export const MAX_BOARD_BYTES = 64 * 1024 * 1024

/** Maximum accepted size of an imported image file (bytes). */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024

export const IPC = {
  // ---- board lifecycle -----------------------------------------------------
  boardList: 'board:list',
  boardCreate: 'board:create',
  boardLoad: 'board:load',
  boardSave: 'board:save',
  boardRename: 'board:rename',
  boardDelete: 'board:delete',
  boardDuplicate: 'board:duplicate',
  boardExists: 'board:exists',

  // ---- crash recovery ------------------------------------------------------
  recoveryList: 'recovery:list',
  recoveryRead: 'recovery:read',
  recoveryWrite: 'recovery:write',
  recoveryClear: 'recovery:clear',

  // ---- import / export -----------------------------------------------------
  exportSave: 'export:save',
  imageImport: 'image:import',

  // ---- preferences & app ---------------------------------------------------
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  appInfo: 'app:info',
  appFlushDone: 'app:flush-done',
  /** Renderer -> main: run a window/app-level command from the titlebar menu. */
  appCommand: 'app:command',
  /** Renderer -> main: repaint the native window-control overlay for a theme. */
  appTitlebarTheme: 'app:titlebar-theme',

  // ---- main -> renderer pushes --------------------------------------------
  onBeforeQuit: 'app:before-quit',
  onMenuCommand: 'app:menu-command'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// ---------------------------------------------------------------- DTO shapes ---

export interface BoardMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  /** Number of top-level objects, so the board list can show a size hint. */
  shapeCount: number
  /** Byte size of the board file on disk. */
  sizeBytes: number
}

export interface BoardViewport {
  x: number
  y: number
  scale: number
}

/** A board document as persisted. `shapes` is opaque to the main process. */
export interface BoardDocument {
  version: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  viewport: BoardViewport
  shapes: unknown[]
}

export interface SaveResult {
  ok: boolean
  savedAt: string
  sizeBytes: number
}

export interface RecoveryEntry {
  boardId: string
  boardName: string
  savedAt: string
  shapeCount: number
  /** A write was interrupted and this snapshot came from the `.tmp` journal. */
  fromJournal: boolean
}

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'json'

export interface ExportRequest {
  format: ExportFormat
  /** Suggested file name without extension; main sanitises it. */
  suggestedName: string
  /** Text payload for svg/json. */
  text?: string
  /** Binary payload for png/pdf. */
  bytes?: Uint8Array
}

export interface ExportResult {
  ok: boolean
  canceled: boolean
  filePath?: string
}

export interface ImportedImage {
  name: string
  mime: string
  /** `data:` URL. The renderer never sees a filesystem path. */
  dataUrl: string
  sizeBytes: number
}

export interface AppPreferences {
  theme: 'light' | 'dark' | 'system'
  lastBoardId: string | null
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  autosaveEnabled: boolean
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: NodeJS.Platform
  userDataPath: string
}

export type MenuCommand =
  | 'new-board'
  | 'open-board'
  | 'save'
  | 'export-png'
  | 'export-svg'
  | 'export-pdf'
  | 'import-image'
  | 'undo'
  | 'redo'
  | 'select-all'
  | 'duplicate'
  | 'delete'
  | 'group'
  | 'ungroup'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'zoom-fit'
  | 'toggle-theme'
  | 'toggle-grid'

/**
 * Commands the *main* process owns, because they act on the window or the OS
 * rather than on the document. These cross the IPC boundary, so they are
 * declared here rather than in the menu model — and the main-process handler
 * validates them against `APP_COMMANDS` before dispatching, so a compromised
 * renderer cannot reach a command that was never enumerated.
 */
export type AppCommand =
  | 'open-data-folder'
  | 'toggle-devtools'
  | 'reload'
  | 'toggle-fullscreen'
  | 'minimize'
  | 'close-window'
  | 'quit'

export const APP_COMMANDS: readonly AppCommand[] = [
  'open-data-folder',
  'toggle-devtools',
  'reload',
  'toggle-fullscreen',
  'minimize',
  'close-window',
  'quit'
] as const

/** Resolved theme name, used to repaint the native window-control overlay. */
export type TitlebarTheme = 'light' | 'dark'

/** The complete API surface exposed on `window.whiteboard`. */
export interface WhiteboardApi {
  boards: {
    list(): Promise<BoardMeta[]>
    create(name: string): Promise<BoardDocument>
    load(id: string): Promise<BoardDocument>
    save(doc: BoardDocument): Promise<SaveResult>
    rename(id: string, name: string): Promise<BoardMeta>
    remove(id: string): Promise<{ ok: boolean }>
    duplicate(id: string, name: string): Promise<BoardDocument>
    exists(id: string): Promise<boolean>
  }
  recovery: {
    list(): Promise<RecoveryEntry[]>
    read(boardId: string): Promise<BoardDocument>
    write(doc: BoardDocument): Promise<{ ok: boolean }>
    clear(boardId: string): Promise<{ ok: boolean }>
  }
  io: {
    exportFile(req: ExportRequest): Promise<ExportResult>
    importImages(): Promise<ImportedImage[]>
  }
  prefs: {
    get(): Promise<AppPreferences>
    set(patch: Partial<AppPreferences>): Promise<AppPreferences>
  }
  app: {
    info(): Promise<AppInfo>
    flushDone(): void
    /** Run a window/app-level command. Rejects an unknown command. */
    command(command: AppCommand): Promise<void>
    /** Repaint the native window-control overlay to match the resolved theme. */
    setTitlebarTheme(theme: TitlebarTheme): Promise<void>
    onBeforeQuit(cb: () => void): () => void
    onMenuCommand(cb: (command: MenuCommand) => void): () => void
  }
}
