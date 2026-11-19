import { useEffect, useState } from 'react'
import type { RecoveryEntry } from '@shared/ipc-contract'
import { BoardsPanel } from '@/components/BoardsPanel'
import { CanvasStage } from '@/components/canvas/CanvasStage'
import { StatusBar } from '@/components/StatusBar'
import { StylePanel } from '@/components/StylePanel'
import { Toasts } from '@/components/Toasts'
import { Toolbar } from '@/components/Toolbar'
import { TopBar } from '@/components/TopBar'
import { ExportDialog } from '@/components/dialogs/ExportDialog'
import { RecoveryDialog } from '@/components/dialogs/RecoveryDialog'
import { ShortcutsDialog } from '@/components/dialogs/ShortcutsDialog'
import { useAutosave } from '@/hooks/useAutosave'
import { useBoardOperations } from '@/hooks/useBoardOperations'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useMenuCommands } from '@/hooks/useMenuCommands'
import { useTheme } from '@/hooks/useTheme'
import { boardService, prefsService, recoveryService } from '@/services/boardService'
import { canvasRegistry } from '@/services/canvasRegistry'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'

/**
 * Application shell.
 *
 * Boot order matters and is deliberate:
 *
 *  1. read preferences (theme first, so the window never flashes the wrong colour)
 *  2. look for crash-recovery snapshots — before opening anything, so the
 *     prompt is on screen by the time the board renders
 *  3. open the last board, the most recent board, or a fresh one
 *
 * The shell renders immediately and hydrates when step 3 resolves. Rendering
 * before the document exists is safe because every write path in the store and
 * the autosave guard on a non-empty board id.
 */
export function App(): React.JSX.Element {
  const operations = useBoardOperations()
  // Installs the theme side effect; the toggle itself lives in the header.
  useTheme()
  useAutosave(operations)
  useKeyboardShortcuts(operations)
  useMenuCommands(operations)

  const boardsPanelOpen = useUiStore((state) => state.boardsPanelOpen)
  const stylePanelOpen = useUiStore((state) => state.stylePanelOpen)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const ui = useUiStore.getState()

      try {
        const preferences = await prefsService.get()
        if (cancelled) return
        ui.applyPreferences(preferences)

        let recoveries: RecoveryEntry[] = []
        try {
          recoveries = await recoveryService.list()
        } catch {
          /* nothing to recover */
        }
        if (cancelled) return
        if (recoveries.length > 0) ui.setRecoveryEntries(recoveries)

        const boards = await boardService.list()
        if (cancelled) return

        const preferred = preferences.lastBoardId
          ? boards.find((board) => board.id === preferences.lastBoardId)
          : undefined

        const document = preferred
          ? await boardService.load(preferred.id)
          : boards[0]
            ? await boardService.load(boards[0].id)
            : await boardService.create('Untitled board')

        if (cancelled) return
        operations.hydrate(document)
        void prefsService.set({ lastBoardId: document.id })
        await operations.refreshList()
      } catch (error) {
        ui.pushToast(
          `Startup failed: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        )
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
    // Runs once: `operations` is rebuilt on every render but its members are
    // stable callbacks, and re-running boot would reload the board mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Centre a brand-new board's origin instead of leaving it in the top-left
  // corner. Deferred to here because it needs the canvas to be measured.
  useEffect(() => {
    if (!ready) return
    const board = useBoardStore.getState()
    if (board.shapes.length > 0) return
    if (board.viewport.x !== 0 || board.viewport.y !== 0) return

    const element = canvasRegistry.container
    if (!element) return
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    board.setViewport({ x: Math.round(rect.width / 2), y: Math.round(rect.height / 2), scale: 1 })
  }, [ready])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <TopBar operations={operations} />

      <div className="flex min-h-0 flex-1">
        <Toolbar />
        {boardsPanelOpen && <BoardsPanel operations={operations} />}

        <main className="relative min-w-0 flex-1">
          <CanvasStage />
          {!ready && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-neutral-950/70">
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-500" />
                Opening your board…
              </div>
            </div>
          )}
        </main>

        {stylePanelOpen && <StylePanel />}
      </div>

      <StatusBar />

      <Toasts />
      <ExportDialog />
      <ShortcutsDialog />
      <RecoveryDialog onRestored={() => operations.refreshList()} />
    </div>
  )
}
