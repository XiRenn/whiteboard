import { useEffect, useState } from 'react'
import { Button, Divider, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { TitleBarMenu } from '@/components/TitleBarMenu'
import { IS_MAC } from '@/lib/platform'
import { formatRelativeTime } from '@/lib/format'
import { importImagesAt } from '@/services/imageImport'
import { viewportActions } from '@/services/viewportActions'
import { useTheme } from '@/hooks/useTheme'
import type { BoardOperations } from '@/hooks/useBoardOperations'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import { isDesktop } from '@/services/boardService'

/**
 * Application header: board identity on the left, actions on the right.
 *
 * The board name is a real input that looks like a label until focused, so
 * renaming is one click rather than a dialog. It commits on blur and on Enter,
 * and reverts on Escape.
 */
export function TopBar({ operations }: { operations: BoardOperations }): React.JSX.Element {
  const boardName = useBoardStore((state) => state.boardName)
  const dirty = useBoardStore((state) => state.dirty)
  const lastSavedAt = useBoardStore((state) => state.lastSavedAt)
  const canUndo = useBoardStore((state) => state.past.length > 0)
  const canRedo = useBoardStore((state) => state.future.length > 0)
  const undo = useBoardStore((state) => state.undo)
  const redo = useBoardStore((state) => state.redo)

  const saveState = useUiStore((state) => state.saveState)
  const lastError = useUiStore((state) => state.lastError)
  const showGrid = useUiStore((state) => state.showGrid)
  const setShowGrid = useUiStore((state) => state.setShowGrid)
  const toggleBoardsPanel = useUiStore((state) => state.toggleBoardsPanel)
  const toggleStylePanel = useUiStore((state) => state.toggleStylePanel)
  const setExportDialogOpen = useUiStore((state) => state.setExportDialogOpen)
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen)
  const themePreference = useUiStore((state) => state.themePreference)
  const resolvedTheme = useUiStore((state) => state.resolvedTheme)

  const { toggleTheme } = useTheme()
  const [draftName, setDraftName] = useState(boardName)

  // Keep the input in step when the board is switched from the panel.
  useEffect(() => setDraftName(boardName), [boardName])

  const commitName = (): void => {
    if (draftName.trim() && draftName !== boardName) {
      void operations.renameBoard(useBoardStore.getState().boardId, draftName)
    } else {
      setDraftName(boardName)
    }
  }

  const saveLabel = (() => {
    if (saveState === 'saving') return 'Saving…'
    if (saveState === 'error') return lastError ?? 'Save failed'
    if (dirty) return 'Unsaved changes'
    if (lastSavedAt) return `Saved ${formatRelativeTime(lastSavedAt)}`
    return 'All changes saved'
  })()

  return (
    // `wb-titlebar` makes this the OS title bar: the whole strip is draggable
    // and double-clicking it maximises, while `wb-titlebar-content` keeps the
    // controls clear of the native window buttons. See index.css.
    //
    // h-12 (48px) must stay in step with TITLEBAR_HEIGHT in src/main/titlebar.ts,
    // or the native buttons will not sit flush with the bar.
    <header className="wb-titlebar relative z-40 flex h-12 shrink-0 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="wb-titlebar-content flex items-center gap-1 px-2">
        {/*
          macOS keeps its application menu in the system menu bar, so the
          in-app menu is only rendered where the native bar is hidden.
        */}
        {!IS_MAC && (
          <>
            <TitleBarMenu operations={operations} />
            <Divider vertical />
          </>
        )}

        <IconButton label="Toggle board list (Ctrl+O)" onClick={toggleBoardsPanel}>
          <Icon name="folder" size={18} />
        </IconButton>

        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              setDraftName(boardName)
              event.currentTarget.blur()
            }
          }}
          aria-label="Board name"
          title="Rename this board"
          className="w-40 min-w-0 shrink rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-neutral-900 outline-none transition-colors hover:border-neutral-200 focus:border-indigo-500 focus:bg-white lg:w-52 dark:text-neutral-50 dark:hover:border-neutral-700 dark:focus:bg-neutral-800"
        />

        <span
          className={`ml-1 hidden items-center gap-1.5 truncate text-[11px] xl:flex ${
            saveState === 'error' ? 'text-red-500' : 'text-neutral-400 dark:text-neutral-500'
          }`}
          title={saveLabel}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              saveState === 'error'
                ? 'bg-red-500'
                : dirty
                  ? 'bg-amber-500'
                  : saveState === 'saving'
                    ? 'bg-indigo-500'
                    : 'bg-emerald-500'
            }`}
          />
          <span className="truncate">{saveLabel}</span>
        </span>

        {!isDesktop() && (
          <span className="ml-2 hidden rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 2xl:inline dark:bg-amber-950/60 dark:text-amber-300">
            Browser preview — saving to localStorage
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Icon name="undo" size={18} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
            <Icon name="redo" size={18} />
          </IconButton>

          <Divider vertical />

          <Button tone="outline" size="sm" onClick={() => void operations.saveNow()}>
            <Icon name="save" size={15} />
            Save
          </Button>

          <Button
            tone="outline"
            size="sm"
            onClick={() => void importImagesAt(viewportActions.worldCentre())}
          >
            <Icon name="upload" size={15} />
            Import
          </Button>

          <Button tone="solid" size="sm" onClick={() => setExportDialogOpen(true)}>
            <Icon name="download" size={15} />
            Export
          </Button>

          <Divider vertical />

          <IconButton
            label="Toggle grid (Ctrl+')"
            active={showGrid}
            onClick={() => setShowGrid(!showGrid)}
          >
            <Icon name="grid" size={18} />
          </IconButton>

          <IconButton label={`Theme: ${themePreference} (Ctrl+Shift+L)`} onClick={toggleTheme}>
            <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} size={18} />
          </IconButton>

          <IconButton label="Style panel" onClick={toggleStylePanel}>
            <Icon name="panel" size={18} />
          </IconButton>

          <IconButton label="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}>
            <Icon name="keyboard" size={18} />
          </IconButton>
        </div>
      </div>
    </header>
  )
}
