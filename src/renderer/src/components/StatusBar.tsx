import { Button, IconButton, Switch } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { formatZoom } from '@/lib/shape-geometry'
import { pluralize } from '@/lib/format'
import { prefsService } from '@/services/boardService'
import { viewportActions } from '@/services/viewportActions'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'

/** Bottom bar: view controls on the left, board statistics on the right. */
export function StatusBar(): React.JSX.Element {
  const viewport = useBoardStore((state) => state.viewport)
  const shapeCount = useBoardStore((state) => state.shapes.length)
  const selectedCount = useBoardStore((state) => state.selectedIds.length)

  const snapToGrid = useUiStore((state) => state.snapToGrid)
  const setSnapToGrid = useUiStore((state) => state.setSnapToGrid)
  const autosaveEnabled = useUiStore((state) => state.autosaveEnabled)
  const setAutosaveEnabled = useUiStore((state) => state.setAutosaveEnabled)

  const persist = (patch: { snapToGrid?: boolean; autosaveEnabled?: boolean }): void => {
    if (patch.snapToGrid !== undefined) setSnapToGrid(patch.snapToGrid)
    if (patch.autosaveEnabled !== undefined) setAutosaveEnabled(patch.autosaveEnabled)
    void prefsService.set(patch)
  }

  return (
    <footer className="flex h-9 shrink-0 items-center gap-2 border-t border-neutral-200 bg-white px-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
      <div className="flex items-center gap-0.5">
        <IconButton label="Zoom out (Ctrl+-)" size="sm" onClick={viewportActions.zoomOut}>
          <Icon name="zoomOut" size={15} />
        </IconButton>
        <Button
          size="sm"
          tone="ghost"
          className="min-w-14 font-mono"
          title="Reset to 100% (Ctrl+0)"
          onClick={viewportActions.resetZoom}
        >
          {formatZoom(viewport.scale)}
        </Button>
        <IconButton label="Zoom in (Ctrl+=)" size="sm" onClick={viewportActions.zoomIn}>
          <Icon name="zoomIn" size={15} />
        </IconButton>
        <IconButton
          label="Zoom to fit (Ctrl+1)"
          size="sm"
          onClick={viewportActions.fitToContent}
          disabled={shapeCount === 0}
        >
          <Icon name="fit" size={15} />
        </IconButton>
      </div>

      <span className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

      <span>
        {selectedCount > 0
          ? `${pluralize(selectedCount, 'object')} selected`
          : pluralize(shapeCount, 'object')}
      </span>

      <div className="ml-auto flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <Switch
            checked={snapToGrid}
            onChange={(value) => persist({ snapToGrid: value })}
            label="Snap to grid"
          />
          <span>Snap</span>
        </label>

        <label className="flex items-center gap-1.5">
          <Switch
            checked={autosaveEnabled}
            onChange={(value) => persist({ autosaveEnabled: value })}
            label="Autosave"
          />
          <span>Autosave</span>
        </label>

        <span className="hidden font-mono text-neutral-400 lg:inline dark:text-neutral-500">
          x {Math.round(viewport.x)} · y {Math.round(viewport.y)}
        </span>
      </div>
    </footer>
  )
}
