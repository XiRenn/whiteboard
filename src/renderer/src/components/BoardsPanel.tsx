import { useMemo, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { formatBytes, formatRelativeTime, pluralize } from '@/lib/format'
import type { BoardOperations } from '@/hooks/useBoardOperations'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'

/**
 * Board library: create, open, rename, duplicate, delete, plus a filter box.
 *
 * Renaming happens inline (double-click the name, or the pencil) rather than in
 * a modal — the board name is short and modal dialogs for a one-line edit feel
 * heavier than the task deserves.
 */
export function BoardsPanel({ operations }: { operations: BoardOperations }): React.JSX.Element {
  const boards = useUiStore((state) => state.boards)
  const loading = useUiStore((state) => state.boardsLoading)
  const currentId = useBoardStore((state) => state.boardId)
  const dirty = useBoardStore((state) => state.dirty)

  const [filter, setFilter] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return boards
    return boards.filter((board) => board.name.toLowerCase().includes(needle))
  }, [boards, filter])

  const startRename = (id: string, name: string): void => {
    setRenamingId(id)
    setDraftName(name)
  }

  const commitRename = async (): Promise<void> => {
    const id = renamingId
    const name = draftName
    setRenamingId(null)
    if (!id) return
    await operations.renameBoard(id, name)
  }

  return (
    <aside
      className="flex w-65 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950/40"
      aria-label="Boards"
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Boards
        </h2>
        <div className="flex items-center gap-0.5">
          <IconButton label="Refresh list" size="sm" onClick={() => void operations.refreshList()}>
            <Icon name="redo" size={15} />
          </IconButton>
          <IconButton label="New board (Ctrl+N)" size="sm" onClick={() => void operations.createBoard()}>
            <Icon name="plus" size={16} />
          </IconButton>
        </div>
      </header>

      <div className="px-3 pb-2">
        <div className="relative">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter boards"
            aria-label="Filter boards"
            className="w-full rounded-lg border border-neutral-200 bg-white py-1.5 pl-7 pr-2 text-xs text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && boards.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-neutral-400">Loading…</p>
        )}

        {!loading && visible.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-neutral-400">
            {boards.length === 0 ? 'No boards yet.' : 'No boards match that filter.'}
          </p>
        )}

        <ul className="space-y-1">
          {visible.map((board) => {
            const isCurrent = board.id === currentId
            const isRenaming = renamingId === board.id
            const isDeleting = pendingDelete === board.id

            return (
              <li key={board.id}>
                <div
                  className={`group rounded-lg border px-2.5 py-2 transition-colors ${
                    isCurrent
                      ? 'border-indigo-300 bg-indigo-50/80 dark:border-indigo-700/70 dark:bg-indigo-950/40'
                      : 'border-transparent hover:border-neutral-200 hover:bg-white dark:hover:border-neutral-700 dark:hover:bg-neutral-900'
                  }`}
                >
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === 'Enter') void commitRename()
                        if (event.key === 'Escape') setRenamingId(null)
                      }}
                      className="w-full rounded border border-indigo-400 bg-white px-1.5 py-1 text-xs text-neutral-900 outline-none dark:bg-neutral-900 dark:text-neutral-100"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => void operations.openBoard(board.id)}
                      onDoubleClick={() => startRename(board.id, board.name)}
                      className="block w-full text-left"
                      title={board.name}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-100">
                          {board.name}
                        </span>
                        {isCurrent && dirty && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                            title="Unsaved changes"
                          />
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-neutral-400 dark:text-neutral-500">
                        {formatRelativeTime(board.updatedAt)} · {pluralize(board.shapeCount, 'object')} ·{' '}
                        {formatBytes(board.sizeBytes)}
                      </span>
                    </button>
                  )}

                  {!isRenaming && (
                    <div
                      className={`mt-1.5 flex items-center gap-0.5 ${
                        isDeleting ? '' : 'opacity-0 transition-opacity group-hover:opacity-100'
                      }`}
                    >
                      {isDeleting ? (
                        <>
                          <span className="mr-1 text-[10px] text-red-500">Delete permanently?</span>
                          <Button
                            size="sm"
                            tone="danger"
                            onClick={() => {
                              setPendingDelete(null)
                              void operations.deleteBoard(board.id)
                            }}
                          >
                            Yes
                          </Button>
                          <Button size="sm" tone="ghost" onClick={() => setPendingDelete(null)}>
                            No
                          </Button>
                        </>
                      ) : (
                        <>
                          <IconButton
                            label="Rename"
                            size="sm"
                            onClick={() => startRename(board.id, board.name)}
                          >
                            <Icon name="edit" size={14} />
                          </IconButton>
                          <IconButton
                            label="Duplicate"
                            size="sm"
                            onClick={() => void operations.duplicateBoard(board.id)}
                          >
                            <Icon name="copy" size={14} />
                          </IconButton>
                          <IconButton
                            label="Delete"
                            size="sm"
                            tone="danger"
                            onClick={() => setPendingDelete(board.id)}
                          >
                            <Icon name="trash" size={14} />
                          </IconButton>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <footer className="border-t border-neutral-200 px-3 py-2 text-[10px] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
        Boards are stored as JSON in your user data folder. No account, no cloud.
      </footer>
    </aside>
  )
}
