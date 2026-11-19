import { useCallback, useEffect } from 'react'
import type { BoardDocument } from '@shared/ipc-contract'
import { boardService, prefsService, recoveryService } from '@/services/boardService'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'

/**
 * Board lifecycle: open, create, rename, duplicate, delete, save.
 *
 * The rule that matters here is **always persist before switching**. Every
 * operation that replaces the current document calls `saveNow()` first, so
 * moving between boards can never drop work. The one exception is deleting the
 * board you are currently on — saving it first would immediately recreate the
 * file you just removed, so that path marks the document clean instead.
 */

export interface BoardOperations {
  openBoard: (id: string) => Promise<void>
  createBoard: (name?: string) => Promise<void>
  renameBoard: (id: string, name: string) => Promise<void>
  duplicateBoard: (id: string) => Promise<void>
  deleteBoard: (id: string) => Promise<void>
  saveNow: () => Promise<boolean>
  refreshList: () => Promise<void>
  hydrate: (doc: BoardDocument) => void
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useBoardOperations(): BoardOperations {
  const refreshList = useCallback(async (): Promise<void> => {
    const ui = useUiStore.getState()
    ui.setBoardsLoading(true)
    try {
      ui.setBoards(await boardService.list())
    } catch (error) {
      ui.pushToast(`Could not read the board list: ${messageOf(error)}`, 'error')
    } finally {
      ui.setBoardsLoading(false)
    }
  }, [])

  const hydrate = useCallback((doc: BoardDocument): void => {
    useBoardStore.getState().hydrate(doc)
    useUiStore.getState().setEditingId(null)
  }, [])

  const saveNow = useCallback(async (): Promise<boolean> => {
    const board = useBoardStore.getState()
    const ui = useUiStore.getState()

    if (!board.boardId) return false
    if (!board.dirty) {
      ui.setSaveState('saved')
      return true
    }

    ui.setSaveState('saving')
    try {
      const result = await boardService.save(board.toDocument())
      // Re-read the store: the user may have kept drawing while the write was
      // in flight, in which case the document is legitimately dirty again.
      const current = useBoardStore.getState()
      current.markSaved(result.savedAt)
      ui.setSaveState('saved')
      void refreshList()
      return true
    } catch (error) {
      ui.setSaveState('error', messageOf(error))
      ui.pushToast(`Save failed: ${messageOf(error)}`, 'error')
      return false
    }
  }, [refreshList])

  const openBoard = useCallback(
    async (id: string): Promise<void> => {
      const current = useBoardStore.getState()
      if (current.boardId === id) return

      await saveNow()
      try {
        const doc = await boardService.load(id)
        hydrate(doc)
        void prefsService.set({ lastBoardId: id })
        // The board was loaded deliberately, so any stale crash snapshot for it
        // has served its purpose.
        void recoveryService.clear(id).catch(() => {})
      } catch (error) {
        useUiStore.getState().pushToast(`Could not open the board: ${messageOf(error)}`, 'error')
      }
    },
    [hydrate, saveNow]
  )

  const createBoard = useCallback(
    async (name?: string): Promise<void> => {
      await saveNow()
      const existing = useUiStore.getState().boards.length
      const label = name ?? `Untitled board ${existing + 1}`
      try {
        const doc = await boardService.create(label)
        hydrate(doc)
        void prefsService.set({ lastBoardId: doc.id })
        await refreshList()
        useUiStore.getState().pushToast(`Created “${doc.name}”`, 'success')
      } catch (error) {
        useUiStore.getState().pushToast(`Could not create the board: ${messageOf(error)}`, 'error')
      }
    },
    [hydrate, refreshList, saveNow]
  )

  const renameBoard = useCallback(
    async (id: string, name: string): Promise<void> => {
      const trimmed = name.trim()
      if (!trimmed) return
      try {
        if (useBoardStore.getState().boardId === id) {
          useBoardStore.getState().setName(trimmed)
          await saveNow()
        } else {
          await boardService.rename(id, trimmed)
        }
        await refreshList()
      } catch (error) {
        useUiStore.getState().pushToast(`Rename failed: ${messageOf(error)}`, 'error')
      }
    },
    [refreshList, saveNow]
  )

  const duplicateBoard = useCallback(
    async (id: string): Promise<void> => {
      const source = useUiStore.getState().boards.find((board) => board.id === id)
      const label = `${source?.name ?? 'Board'} copy`
      try {
        const copy = await boardService.duplicate(id, label)
        await refreshList()
        await openBoard(copy.id)
        useUiStore.getState().pushToast(`Duplicated as “${copy.name}”`, 'success')
      } catch (error) {
        useUiStore.getState().pushToast(`Duplicate failed: ${messageOf(error)}`, 'error')
      }
    },
    [openBoard, refreshList]
  )

  const deleteBoard = useCallback(
    async (id: string): Promise<void> => {
      const board = useBoardStore.getState()
      const isCurrent = board.boardId === id

      try {
        // Clear the dirty flag first: otherwise a pending autosave would fire
        // while the delete is in flight and write the file straight back.
        if (isCurrent) board.markClean()
        await boardService.remove(id)

        if (isCurrent) {
          const remaining = await boardService.list()
          const next = remaining[0]
            ? await boardService.load(remaining[0].id)
            : await boardService.create('Untitled board')
          hydrate(next)
          void prefsService.set({ lastBoardId: next.id })
        }

        await refreshList()
        useUiStore.getState().pushToast('Board deleted', 'success')
      } catch (error) {
        useUiStore.getState().pushToast(`Delete failed: ${messageOf(error)}`, 'error')
      }
    },
    [hydrate, refreshList]
  )

  // Load the board list once on mount.
  useEffect(() => {
    void refreshList()
  }, [refreshList])

  return {
    openBoard,
    createBoard,
    renameBoard,
    duplicateBoard,
    deleteBoard,
    saveNow,
    refreshList,
    hydrate
  }
}
