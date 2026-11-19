/**
 * Pure geometry. No React, no Konva, no DOM beyond canvas text measurement —
 * which makes every function here trivially testable and safe to call from the
 * SVG exporter as well as from the canvas.
 */

import type { BoardViewport } from '@shared/ipc-contract'
import { DEFAULT_LINE_HEIGHT } from './constants'
import { textBlockHeight } from './text'
import type { Shape } from '@/types/board'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export const snapToGrid = (value: number, grid: number): number =>
  grid > 0 ? Math.round(value / grid) * grid : value

/**
 * Local (unrotated) size of a shape, measured from its own `x`,`y` origin.
 * Matches Konva's `getSelfRect()` for every shape type, which is what the
 * transformer uses — so handles land exactly on the object's edges.
 */
export function getLocalSize(shape: Shape): { width: number; height: number } {
  switch (shape.type) {
    case 'pen':
    case 'line':
    case 'arrow': {
      const pts = shape.points
      if (pts.length < 2) return { width: 0, height: 0 }
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let i = 0; i < pts.length; i += 2) {
        if (pts[i] < minX) minX = pts[i]
        if (pts[i] > maxX) maxX = pts[i]
        if (pts[i + 1] < minY) minY = pts[i + 1]
        if (pts[i + 1] > maxY) maxY = pts[i + 1]
      }
      return { width: maxX - minX, height: maxY - minY }
    }
    case 'text':
      return {
        width: shape.width,
        height: textBlockHeight(
          shape.text,
          shape.fontFamily,
          shape.fontSize,
          shape.width,
          shape.lineHeight ?? DEFAULT_LINE_HEIGHT
        )
      }
    default:
      return { width: shape.width, height: shape.height }
  }
}

/** Centre of the shape's local box, in world coordinates. */
export function getShapeCenter(shape: Shape): Point {
  const { width, height } = getLocalSize(shape)
  return { x: shape.x + width / 2, y: shape.y + height / 2 }
}

export function rotatePoint(px: number, py: number, cx: number, cy: number, degrees: number): Point {
  if (!degrees) return { x: px, y: py }
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = px - cx
  const dy = py - cy
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

/** Rotation-aware axis-aligned bounding box, in world coordinates. */
export function getShapeBounds(shape: Shape): Bounds {
  const { width, height } = getLocalSize(shape)
  if (!shape.rotation) {
    return { x: shape.x, y: shape.y, width, height }
  }

  const cx = shape.x + width / 2
  const cy = shape.y + height / 2
  const corners: Point[] = [
    { x: shape.x, y: shape.y },
    { x: shape.x + width, y: shape.y },
    { x: shape.x + width, y: shape.y + height },
    { x: shape.x, y: shape.y + height }
  ].map((p) => rotatePoint(p.x, p.y, cx, cy, shape.rotation))

  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of list) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function getShapesBounds(shapes: Shape[]): Bounds | null {
  return unionBounds(shapes.map(getShapeBounds))
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  )
}

export function boundsContainsPoint(b: Bounds, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
}

/**
 * Re-base a flat point list so its top-left sits at the origin, returning the
 * offset and the new extents. Applied when a stroke or line is finalised so the
 * model's `x`,`y` always means "top-left of the bounding box".
 */
export function normalizePoints(points: number[]): {
  x: number
  y: number
  points: number[]
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    if (points[i] < minX) minX = points[i]
    if (points[i] > maxX) maxX = points[i]
    if (points[i + 1] < minY) minY = points[i + 1]
    if (points[i + 1] > maxY) maxY = points[i + 1]
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, points: [], width: 0, height: 0 }

  const shifted = points.map((value, index) => (index % 2 === 0 ? value - minX : value - minY))
  return { x: minX, y: minY, points: shifted, width: maxX - minX, height: maxY - minY }
}

// ---------------------------------------------------------------- viewport ---

export function screenToWorld(point: Point, viewport: BoardViewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale
  }
}

export function worldToScreen(point: Point, viewport: BoardViewport): Point {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y
  }
}

/** The world-space rectangle currently visible in a `size`-pixel viewport. */
export function visibleWorldRect(viewport: BoardViewport, size: { width: number; height: number }): Bounds {
  return {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: size.width / viewport.scale,
    height: size.height / viewport.scale
  }
}

/**
 * Viewport that centres `bounds` in the viewport, scaled to fit with padding.
 * Used by "zoom to fit" and by every export, so exported framing is identical
 * to what the user sees.
 */
export function fitViewport(
  bounds: Bounds | null,
  size: { width: number; height: number },
  padding: number,
  limits: { min: number; max: number }
): BoardViewport {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { x: size.width / 2, y: size.height / 2, scale: 1 }
  }

  const availableW = Math.max(size.width - padding * 2, 1)
  const availableH = Math.max(size.height - padding * 2, 1)
  const scale = clamp(Math.min(availableW / bounds.width, availableH / bounds.height), limits.min, limits.max)

  return {
    x: size.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: size.height / 2 - (bounds.y + bounds.height / 2) * scale,
    scale
  }
}

/** Zoom around a fixed screen point, keeping that point visually stationary. */
export function zoomAt(
  viewport: BoardViewport,
  screenPoint: Point,
  factor: number,
  limits: { min: number; max: number }
): BoardViewport {
  const nextScale = clamp(viewport.scale * factor, limits.min, limits.max)
  if (nextScale === viewport.scale) return viewport

  const world = screenToWorld(screenPoint, viewport)
  return {
    scale: nextScale,
    x: screenPoint.x - world.x * nextScale,
    y: screenPoint.y - world.y * nextScale
  }
}

export function formatZoom(scale: number): string {
  return `${Math.round(scale * 100)}%`
}
