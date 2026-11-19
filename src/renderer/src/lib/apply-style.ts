import type { AnyShapePatch, Shape } from '@/types/board'
import type { StyleDefaults } from './shape-factory'

/**
 * Translate a style-panel change into a patch for one specific shape.
 *
 * The style panel is intentionally generic — one set of controls for a mixed
 * selection — but the underlying properties differ per shape type:
 *
 * | panel control | rect / ellipse | line / arrow / pen | text      | note       |
 * |---------------|----------------|--------------------|-----------|------------|
 * | stroke        | stroke         | stroke             | fill      | textFill   |
 * | fill          | fill           | —                  | —         | fill       |
 * | stroke width  | strokeWidth    | strokeWidth        | —         | —          |
 * | font size     | —              | —                  | fontSize  | fontSize   |
 *
 * Doing that mapping here keeps the panel free of `switch (shape.type)` noise
 * and makes the rules testable in isolation.
 */
export function patchFromStyle(shape: Shape, style: Partial<StyleDefaults>): AnyShapePatch {
  const patch: AnyShapePatch = {}

  if (style.opacity !== undefined) patch.opacity = style.opacity

  if (style.stroke !== undefined) {
    if (shape.type === 'text') patch.fill = style.stroke
    else if (shape.type === 'note') patch.textFill = style.stroke
    else if (shape.type !== 'image') patch.stroke = style.stroke
  }

  if (style.fill !== undefined) {
    if (shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'note') {
      patch.fill = style.fill
    }
  }

  if (style.strokeWidth !== undefined) {
    if (shape.type === 'pen' || shape.type === 'line' || shape.type === 'arrow') {
      patch.strokeWidth = style.strokeWidth
      // The arrow head is sized from the stroke width, so it must follow it or
      // a thick arrow ends up with a pinhead.
      if (shape.type === 'arrow') {
        patch.pointerLength = Math.max(10, style.strokeWidth * 3.2)
        patch.pointerWidth = Math.max(10, style.strokeWidth * 3.2)
      }
    } else if (shape.type === 'rect' || shape.type === 'ellipse') {
      patch.strokeWidth = style.strokeWidth
    }
  }

  if (style.fontSize !== undefined && (shape.type === 'text' || shape.type === 'note')) {
    patch.fontSize = style.fontSize
  }

  if (style.fontFamily !== undefined && (shape.type === 'text' || shape.type === 'note')) {
    patch.fontFamily = style.fontFamily
  }

  return patch
}

/** Read a shape's current style back out, for populating the panel. */
export function styleFromShape(shape: Shape, fallback: StyleDefaults): StyleDefaults {
  const next: StyleDefaults = { ...fallback }

  switch (shape.type) {
    case 'text':
      next.fill = fallback.fill
      next.stroke = shape.fill
      next.fontSize = shape.fontSize
      next.fontFamily = shape.fontFamily
      break
    case 'note':
      next.fill = shape.fill
      next.stroke = shape.textFill
      next.fontSize = shape.fontSize
      next.fontFamily = shape.fontFamily
      break
    case 'image':
      break
    default:
      next.stroke = shape.stroke
      next.strokeWidth = shape.strokeWidth
      if (shape.type === 'rect' || shape.type === 'ellipse') next.fill = shape.fill
      break
  }

  next.opacity = shape.opacity
  return next
}
