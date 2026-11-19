import { useEffect } from 'react'
import type { MenuCommand } from '@shared/ipc-contract'
import { prefsService } from '@/services/boardService'
import { appService } from '@/services/boardService'
import { importImagesAt } from '@/services/imageImport'
import { viewportActions } from '@/services/viewportActions'
import { runExport } from '@/hooks/useKeyboardShortcuts'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import type { BoardOperations } from './useBoardOperations'

/**
 * Dispatch a menu command.
 *
 * Exported as a plain function, not just used inside the hook, because there
 * are now two sources of menu commands: clicks on the native macOS menu (which
 * arrive over IPC) and clicks on the in-app titlebar menu (which call this
 * directly). Both routes end up in the same switch, so the two menus cannot
 * drift apart.
 */
export function runMenuCommand(command: MenuCommand, operations: BoardOperations): void {
  const board = useBoardStore.getState()
  const ui = useUiStore.getState()

  switch (command) {
    case 'new-board':
      void operations.createBoard()
      return
    case 'open-board':
      ui.toggleBoardsPanel()
      return
    case 'save':
      void operations.saveNow()
      return

    case 'export-png':
      void runExport('png')
      return
    case 'export-svg':
      void runExport('svg')
      return
    case 'export-pdf':
      void runExport('pdf')
      return
    case 'import-image':
      void importImagesAt(viewportActions.worldCentre())
      return

    case 'undo':
      board.undo()
      return
    case 'redo':
      board.redo()
      return
    case 'select-all':
      board.selectAll()
      return
    case 'duplicate':
      if (board.selectedIds.length === 0) return
      board.snapshot()
      useBoardStore.getState().duplicateShapes(board.selectedIds)
      return
    case 'delete':
      if (board.selectedIds.length === 0) return
      board.snapshot()
      board.removeShapes(board.selectedIds)
      return
    case 'group':
      if (board.selectedIds.length < 2) return
      board.snapshot()
      board.groupShapes(board.selectedIds)
      return
    case 'ungroup':
      board.snapshot()
      board.ungroupShapes(board.selectedIds)
      return

    case 'zoom-in':
      viewportActions.zoomIn()
      return
    case 'zoom-out':
      viewportActions.zoomOut()
      return
    case 'zoom-reset':
      viewportActions.resetZoom()
      return
    case 'zoom-fit':
      viewportActions.fitToContent()
      return

    case 'toggle-theme': {
      const next = ui.resolvedTheme === 'dark' ? 'light' : 'dark'
      ui.setThemePreference(next)
      void prefsService.set({ theme: next })
      return
    }
    case 'toggle-grid': {
      const next = !ui.showGrid
      ui.setShowGrid(next)
      void prefsService.set({ showGrid: next })
      return
    }

    default:
      return
  }
}

/**
 * Subscribe to native-menu clicks.
 *
 * The menu items carry accelerators for discoverability but set
 * `registerAccelerator: false`, so the keyboard is owned by
 * `useKeyboardShortcuts` and only *clicks* arrive here.
 */
export function useMenuCommands(operations: BoardOperations): void {
  useEffect(() => {
    return appService.onMenuCommand((command) => runMenuCommand(command, operations))
  }, [operations])
}
