import { MAX_SCALE, MIN_SCALE, ZOOM_STEP } from '@/lib/constants'
import { fitViewport, getShapesBounds, screenToWorld, zoomAt, type Point } from '@/lib/shape-geometry'
import { canvasRegistry } from './canvasRegistry'
import { useBoardStore } from '@/store/useBoardStore'

const LIMITS = { min: MIN_SCALE, max: MAX_SCALE }

/**
 * Viewport commands shared by the toolbar, the status bar, the menu and the
 * keyboard. They all read the live canvas size from the registry rather than
 * taking it as a parameter, so a caller never has to know about layout.
 */

function containerSize(): { width: number; height: number } | null {
  const element = canvasRegistry.container
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return { width: Math.round(rect.width), height: Math.round(rect.height) }
}

function zoomAroundCentre(factor: number): void {
  const size = containerSize()
  if (!size) return
  const centre = { x: size.width / 2, y: size.height / 2 }
  useBoardStore.getState().setViewport((current) => zoomAt(current, centre, factor, LIMITS))
}

/** World coordinates at the centre of the visible area. */
function worldCentre(): Point {
  const size = containerSize()
  if (!size) return { x: 0, y: 0 }
  return screenToWorld(
    { x: size.width / 2, y: size.height / 2 },
    useBoardStore.getState().viewport
  )
}

export const viewportActions = {
  zoomIn: (): void => zoomAroundCentre(ZOOM_STEP),
  zoomOut: (): void => zoomAroundCentre(1 / ZOOM_STEP),

  /** 100% zoom, with the content centre kept where it was. */
  resetZoom: (): void => {
    const size = containerSize()
    if (!size) return
    useBoardStore.getState().setViewport((current) => {
      const bounds = getShapesBounds(useBoardStore.getState().shapes)
      const focus = bounds
        ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
        : screenToWorld({ x: size.width / 2, y: size.height / 2 }, current)
      return {
        scale: 1,
        x: size.width / 2 - focus.x,
        y: size.height / 2 - focus.y
      }
    })
  },

  fitToContent: (): void => {
    const size = containerSize()
    if (!size) return
    const bounds = getShapesBounds(useBoardStore.getState().shapes)
    useBoardStore.getState().setViewport(fitViewport(bounds, size, 72, LIMITS))
  },

  worldCentre
}
