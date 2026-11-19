import { useEffect } from 'react'
import { prefsService } from '@/services/boardService'
import { exportBoard, type ExportFormat } from '@/services/exportService'
import { importImagesAt } from '@/services/imageImport'
import { viewportActions } from '@/services/viewportActions'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import { cloneShape } from '@/lib/shape-factory'
import { TOOL_BY_SHORTCUT } from '@/types/tools'
import type { Shape } from '@/types/board'
import type { BoardOperations } from './useBoardOperations'

/**
 * Every keyboard shortcut in the app, in one place.
 *
 * The native menu deliberately sets `registerAccelerator: false` for the same
 * commands, so the menu shows the shortcut but does not claim the key. One
 * handler owns the keyboard, which is why Ctrl+Z never undoes twice.
 */

/** Shapes copied with Ctrl+C, held in memory rather than the system clipboard. */
let clipboard: Shape[] = []

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  if (element.isContentEditable) return true
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function copySelection(): void {
  const board = useBoardStore.getState()
  if (board.selectedIds.length === 0) return
  const picked = board.shapes.filter((shape) => board.selectedIds.includes(shape.id))
  clipboard = picked.map(cloneShape)
  useUiStore.getState().pushToast(`Copied ${picked.length} object${picked.length === 1 ? '' : 's'}`)
}

function pasteClipboard(): void {
  if (clipboard.length === 0) return
  const board = useBoardStore.getState()

  // Re-issue ids so repeated pastes do not collide.
  const pasted = clipboard.map((shape) => {
    const copy = cloneShape(shape)
    copy.id = `${shape.id}_p${Math.random().toString(16).slice(2, 10)}`
    copy.x += 24
    copy.y += 24
    return copy
  })

  board.snapshot()
  board.addShapes(pasted, { select: true })
  // Subsequent pastes cascade instead of stacking on the same spot.
  clipboard = pasted.map(cloneShape)
}

export function useKeyboardShortcuts(operations: BoardOperations): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const ui = useUiStore.getState()
      const board = useBoardStore.getState()
      const mod = event.ctrlKey || event.metaKey

      // Escape must work even while typing, so it is handled before the
      // editable-target check. The text overlay stops its own Escape first.
      if (event.key === 'Escape') {
        if (ui.editingId) return
        if (board.selectedIds.length > 0) {
          board.clearSelection()
          return
        }
        ui.setTool('select')
        return
      }

      if (isEditableTarget(event.target)) return

      // Space-to-pan, released on keyup below.
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        ui.setSpacePanning(true)
        return
      }

      if (mod) {
        const key = event.key.toLowerCase()
        switch (key) {
          case 'z':
            event.preventDefault()
            if (event.shiftKey) board.redo()
            else board.undo()
            return
          case 'y':
            event.preventDefault()
            board.redo()
            return
          case 'a':
            event.preventDefault()
            board.selectAll()
            return
          case 'd': {
            event.preventDefault()
            if (board.selectedIds.length === 0) return
            board.snapshot()
            useBoardStore.getState().duplicateShapes(board.selectedIds)
            return
          }
          case 's':
            event.preventDefault()
            void operations.saveNow()
            return
          case 'g':
            event.preventDefault()
            if (event.shiftKey) board.ungroupShapes(board.selectedIds)
            else board.groupShapes(board.selectedIds)
            return
          case 'c':
            event.preventDefault()
            copySelection()
            return
          case 'x': {
            event.preventDefault()
            if (board.selectedIds.length === 0) return
            copySelection()
            board.snapshot()
            board.removeShapes(board.selectedIds)
            return
          }
          case 'v':
            event.preventDefault()
            pasteClipboard()
            return
          case 'n':
            event.preventDefault()
            void operations.createBoard()
            return
          case 'o':
            event.preventDefault()
            ui.toggleBoardsPanel()
            return
          case 'i':
            event.preventDefault()
            void importImagesAt(viewportActions.worldCentre())
            return
          case 'e':
            if (!event.shiftKey) return
            event.preventDefault()
            void runExport('png')
            return
          case 'l':
            if (!event.shiftKey) return
            event.preventDefault()
            ui.setThemePreference(ui.resolvedTheme === 'dark' ? 'light' : 'dark')
            void prefsService.set({ theme: ui.resolvedTheme === 'dark' ? 'light' : 'dark' })
            return
          case '0':
            event.preventDefault()
            viewportActions.resetZoom()
            return
          case '1':
            event.preventDefault()
            viewportActions.fitToContent()
            return
          case '=':
          case '+':
            event.preventDefault()
            viewportActions.zoomIn()
            return
          case '-':
            event.preventDefault()
            viewportActions.zoomOut()
            return
          default:
            return
        }
      }

      if (event.altKey) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (board.selectedIds.length === 0) return
        event.preventDefault()
        board.snapshot()
        board.removeShapes(board.selectedIds)
        return
      }

      if (event.key === '?' || event.key === '/') {
        event.preventDefault()
        ui.setShortcutsOpen(!ui.shortcutsOpen)
        return
      }

      const tool = TOOL_BY_SHORTCUT[event.key.toLowerCase()]
      if (tool) {
        event.preventDefault()
        ui.setTool(tool)
      }
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') useUiStore.getState().setSpacePanning(false)
    }

    // A window blur means no keyup will arrive for a held Space.
    const onBlur = (): void => useUiStore.getState().setSpacePanning(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [operations])
}

/** Shared by the keyboard and the export dialog. */
export async function runExport(format: ExportFormat): Promise<void> {
  const ui = useUiStore.getState()
  try {
    const result = await exportBoard(format, {
      includeBackground: true,
      padding: 40
    })
    if (result.canceled) return
    ui.pushToast(`Exported ${format.toUpperCase()}`, 'success')
  } catch (error) {
    ui.pushToast(
      `Export failed: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
  }
}
