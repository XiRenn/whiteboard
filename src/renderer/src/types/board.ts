/**
 * The document model.
 *
 * These types are what gets serialised into the `.board.json` file, so they are
 * deliberately plain data — no class instances, no functions, no Konva objects.
 * The canvas renders *from* this model; it never stores state inside Konva
 * nodes. That single rule is what makes undo/redo, autosave and export simple:
 * there is exactly one source of truth, and it is a plain array of objects.
 *
 * Coordinate convention
 * ---------------------
 * `x` / `y` are the top-left of the shape's unrotated local bounding box, in
 * world coordinates. `rotation` is degrees, applied around the *centre* of that
 * box. Konva rotates around a node's origin, so the renderer compensates with
 * `offsetX`/`offsetY` = half the local size — see `lib/shape-geometry.ts`.
 */

export type ShapeType = 'pen' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'note' | 'image'

export type Align = 'left' | 'center' | 'right'
export type LineCap = 'round' | 'butt' | 'square'
export type LineJoin = 'round' | 'bevel' | 'miter'

interface ShapeBase {
  id: string
  type: ShapeType
  /** Top-left of the unrotated bounding box, world coordinates. */
  x: number
  y: number
  /** Degrees, clockwise, around the centre of the bounding box. */
  rotation: number
  /** 0..1 */
  opacity: number
  /** Shapes sharing a group id select and move together. `null` = ungrouped. */
  groupId: string | null
  locked: boolean
}

/** Freehand stroke. `points` is a flat `[x0, y0, x1, y1, …]` relative to `x`,`y`. */
export interface PenShape extends ShapeBase {
  type: 'pen'
  points: number[]
  stroke: string
  strokeWidth: number
  /** Konva spline smoothing, 0..1. */
  tension: number
  lineCap: LineCap
  lineJoin: LineJoin
}

export interface RectShape extends ShapeBase {
  type: 'rect'
  width: number
  height: number
  stroke: string
  strokeWidth: number
  /** `transparent` means no fill. */
  fill: string
  cornerRadius: number
}

export interface EllipseShape extends ShapeBase {
  type: 'ellipse'
  width: number
  height: number
  stroke: string
  strokeWidth: number
  fill: string
}

/** Straight line or arrow. `points` is `[x0, y0, x1, y1]` relative to `x`,`y`. */
export interface LineShape extends ShapeBase {
  type: 'line' | 'arrow'
  points: number[]
  stroke: string
  strokeWidth: number
  pointerLength: number
  pointerWidth: number
}

export interface TextShape extends ShapeBase {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  fill: string
  /** Wrap width. Height is derived from the wrapped lines. */
  width: number
  align: Align
  lineHeight: number
}

export interface NoteShape extends ShapeBase {
  type: 'note'
  text: string
  width: number
  height: number
  /** Sticky-note background colour. */
  fill: string
  textFill: string
  fontSize: number
  fontFamily: string
  cornerRadius: number
  align: Align
  lineHeight: number
}

export interface ImageShape extends ShapeBase {
  type: 'image'
  /** `data:` URL — images live inside the board file, so boards stay portable. */
  src: string
  width: number
  height: number
  name: string
}

export type Shape =
  | PenShape
  | RectShape
  | EllipseShape
  | LineShape
  | TextShape
  | NoteShape
  | ImageShape

/** Shapes whose geometry is a width/height box rather than a point list. */
export type BoxShape = RectShape | EllipseShape | TextShape | NoteShape | ImageShape
export type PointShape = PenShape | LineShape

export const isBoxShape = (shape: Shape): shape is BoxShape =>
  shape.type !== 'pen' && shape.type !== 'line' && shape.type !== 'arrow'

export const isPointShape = (shape: Shape): shape is PointShape =>
  shape.type === 'pen' || shape.type === 'line' || shape.type === 'arrow'

/** True for shapes that carry editable text. */
export const isTextual = (shape: Shape): shape is TextShape | NoteShape =>
  shape.type === 'text' || shape.type === 'note'

/**
 * The patch shape accepted by the store's update actions.
 *
 * An explicit key list rather than `any`: it stays readable, and an accidental
 * typo in a key name is still a compile error at the call site.
 */
export interface AnyShapePatch {
  x?: number
  y?: number
  rotation?: number
  opacity?: number
  groupId?: string | null
  locked?: boolean
  width?: number
  height?: number
  points?: number[]
  stroke?: string
  fill?: string
  textFill?: string
  strokeWidth?: number
  text?: string
  fontSize?: number
  fontFamily?: string
  align?: Align
  lineHeight?: number
  cornerRadius?: number
  pointerLength?: number
  pointerWidth?: number
  src?: string
  name?: string
  tension?: number
}
