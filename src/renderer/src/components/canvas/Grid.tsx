import type Konva from 'konva'
import { memo, useCallback } from 'react'
import { Shape } from 'react-konva'

/**
 * The infinite dot grid.
 *
 * Drawn as a single Konva `Shape` with a custom scene function rather than as
 * thousands of `Circle` nodes. A node per dot would mean thousands of entries in
 * the scene graph and the hit graph, which is the fastest way to make a canvas
 * feel sluggish; here the whole grid is one path and one fill call.
 *
 * The world step is doubled or halved so the on-screen spacing always lands in a
 * comfortable band — zooming out never turns the grid into a solid grey field,
 * and zooming in never leaves one lonely dot on screen.
 */

export interface GridProps {
  width: number
  height: number
  /** Viewport translation in screen pixels. */
  offsetX: number
  offsetY: number
  /** Grid step in world units. */
  baseStep: number
  scale: number
  color: string
}

const DOT_RADIUS = 1
const MIN_SPACING = 18
const MAX_SPACING = 64
/** Above this many dots the grid is dropped rather than drawn as mush. */
const MAX_DOTS = 12000

export const Grid = memo(function Grid({
  width,
  height,
  offsetX,
  offsetY,
  baseStep,
  scale,
  color
}: GridProps): React.JSX.Element {
  let step = baseStep * scale
  if (!Number.isFinite(step) || step <= 0) step = baseStep
  while (step < MIN_SPACING) step *= 2
  while (step > MAX_SPACING) step /= 2

  const sceneFunc = useCallback(
    (context: Konva.Context, shape: Konva.Shape) => {
      if (width <= 0 || height <= 0) return

      // Screen offset of the first grid line, wrapped into [0, step).
      const startX = ((offsetX % step) + step) % step
      const startY = ((offsetY % step) + step) % step
      const columns = Math.floor((width - startX) / step) + 1
      const rows = Math.floor((height - startY) / step) + 1
      if (columns * rows > MAX_DOTS) return

      context.beginPath()
      for (let i = 0; i < columns; i++) {
        const x = startX + i * step
        for (let j = 0; j < rows; j++) {
          const y = startY + j * step
          // moveTo the arc's own start point, otherwise consecutive arcs are
          // joined by a straight line and the grid becomes a spiderweb.
          context.moveTo(x + DOT_RADIUS, y)
          context.arc(x, y, DOT_RADIUS, 0, Math.PI * 2)
        }
      }
      context.fillStrokeShape(shape)
    },
    [width, height, offsetX, offsetY, step]
  )

  return <Shape sceneFunc={sceneFunc} fill={color} listening={false} perfectDrawEnabled={false} />
})
