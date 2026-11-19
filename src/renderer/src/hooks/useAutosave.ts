import { useEffect, useRef } from 'react'
import { AUTOSAVE_DEBOUNCE_MS, RECOVERY_HEARTBEAT_MS } from '@/lib/constants'
import { appService, boardService, recoveryService } from '@/services/boardService'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import type { BoardOperations } from './useBoardOperations'

/**
 * Persistence: autosave, crash-recovery snapshots, and the flush-before-quit
 * handshake.
 *
 * Two independent mechanisms protect the work:
 *
 * 1. **Autosave** — a debounced write of the board file itself, triggered by any
 *    change to shapes, the viewport or the name. This is the durable save.
 * 2. **Recovery snapshots** — a heartbeat written every few seconds *while the
 *    document is dirty*, into a separate directory. The main process deletes the
 *    whole directory on a clean shutdown, so a snapshot that survives to the next
 *    launch can only mean the app died unexpectedly.
 *
 * Both are flushed synchronously-ish when the window closes: the main process
 * sends `before-quit`, waits up to 2.5 seconds, and only then tears the window
 * down. Without that handshake, an in-flight debounce would be lost on quit.
 */
export function useAutosave(operations: BoardOperations): void {
  const saveTimer = useRef<number | null>(null)
  const operationsRef = useRef(operations)
  operationsRef.current = operations

  useEffect(() => {
    const clearSaveTimer = (): void => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
    }

    const scheduleSave = (): void => {
      clearSaveTimer()
      if (!useUiStore.getState().autosaveEnabled) return
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        void operationsRef.current.saveNow()
      }, AUTOSAVE_DEBOUNCE_MS)
    }

    /** Write everything that is pending, right now. */
    const flush = async (): Promise<void> => {
      clearSaveTimer()
      const board = useBoardStore.getState()
      if (!board.boardId || !board.dirty) return
      try {
        await boardService.save(board.toDocument())
        useBoardStore.getState().markSaved(new Date().toISOString())
      } catch (error) {
        console.error('[autosave] flush failed', error)
      }
    }

    // React to real content changes only. Subscribing to the store rather than
    // using a `useEffect` on the values keeps the canvas from re-rendering just
    // to arm a timer.
    const unsubscribe = useBoardStore.subscribe((state, previous) => {
      const contentChanged =
        state.shapes !== previous.shapes ||
        state.viewport !== previous.viewport ||
        state.boardName !== previous.boardName
      if (contentChanged && state.boardId) scheduleSave()
    })

    // Safety net for a long, uninterrupted editing session.
    const heartbeat = window.setInterval(() => {
      const board = useBoardStore.getState()
      if (!board.boardId || !board.dirty) return
      void recoveryService.write(board.toDocument()).catch(() => {})
    }, RECOVERY_HEARTBEAT_MS)

    // Losing focus is a strong signal the user has stepped away; get the work
    // onto disk before the machine can do anything regrettable.
    const onBlur = (): void => {
      void flush()
    }
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onBlur)

    const offBeforeQuit = appService.onBeforeQuit(() => {
      void (async () => {
        try {
          await flush()
        } finally {
          // The main process is blocked waiting on this; it must always fire,
          // even if the save threw.
          appService.flushDone()
        }
      })()
    })

    return () => {
      clearSaveTimer()
      window.clearInterval(heartbeat)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onBlur)
      unsubscribe()
      offBeforeQuit()
    }
  }, [])
}
