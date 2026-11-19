import { createImageShape } from '@/lib/shape-factory'
import type { Point } from '@/lib/shape-geometry'
import type { Shape } from '@/types/board'
import { ioService } from './boardService'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'

/**
 * Import images through the native dialog and place them on the board.
 *
 * Shared by the canvas (click with the image tool) and the keyboard shortcut
 * (Ctrl+I, which drops them at the centre of the view). The dialog is owned by
 * the main process; the renderer only ever receives `data:` URLs, and those are
 * embedded in the board file so a board stays portable and offline.
 */

const MAX_PLACED_WIDTH = 520
const CASCADE_OFFSET = 28

function measure(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Image could not be decoded'))
    image.src = dataUrl
  })
}

export async function importImagesAt(world: Point): Promise<void> {
  const ui = useUiStore.getState()

  let imported
  try {
    imported = await ioService.importImages()
  } catch (error) {
    ui.pushToast(error instanceof Error ? error.message : 'Image import failed', 'error')
    return
  }

  if (imported.length === 0) return

  const created: Shape[] = []
  let offset = 0

  for (const item of imported) {
    try {
      const intrinsic = await measure(item.dataUrl)
      const factor = Math.min(1, MAX_PLACED_WIDTH / Math.max(intrinsic.width, 1))
      created.push(
        createImageShape(
          world.x + offset,
          world.y + offset,
          Math.max(1, Math.round(intrinsic.width * factor)),
          Math.max(1, Math.round(intrinsic.height * factor)),
          item.dataUrl,
          item.name
        )
      )
      offset += CASCADE_OFFSET
    } catch {
      ui.pushToast(`${item.name} could not be decoded`, 'error')
    }
  }

  if (created.length === 0) return

  const board = useBoardStore.getState()
  board.snapshot()
  board.addShapes(created, { select: true })
  useUiStore.getState().setTool('select')
  useUiStore
    .getState()
    .pushToast(`Imported ${created.length} image${created.length === 1 ? '' : 's'}`, 'success')
}
