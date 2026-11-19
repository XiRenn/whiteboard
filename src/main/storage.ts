import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  BOARD_ID_PATTERN,
  MAX_BOARD_BYTES,
  type AppPreferences,
  type BoardDocument,
  type BoardMeta,
  type RecoveryEntry
} from '@shared/ipc-contract'

/**
 * All filesystem access for the application lives here.
 *
 * Layout under `app.getPath('userData')`:
 *
 *   boards/<id>.board.json       durable board documents
 *   boards/<id>.board.json.tmp   write journal — only present if a write was cut short
 *   recovery/<id>.json           heartbeat snapshot, deleted on clean shutdown
 *   preferences.json             theme, last opened board, grid settings
 *
 * Nothing in this module accepts a path from the renderer. Every path is derived
 * from a board id that has already passed BOARD_ID_PATTERN, which cannot contain
 * a separator, a dot or a backslash — so traversal is structurally impossible
 * rather than filtered.
 */

// ------------------------------------------------------------------ paths ---

const userData = (): string => app.getPath('userData')
const boardsDir = (): string => join(userData(), 'boards')
const recoveryDir = (): string => join(userData(), 'recovery')
const prefsPath = (): string => join(userData(), 'preferences.json')

// These take `unknown` because they validate internally via `assertBoardId`.
// Keeping the validation inside the path builders means there is no way to
// construct a board path without passing the guard first.
const boardFile = (id: unknown): string => join(boardsDir(), `${assertBoardId(id)}.board.json`)
const boardTmpFile = (id: unknown): string => `${boardFile(id)}.tmp`
const recoveryFile = (id: unknown): string => join(recoveryDir(), `${assertBoardId(id)}.json`)

export async function ensureDirs(): Promise<void> {
  await Promise.all([
    fs.mkdir(boardsDir(), { recursive: true }),
    fs.mkdir(recoveryDir(), { recursive: true })
  ])
}

// -------------------------------------------------------------- validation ---

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function assertBoardId(id: unknown): string {
  if (typeof id !== 'string' || !BOARD_ID_PATTERN.test(id)) {
    throw new ValidationError(`Invalid board id: ${String(id).slice(0, 40)}`)
  }
  return id
}

/** Strip control characters and collapse whitespace; enforce a sane length. */
export function sanitizeBoardName(name: unknown): string {
  if (typeof name !== 'string') return 'Untitled board'
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Untitled board'
  return cleaned.slice(0, 120)
}

/**
 * Make a string safe to use as a file name on Windows, macOS and Linux.
 * Applied to user-supplied export names only — board files use ids.
 */
export function sanitizeFileName(name: unknown, fallback = 'whiteboard'): string {
  if (typeof name !== 'string') return fallback
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows rejects names ending in a dot or space.
    .replace(/[. ]+$/, '')
    .slice(0, 120)
  return cleaned || fallback
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Validate an untrusted board document coming from the renderer.
 * Rejects anything that would produce a corrupt file on disk.
 */
export function validateBoardDocument(input: unknown): BoardDocument {
  if (!input || typeof input !== 'object') throw new ValidationError('Board payload must be an object')
  const doc = input as Record<string, unknown>

  if (doc.version !== 1) throw new ValidationError('Unsupported board version')

  const id = assertBoardId(doc.id)
  const name = sanitizeBoardName(doc.name)

  if (!isFiniteNumber(doc.createdAt) && typeof doc.createdAt !== 'string') {
    throw new ValidationError('Board is missing createdAt')
  }

  const viewport = doc.viewport as Record<string, unknown> | undefined
  if (
    !viewport ||
    typeof viewport !== 'object' ||
    !isFiniteNumber(viewport.x) ||
    !isFiniteNumber(viewport.y) ||
    !isFiniteNumber(viewport.scale) ||
    viewport.scale <= 0
  ) {
    throw new ValidationError('Board viewport is malformed')
  }

  if (!Array.isArray(doc.shapes)) throw new ValidationError('Board shapes must be an array')

  const normalized: BoardDocument = {
    version: 1,
    id,
    name,
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : new Date().toISOString(),
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : new Date().toISOString(),
    viewport: {
      x: viewport.x as number,
      y: viewport.y as number,
      scale: Math.min(Math.max(viewport.scale as number, 0.02), 64)
    },
    shapes: doc.shapes
  }

  // Size guard: measured on the exact bytes we are about to persist.
  const bytes = Buffer.byteLength(JSON.stringify(normalized), 'utf8')
  if (bytes > MAX_BOARD_BYTES) {
    throw new ValidationError(
      `Board is too large to save (${(bytes / 1024 / 1024).toFixed(1)} MB, limit ${
        MAX_BOARD_BYTES / 1024 / 1024
      } MB)`
    )
  }

  return normalized
}

// -------------------------------------------------------------- write layer ---

/**
 * Write-then-rename. The rename is atomic on every platform we target, so a
 * crash can never leave a half-written board file — at worst it leaves a `.tmp`
 * journal that still contains a complete document, which the recovery scan
 * picks up on the next launch.
 */
async function atomicWrite(file: string, data: string): Promise<number> {
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, data, 'utf8')
  await fs.rename(tmp, file)
  return Buffer.byteLength(data, 'utf8')
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

// ------------------------------------------------------------ board access ---

export async function createBoard(rawName: unknown): Promise<BoardDocument> {
  await ensureDirs()
  const now = new Date().toISOString()
  const doc: BoardDocument = {
    version: 1,
    id: randomUUID(),
    name: sanitizeBoardName(rawName),
    createdAt: now,
    updatedAt: now,
    viewport: { x: 0, y: 0, scale: 1 },
    shapes: []
  }
  await writeBoard(doc)
  return doc
}

export async function readBoard(id: unknown): Promise<BoardDocument> {
  const safeId = assertBoardId(id)
  const raw = await readJson<unknown>(boardFile(safeId))
  if (!raw) throw new Error(`Board ${safeId} could not be read`)

  // A board read from disk is still validated — a hand-edited or truncated file
  // must surface as a clean error rather than crashing the renderer.
  const doc = validateBoardDocument(raw)
  return { ...doc, id: safeId }
}

export async function writeBoard(input: unknown): Promise<{ savedAt: string; sizeBytes: number }> {
  await ensureDirs()
  const doc = validateBoardDocument(input)
  const savedAt = new Date().toISOString()
  const payload: BoardDocument = { ...doc, updatedAt: savedAt }
  const sizeBytes = await atomicWrite(boardFile(doc.id), JSON.stringify(payload))
  return { savedAt, sizeBytes }
}

export async function renameBoard(id: unknown, name: unknown): Promise<BoardMeta> {
  const doc = await readBoard(id)
  const renamed: BoardDocument = { ...doc, name: sanitizeBoardName(name), updatedAt: new Date().toISOString() }
  await writeBoard(renamed)
  return toMeta(renamed, Buffer.byteLength(JSON.stringify(renamed), 'utf8'))
}

export async function deleteBoard(id: unknown): Promise<void> {
  const safeId = assertBoardId(id)
  await Promise.all([
    fs.rm(boardFile(safeId), { force: true }),
    fs.rm(boardTmpFile(safeId), { force: true }),
    fs.rm(recoveryFile(safeId), { force: true })
  ])
}

export async function duplicateBoard(id: unknown, name: unknown): Promise<BoardDocument> {
  const source = await readBoard(id)
  const now = new Date().toISOString()
  const copy: BoardDocument = {
    ...source,
    id: randomUUID(),
    name: sanitizeBoardName(name),
    createdAt: now,
    updatedAt: now
  }
  await writeBoard(copy)
  return copy
}

export async function boardExists(id: unknown): Promise<boolean> {
  try {
    await fs.access(boardFile(id))
    return true
  } catch {
    return false
  }
}

function toMeta(doc: BoardDocument, sizeBytes: number): BoardMeta {
  return {
    id: doc.id,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    shapeCount: Array.isArray(doc.shapes) ? doc.shapes.length : 0,
    sizeBytes
  }
}

export async function listBoards(): Promise<BoardMeta[]> {
  await ensureDirs()
  let entries: string[]
  try {
    entries = await fs.readdir(boardsDir())
  } catch {
    return []
  }

  const metas: BoardMeta[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.board.json')) continue
    const full = join(boardsDir(), entry)
    try {
      const [text, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)])
      const doc = JSON.parse(text) as BoardDocument
      if (doc && typeof doc.id === 'string' && Array.isArray(doc.shapes)) {
        metas.push(toMeta({ ...doc, name: sanitizeBoardName(doc.name) }, stat.size))
      }
    } catch {
      // A single unreadable board must not break the whole list; the file is
      // left on disk so the user can recover it by hand.
      console.warn(`[storage] skipping unreadable board file: ${entry}`)
    }
  }

  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

// ---------------------------------------------------------------- recovery ---

export async function writeRecovery(input: unknown): Promise<void> {
  const doc = validateBoardDocument(input)
  await ensureDirs()
  await atomicWrite(recoveryFile(doc.id), JSON.stringify(doc))
}

export async function clearRecovery(id: unknown): Promise<void> {
  const safeId = assertBoardId(id)
  await Promise.all([
    fs.rm(recoveryFile(safeId), { force: true }),
    // A journal file only exists when a write was interrupted; clearing it is
    // the caller acknowledging that the snapshot has been dealt with.
    fs.rm(boardTmpFile(safeId), { force: true })
  ])
}

/**
 * Called on a clean shutdown. Removes every heartbeat snapshot so that the next
 * launch does not offer to recover a session that ended normally.
 */
export async function clearAllRecovery(): Promise<void> {
  try {
    const entries = await fs.readdir(recoveryDir())
    await Promise.all(entries.map((e) => fs.rm(join(recoveryDir(), e), { force: true })))
  } catch {
    /* directory may not exist yet */
  }
}

export async function listRecovery(): Promise<RecoveryEntry[]> {
  await ensureDirs()
  const found = new Map<string, RecoveryEntry>()

  // 1. Heartbeat snapshots.
  try {
    for (const entry of await fs.readdir(recoveryDir())) {
      if (!entry.endsWith('.json')) continue
      const doc = await readJson<BoardDocument>(join(recoveryDir(), entry))
      if (!doc || typeof doc.id !== 'string' || !BOARD_ID_PATTERN.test(doc.id)) continue
      found.set(doc.id, {
        boardId: doc.id,
        boardName: sanitizeBoardName(doc.name),
        savedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : new Date(0).toISOString(),
        shapeCount: Array.isArray(doc.shapes) ? doc.shapes.length : 0,
        fromJournal: false
      })
    }
  } catch {
    /* nothing to recover */
  }

  // 2. Interrupted writes. These take precedence: the journal is written
  //    immediately before the rename, so it is never older than the heartbeat.
  try {
    for (const entry of await fs.readdir(boardsDir())) {
      if (!entry.endsWith('.board.json.tmp')) continue
      const doc = await readJson<BoardDocument>(join(boardsDir(), entry))
      if (!doc || typeof doc.id !== 'string' || !BOARD_ID_PATTERN.test(doc.id)) continue
      found.set(doc.id, {
        boardId: doc.id,
        boardName: sanitizeBoardName(doc.name),
        savedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : new Date(0).toISOString(),
        shapeCount: Array.isArray(doc.shapes) ? doc.shapes.length : 0,
        fromJournal: true
      })
    }
  } catch {
    /* nothing to recover */
  }

  return [...found.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

/** Read the snapshot the recovery entry refers to (journal first, then heartbeat). */
export async function readRecoverySnapshot(id: unknown): Promise<BoardDocument> {
  const safeId = assertBoardId(id)
  const fromJournal = await readJson<unknown>(boardTmpFile(safeId))
  const candidate = fromJournal ?? (await readJson<unknown>(recoveryFile(safeId)))
  if (!candidate) throw new Error(`No recovery snapshot found for board ${safeId}`)
  return { ...validateBoardDocument(candidate), id: safeId }
}

// ------------------------------------------------------------- preferences ---

const DEFAULT_PREFS: AppPreferences = {
  theme: 'system',
  lastBoardId: null,
  showGrid: true,
  snapToGrid: false,
  gridSize: 24,
  autosaveEnabled: true
}

function coercePrefs(raw: unknown): AppPreferences {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const theme = input.theme
  return {
    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : DEFAULT_PREFS.theme,
    lastBoardId:
      typeof input.lastBoardId === 'string' && BOARD_ID_PATTERN.test(input.lastBoardId)
        ? input.lastBoardId
        : null,
    showGrid: typeof input.showGrid === 'boolean' ? input.showGrid : DEFAULT_PREFS.showGrid,
    snapToGrid: typeof input.snapToGrid === 'boolean' ? input.snapToGrid : DEFAULT_PREFS.snapToGrid,
    gridSize:
      isFiniteNumber(input.gridSize) && input.gridSize >= 4 && input.gridSize <= 400
        ? Math.round(input.gridSize)
        : DEFAULT_PREFS.gridSize,
    autosaveEnabled:
      typeof input.autosaveEnabled === 'boolean' ? input.autosaveEnabled : DEFAULT_PREFS.autosaveEnabled
  }
}

export async function readPrefs(): Promise<AppPreferences> {
  return coercePrefs(await readJson<unknown>(prefsPath()))
}

export async function writePrefs(patch: unknown): Promise<AppPreferences> {
  await ensureDirs()
  const current = await readPrefs()
  const merged = coercePrefs({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) })
  await atomicWrite(prefsPath(), JSON.stringify(merged, null, 2))
  return merged
}

export { DEFAULT_PREFS }
