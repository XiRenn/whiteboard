import { useCallback, useMemo } from 'react'
import { patchFromStyle, styleFromShape } from '@/lib/apply-style'
import type { StyleDefaults } from '@/lib/shape-factory'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import type { Shape } from '@/types/board'

/**
 * The selected shapes, recomputed only when the shape array or the selection
 * actually changes.
 *
 * The `useMemo` is not just an optimisation: a selector that built a new array
 * on every store read would make `useSyncExternalStore` see a change on every
 * render and loop forever. Deriving from two stable slices avoids that trap.
 */
export function useSelectedShapes(): Shape[] {
  const shapes = useBoardStore((state) => state.shapes)
  const selectedIds = useBoardStore((state) => state.selectedIds)

  return useMemo(() => {
    if (selectedIds.length === 0) return []
    const wanted = new Set(selectedIds)
    return shapes.filter((shape) => wanted.has(shape.id))
  }, [shapes, selectedIds])
}

export interface EffectiveStyle {
  style: StyleDefaults
  hasSelection: boolean
  selectedCount: number
  /** Applies to the selection when there is one, otherwise to the defaults. */
  apply: (patch: Partial<StyleDefaults>) => void
}

/**
 * One style panel serving two jobs: it edits the selection when there is one,
 * and the defaults for the next drawn object when there is not. Whichever it
 * shows becomes the new default, so the tool remembers what you last used.
 */
export function useEffectiveStyle(): EffectiveStyle {
  const defaults = useUiStore((state) => state.style)
  const selected = useSelectedShapes()

  const style = useMemo(
    () => (selected.length > 0 ? styleFromShape(selected[0], defaults) : defaults),
    [selected, defaults]
  )

  const apply = useCallback((patch: Partial<StyleDefaults>) => {
    const board = useBoardStore.getState()
    const ui = useUiStore.getState()

    if (board.selectedIds.length === 0) {
      ui.setStyle(patch)
      return
    }

    board.snapshot()
    const wanted = new Set(board.selectedIds)
    board.patchEach(
      board.shapes
        .filter((shape) => wanted.has(shape.id))
        .map((shape) => ({ id: shape.id, patch: patchFromStyle(shape, patch) }))
    )

    // Keep the defaults in step so the next object drawn matches what the user
    // just chose.
    ui.setStyle(patch)
  }, [])

  return {
    style,
    hasSelection: selected.length > 0,
    selectedCount: selected.length,
    apply
  }
}
