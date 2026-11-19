import { dialog, type BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, extname } from 'node:path'
import {
  MAX_IMAGE_BYTES,
  type ExportRequest,
  type ExportResult,
  type ImportedImage
} from '@shared/ipc-contract'
import { sanitizeFileName } from './storage'

/**
 * Native dialogs. Both directions are deliberately narrow:
 *  - export writes to a path the *user* chose in a system dialog
 *  - import reads a file the *user* chose in a system dialog
 *
 * The renderer supplies content, never a path, and receives content, never a
 * path. That keeps arbitrary filesystem reach out of the renderer entirely.
 */

/** Guard against a runaway renderer handing us an enormous buffer. */
const MAX_EXPORT_BYTES = 256 * 1024 * 1024

const EXPORT_FILTERS: Record<ExportRequest['format'], { name: string; extensions: string[] }> = {
  png: { name: 'PNG image', extensions: ['png'] },
  svg: { name: 'SVG vector image', extensions: ['svg'] },
  pdf: { name: 'PDF document', extensions: ['pdf'] },
  json: { name: 'Whiteboard board', extensions: ['json'] }
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml'
}

const IMAGE_EXTENSIONS = Object.keys(MIME_BY_EXT)
const MAX_IMPORT_COUNT = 20

export async function saveExport(
  win: BrowserWindow | null,
  req: ExportRequest
): Promise<ExportResult> {
  if (!req || typeof req !== 'object' || !(req.format in EXPORT_FILTERS)) {
    throw new Error('Unsupported export format')
  }

  const filter = EXPORT_FILTERS[req.format]
  const defaultName = `${sanitizeFileName(req.suggestedName)}.${filter.extensions[0]}`

  const options: Electron.SaveDialogOptions = {
    title: `Export as ${filter.name}`,
    defaultPath: defaultName,
    filters: [filter, { name: 'All files', extensions: ['*'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  }

  // Branch instead of passing an undefined window: Electron's overloads differ
  // between "parented" and "unparented" dialogs.
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) return { ok: false, canceled: true }

  let payload: Buffer
  if (req.format === 'svg' || req.format === 'json') {
    if (typeof req.text !== 'string') throw new Error('Export payload is missing text content')
    payload = Buffer.from(req.text, 'utf8')
  } else {
    if (!req.bytes) throw new Error('Export payload is missing binary content')
    payload = Buffer.from(req.bytes)
  }

  if (payload.byteLength > MAX_EXPORT_BYTES) {
    throw new Error(`Export payload is too large (${(payload.byteLength / 1024 / 1024).toFixed(1)} MB)`)
  }

  await fs.writeFile(result.filePath, payload)
  return { ok: true, canceled: false, filePath: result.filePath }
}

export async function importImages(win: BrowserWindow | null): Promise<ImportedImage[]> {
  const options: Electron.OpenDialogOptions = {
    title: 'Import images',
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
    properties: ['openFile', 'multiSelections']
  }

  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) return []

  const images: ImportedImage[] = []
  const skipped: string[] = []

  for (const filePath of result.filePaths.slice(0, MAX_IMPORT_COUNT)) {
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile() || stat.size === 0) {
        skipped.push(basename(filePath))
        continue
      }
      if (stat.size > MAX_IMAGE_BYTES) {
        skipped.push(`${basename(filePath)} (over ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`)
        continue
      }

      const ext = extname(filePath).slice(1).toLowerCase()
      const mime = MIME_BY_EXT[ext]
      if (!mime) {
        skipped.push(basename(filePath))
        continue
      }

      const buffer = await fs.readFile(filePath)
      images.push({
        name: basename(filePath),
        mime,
        // The renderer gets a data URL so an <img>/Konva.Image can load it with
        // no filesystem access and no network request.
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        sizeBytes: stat.size
      })
    } catch {
      skipped.push(basename(filePath))
    }
  }

  if (skipped.length > 0) {
    const warning: Electron.MessageBoxOptions = {
      type: 'warning',
      title: 'Some files were skipped',
      message: `${skipped.length} file(s) could not be imported.`,
      detail: `${skipped.join('\n')}\n\nSupported formats: ${IMAGE_EXTENSIONS.join(', ')}. Maximum size ${MAX_IMAGE_BYTES / 1024 / 1024} MB per image.`,
      buttons: ['OK']
    }
    if (win) await dialog.showMessageBox(win, warning)
    else await dialog.showMessageBox(warning)
  }

  return images
}
