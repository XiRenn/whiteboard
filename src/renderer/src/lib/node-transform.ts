import type Konva from 'konva'
import type { Shape } from '@/types/board'
import { cloneShape } from './shape-factory'
import { getLocalSize } from './shape-geometry'
import { textBlockHeight } from './text'

/**
 * Translate a transformed Konva node back into model values.
 *
 * Why this works uniformly for every shape type:
 *
 * Konva builds a node's absolute transform as
 * `T(x, y) · R · S · T(-offsetX, -offsetY)`. The renderer sets
 * `offset` to the centre of the shape's local box, so the local centre maps to
 * `(x, y)` in world space *regardless of rotation or scale*. That gives one
 * simple rule for reading a transform back:
 *
 *     model.x = node.x() - newWidth / 2
 *     model.y = node.y() - newHeight / 2
 *
 * (`Ellipse` is the one shape whose local origin is already its centre, so its
 * renderer passes `offset = 0` — the rule is unchanged.)
 *
 * The node's `scale` is baked into width/height (or into the point list) and
 * then reset to 1 by the caller, so the model never carries a scale factor.
 * Keeping scale out of the model is what makes export and hit-testing trivial.
 */
export function applyNodeTransform(shape: Shape, node: Konva.Node): Shape {
  const scaleX = Math.abs(node.scaleX()) || 1
  const scaleY = Math.abs(node.scaleY()) || 1
  const rotation = ((node.rotation() % 360) + 360) % 360

  const next = cloneShape(shape)
  next.rotation = rotation

  const centreX = node.x()
  const centreY = node.y()

  switch (next.type) {
    case 'pen':
    case 'line':
    case 'arrow': {
      const base = getLocalSize(shape)
      const width = Math.max(base.width * scaleX, 0)
      const height = Math.max(base.height * scaleY, 0)
      next.points = next.points.map((value, index) => (index % 2 === 0 ? value * scaleX : value * scaleY))
      next.x = centreX - width / 2
      next.y = centreY - height / 2
      break
    }

    case 'text': {
      // Text height is derived from the wrap width, so it is recomputed after
      // the width changes rather than scaled directly.
      const width = Math.max(24, next.width * scaleX)
      const height = textBlockHeight(
        next.text,
        next.fontFamily,
        next.fontSize,
        width,
        next.lineHeight
      )
      next.width = width
      next.x = centreX - width / 2
      next.y = centreY - height / 2
      break
    }

    default: {
      // rect / ellipse / note / image
      const width = Math.max(1, next.width * scaleX)
      const height = Math.max(1, next.height * scaleY)
      next.width = width
      next.height = height
      next.x = centreX - width / 2
      next.y = centreY - height / 2
      break
    }
  }

  return next
}

/**
 * Position a shape after a plain drag (translation only). Kept separate from
 * `applyNodeTransform` so dragging never touches size or rotation.
 */
export function applyNodeTranslation(shape: Shape, deltaX: number, deltaY: number): Shape {
  return { ...shape, x: shape.x + deltaX, y: shape.y + deltaY }
}
