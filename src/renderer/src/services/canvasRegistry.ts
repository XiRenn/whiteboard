import type Konva from 'konva'

/**
 * A mutable handle to the live Konva objects.
 *
 * Export needs to drive the *real* stage — temporarily reframing it to the
 * content bounds, hiding the grid and selection chrome, capturing, then
 * restoring. Passing all of that down through props (or a React context) would
 * mean re-rendering the canvas on every export; a module-level registry keeps
 * the capture path out of the render cycle entirely.
 *
 * Written by `CanvasStage`, read by `services/exportService`.
 */
export interface CanvasRegistry {
  stage: Konva.Stage | null
  /** The transformed group that holds every shape, in world coordinates. */
  worldGroup: Konva.Group | null
  gridLayer: Konva.Layer | null
  mainLayer: Konva.Layer | null
  overlayLayer: Konva.Layer | null
  transformer: Konva.Transformer | null
  container: HTMLDivElement | null
}

export const canvasRegistry: CanvasRegistry = {
  stage: null,
  worldGroup: null,
  gridLayer: null,
  mainLayer: null,
  overlayLayer: null,
  transformer: null,
  container: null
}

/** Wait for React to commit and Konva to paint, so a capture sees the new frame. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}
