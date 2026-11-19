import type Konva from 'konva'
import { memo } from 'react'
import { Ellipse, Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva'
import { DEFAULT_LINE_HEIGHT, HIT_TOLERANCE } from '@/lib/constants'
import { getLocalSize } from '@/lib/shape-geometry'
import { wrapText } from '@/lib/text'
import type { Shape } from '@/types/board'
import { useImageSource } from '@/hooks/useImageSource'

/**
 * Renders exactly one document shape.
 *
 * This component is the *only* place that knows how a model shape maps onto a
 * Konva node, and it is deliberately pure: it derives Konva props from the
 * model and never writes back. All mutation happens in the canvas's gesture
 * handlers, which read the node and call `applyNodeTransform`.
 *
 * Memoised on `shape` identity, so panning or moving one object re-renders that
 * object alone rather than the whole board.
 */

export interface ShapeNodeProps {
  shape: Shape
  /**
   * True while this shape's text is being edited in the HTML overlay. The Konva
   * text is then rendered blank so the user does not see two copies of the same
   * string on top of each other.
   */
  isEditing: boolean
  /** True when the select tool is active, so hit areas are live. */
  interactive: boolean
  onShapePointerDown: (id: string, event: Konva.KonvaEventObject<PointerEvent>) => void
  registerNode: (id: string, node: Konva.Node | null) => void
}

function ShapeNodeImpl({
  shape,
  isEditing,
  interactive,
  onShapePointerDown,
  registerNode
}: ShapeNodeProps): React.JSX.Element | null {
  const { width, height } = getLocalSize(shape)
  const image = useImageSource(shape.type === 'image' ? shape.src : '')

  const common = {
    // The node carries its document id so the eraser can walk up from whatever
    // the hit graph returned (a note's inner Text, for instance) back to the
    // shape it belongs to.
    id: shape.id,
    name: 'shape',
    rotation: shape.rotation,
    opacity: shape.opacity,
    listening: interactive,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
    onPointerDown: (event: Konva.KonvaEventObject<PointerEvent>) => onShapePointerDown(shape.id, event)
  }

  const ref = (node: Konva.Node | null): void => registerNode(shape.id, node)

  switch (shape.type) {
    case 'pen':
      return (
        <Line
          ref={ref}
          {...common}
          // Centre-anchored: the local box centre maps to (x, y) in world space.
          x={shape.x + width / 2}
          y={shape.y + height / 2}
          offsetX={width / 2}
          offsetY={height / 2}
          points={shape.points}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          tension={shape.tension}
          lineCap={shape.lineCap}
          lineJoin={shape.lineJoin}
          hitStrokeWidth={Math.max(shape.strokeWidth, HIT_TOLERANCE * 2)}
        />
      )

    case 'line':
    case 'arrow':
      return (
        <Line
          ref={ref}
          {...common}
          x={shape.x + width / 2}
          y={shape.y + height / 2}
          offsetX={width / 2}
          offsetY={height / 2}
          points={shape.points}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={Math.max(shape.strokeWidth, HIT_TOLERANCE * 2)}
          {...(shape.type === 'arrow'
            ? { pointerLength: shape.pointerLength, pointerWidth: shape.pointerWidth }
            : {})}
        />
      )

    case 'rect':
      return (
        <Rect
          ref={ref}
          {...common}
          x={shape.x + width / 2}
          y={shape.y + height / 2}
          offsetX={width / 2}
          offsetY={height / 2}
          width={shape.width}
          height={shape.height}
          cornerRadius={shape.cornerRadius}
          // A `transparent` fill draws nothing but still registers in Konva's
          // hit graph, so an unfilled rectangle can be clicked in its interior
          // the way people expect. Passing `undefined` would make it
          // stroke-only for hit-testing.
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      )

    case 'ellipse':
      return (
        <Ellipse
          ref={ref}
          {...common}
          // An Ellipse is drawn around its origin, so its local centre is
          // already (0, 0) — no offset, position is the centre.
          x={shape.x + width / 2}
          y={shape.y + height / 2}
          radiusX={Math.max(shape.width / 2, 0.5)}
          radiusY={Math.max(shape.height / 2, 0.5)}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      )

    case 'text': {
      // Wrapping is done by our own measurement so that the model's height,
      // the Konva node and the exported SVG all break lines identically.
      const lines = wrapText(shape.text, shape.fontFamily, shape.fontSize, shape.width).join('\n')
      return (
        <Text
          ref={ref}
          {...common}
          x={shape.x + width / 2}
          y={shape.y + height / 2}
          offsetX={width / 2}
          offsetY={height / 2}
          width={shape.width}
          text={isEditing ? '' : lines}
          wrap="none"
          fontSize={shape.fontSize}
          fontFamily={shape.fontFamily}
          lineHeight={shape.lineHeight ?? DEFAULT_LINE_HEIGHT}
          align={shape.align}
          fill={shape.fill}
        />
      )
    }

    case 'note': {
      const padding = 14
      const innerWidth = Math.max(shape.width - padding * 2, 16)
      const lines = wrapText(shape.text, shape.fontFamily, shape.fontSize, innerWidth).join('\n')
      return (
        <Group
          ref={ref}
          {...common}
          x={shape.x + width / 2}
          y={shape.y + height / 2}
          offsetX={width / 2}
          offsetY={height / 2}
        >
          <Rect
            width={shape.width}
            height={shape.height}
            fill={shape.fill}
            cornerRadius={shape.cornerRadius}
            perfectDrawEnabled={false}
          />
          <Text
            x={padding}
            y={padding}
            width={innerWidth}
            text={isEditing ? '' : lines}
            wrap="none"
            fontSize={shape.fontSize}
            fontFamily={shape.fontFamily}
            lineHeight={shape.lineHeight ?? DEFAULT_LINE_HEIGHT}
            align={shape.align}
            fill={shape.textFill}
            listening={false}
          />
        </Group>
      )
    }

    case 'image': {
      if (!image) return null
      return (
        <KonvaImage
          ref={ref}
          {...common}
          x={shape.x + width / 2}
          y={shape.y + height / 2}
          offsetX={width / 2}
          offsetY={height / 2}
          width={shape.width}
          height={shape.height}
          image={image}
        />
      )
    }

    default:
      return null
  }
}

export const ShapeNode = memo(
  ShapeNodeImpl,
  (prev, next) =>
    prev.shape === next.shape &&
    prev.isEditing === next.isEditing &&
    prev.interactive === next.interactive
)
