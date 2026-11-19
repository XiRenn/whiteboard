import { ColorPicker } from '@/components/ui/ColorPicker'
import { Button, Divider, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Slider } from '@/components/ui/Slider'
import { useEffectiveStyle } from '@/hooks/useEffectiveStyle'
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_LINE_HEIGHT,
  MAX_SCALE,
  MIN_SCALE,
  PALETTE,
  STICKY_COLORS,
  STROKE_WIDTHS,
  TRANSPARENT
} from '@/lib/constants'
import { pluralize } from '@/lib/format'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import { isTextual, type Shape } from '@/types/board'

const FONT_FAMILIES = [
  { label: 'Inter / system', value: DEFAULT_FONT_FAMILY },
  { label: 'Georgia (serif)', value: 'Georgia, Times New Roman, serif' },
  { label: 'Courier (mono)', value: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
  { label: 'Trebuchet', value: 'Trebuchet MS, Tahoma, sans-serif' },
  { label: 'Comic', value: '"Comic Sans MS", "Segoe Print", cursive' }
]

const ALIGNMENTS = [
  { value: 'left' as const, icon: 'line' as const },
  { value: 'center' as const, icon: 'grid' as const },
  { value: 'right' as const, icon: 'line' as const }
]

/**
 * Right-hand style and arrangement panel.
 *
 * Works on the selection when there is one and on the drawing defaults when
 * there is not — see `useEffectiveStyle`.
 */
export function StylePanel(): React.JSX.Element {
  const { style, hasSelection, selectedCount, apply } = useEffectiveStyle()
  const noteColor = useUiStore((state) => state.noteColor)
  const setNoteColor = useUiStore((state) => state.setNoteColor)

  const selectedShapes = useBoardStore((state) => state.shapes)
  const selectedIds = useBoardStore((state) => state.selectedIds)
  const snapshot = useBoardStore((state) => state.snapshot)
  const reorder = useBoardStore((state) => state.reorder)
  const groupShapes = useBoardStore((state) => state.groupShapes)
  const ungroupShapes = useBoardStore((state) => state.ungroupShapes)
  const duplicateShapes = useBoardStore((state) => state.duplicateShapes)
  const removeShapes = useBoardStore((state) => state.removeShapes)
  const patchEach = useBoardStore((state) => state.patchEach)

  const selected: Shape[] = selectedShapes.filter((shape) => selectedIds.includes(shape.id))
  const textualSelection = selected.filter(isTextual)
  const canGroup = selectedIds.length > 1
  const canUngroup = selected.some((shape) => shape.groupId !== null)

  const withHistory = (action: () => void): void => {
    snapshot()
    action()
  }

  const setAlignment = (align: 'left' | 'center' | 'right'): void => {
    if (textualSelection.length === 0) return
    snapshot()
    patchEach(textualSelection.map((shape) => ({ id: shape.id, patch: { align } })))
  }

  return (
    <aside
      className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900"
      aria-label="Style"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          {hasSelection ? 'Selection' : 'Drawing defaults'}
        </h2>
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
          {hasSelection ? pluralize(selectedCount, 'object') : 'no selection'}
        </span>
      </div>

      <ColorPicker
        label="Stroke"
        value={style.stroke}
        palette={PALETTE}
        onChange={(stroke) => apply({ stroke })}
      />

      <ColorPicker
        label="Fill"
        value={style.fill}
        palette={PALETTE}
        allowTransparent
        onChange={(fill) => apply({ fill })}
      />

      <div className="space-y-2">
        <Slider
          label="Stroke width"
          value={style.strokeWidth}
          min={1}
          max={26}
          step={1}
          display={`${style.strokeWidth} px`}
          onChange={(strokeWidth) => apply({ strokeWidth })}
        />
        <div className="flex gap-1">
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              title={`${width} px`}
              aria-label={`Stroke width ${width}`}
              onClick={() => apply({ strokeWidth: width })}
              className={`flex h-6 flex-1 items-center justify-center rounded-md border transition-colors ${
                style.strokeWidth === width
                  ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/50'
                  : 'border-neutral-200 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'
              }`}
            >
              <span
                className="w-3.5 rounded-full bg-neutral-700 dark:bg-neutral-300"
                style={{ height: Math.max(1, Math.min(6, Math.round(width / 4))) }}
              />
            </button>
          ))}
        </div>
      </div>

      <Slider
        label="Opacity"
        value={style.opacity}
        min={0.1}
        max={1}
        step={0.05}
        display={`${Math.round(style.opacity * 100)}%`}
        onChange={(opacity) => apply({ opacity })}
      />

      {(textualSelection.length > 0 || !hasSelection) && (
        <>
          <Divider />
          <Slider
            label="Font size"
            value={style.fontSize}
            min={8}
            max={96}
            step={1}
            display={`${Math.round(style.fontSize)} px`}
            onChange={(fontSize) => apply({ fontSize })}
          />

          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Font
            </span>
            <select
              value={style.fontFamily}
              onChange={(event) => apply({ fontFamily: event.target.value })}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-800 outline-none focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {FONT_FAMILIES.map((family) => (
                <option key={family.value} value={family.value}>
                  {family.label}
                </option>
              ))}
            </select>
          </div>

          {textualSelection.length > 0 && (
            <div className="flex gap-1">
              {ALIGNMENTS.map((alignment) => (
                <IconButton
                  key={alignment.value}
                  label={`Align ${alignment.value}`}
                  active={textualSelection.every((shape) => shape.align === alignment.value)}
                  onClick={() => setAlignment(alignment.value)}
                >
                  <span
                    className={`block h-3 w-4 border-y border-current ${
                      alignment.value === 'center'
                        ? 'border-l-4 border-r-4'
                        : alignment.value === 'right'
                          ? 'border-r-4'
                          : 'border-l-4'
                    }`}
                  />
                </IconButton>
              ))}
            </div>
          )}
        </>
      )}

      {!hasSelection && (
        <>
          <Divider />
          <ColorPicker
            label="Sticky note"
            value={noteColor}
            palette={STICKY_COLORS}
            onChange={setNoteColor}
          />
        </>
      )}

      {hasSelection && (
        <>
          <Divider />

          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Arrange
            </span>
            <div className="flex gap-1">
              <IconButton label="Bring to front" onClick={() => reorder(selectedIds, 'front')}>
                <Icon name="bringFront" size={17} />
              </IconButton>
              <IconButton label="Bring forward" onClick={() => reorder(selectedIds, 'forward')}>
                <Icon name="chevronRight" size={17} className="-rotate-90" />
              </IconButton>
              <IconButton label="Send backward" onClick={() => reorder(selectedIds, 'backward')}>
                <Icon name="chevronRight" size={17} className="rotate-90" />
              </IconButton>
              <IconButton label="Send to back" onClick={() => reorder(selectedIds, 'back')}>
                <Icon name="sendBack" size={17} />
              </IconButton>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Object
            </span>
            <div className="flex gap-1">
              <IconButton
                label="Duplicate (Ctrl+D)"
                onClick={() => withHistory(() => duplicateShapes(selectedIds))}
              >
                <Icon name="copy" size={17} />
              </IconButton>
              <IconButton
                label="Group (Ctrl+G)"
                disabled={!canGroup}
                onClick={() => withHistory(() => groupShapes(selectedIds))}
              >
                <Icon name="group" size={17} />
              </IconButton>
              <IconButton
                label="Ungroup (Ctrl+Shift+G)"
                disabled={!canUngroup}
                onClick={() => withHistory(() => ungroupShapes(selectedIds))}
              >
                <Icon name="ungroup" size={17} />
              </IconButton>
              <IconButton
                label="Delete (Del)"
                tone="danger"
                onClick={() => withHistory(() => removeShapes(selectedIds))}
              >
                <Icon name="trash" size={17} />
              </IconButton>
            </div>
          </div>
        </>
      )}

      <div className="mt-auto space-y-2 pt-2">
        <Divider />
        <div className="flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
          <span>
            Zoom limits {Math.round(MIN_SCALE * 100)}%–{Math.round(MAX_SCALE * 100)}%
          </span>
          <span className="font-mono">{DEFAULT_LINE_HEIGHT}× line</span>
        </div>
        <Button
          size="sm"
          tone="outline"
          className="w-full"
          onClick={() => apply({ fill: TRANSPARENT })}
          disabled={!hasSelection}
        >
          <Icon name="close" size={14} />
          Clear fill
        </Button>
      </div>
    </aside>
  )
}
