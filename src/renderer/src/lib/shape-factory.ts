/**
 * Shape factories and cloning.
 *
 * Every shape that enters the document is built here, so defaults (corner
 * radius, tension, arrow head size, sticky-note padding) are defined once.
 * `cloneShape` is what the history stack copies — it must copy the `points`
 * array, otherwise an undo snapshot would share mutable state with the live
 * shape and the stroke would mutate inside the snapshot.
 */

import type {
  EllipseShape,
  ImageShape,
  LineShape,
  NoteShape,
  PenShape,
  RectShape,
  Shape,
  TextShape
} from '@/types/board'
import {
  DEFAULT_LINE_HEIGHT,
  DEFAULT_NOTE_FONT_SIZE,
  NOTE_DEFAULT_SIZE,
  TEXT_DEFAULT_WIDTH,
  TRANSPARENT
} from './constants'
import { createShapeId } from './id'
import { normalizePoints } from './shape-geometry'
import { textBlockHeight } from './text'

export interface StyleDefaults {
  stroke: string
  fill: string
  strokeWidth: number
  opacity: number
  fontSize: number
  fontFamily: string
}

function base(type: Shape['type'], x: number, y: number, opacity: number) {
  return {
    id: createShapeId(),
    type,
    x,
    y,
    rotation: 0,
    opacity,
    groupId: null,
    locked: false
  } as const
}

export function createPenShape(rawPoints: number[], style: StyleDefaults): PenShape {
  const { x, y, points } = normalizePoints(rawPoints)
  return {
    ...base('pen', x, y, style.opacity),
    type: 'pen',
    points,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    tension: 0.35,
    lineCap: 'round',
    lineJoin: 'round'
  }
}

export function createRectShape(x: number, y: number, width: number, height: number, style: StyleDefaults): RectShape {
  return {
    ...base('rect', x, y, style.opacity),
    type: 'rect',
    width,
    height,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    fill: style.fill,
    cornerRadius: 8
  }
}

export function createEllipseShape(
  x: number,
  y: number,
  width: number,
  height: number,
  style: StyleDefaults
): EllipseShape {
  return {
    ...base('ellipse', x, y, style.opacity),
    type: 'ellipse',
    width,
    height,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    fill: style.fill
  }
}

export function createLineShape(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: StyleDefaults,
  arrow: boolean
): LineShape {
  const { x, y, points } = normalizePoints([x1, y1, x2, y2])
  return {
    ...base(arrow ? 'arrow' : 'line', x, y, style.opacity),
    type: arrow ? 'arrow' : 'line',
    points,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    pointerLength: Math.max(10, style.strokeWidth * 3.2),
    pointerWidth: Math.max(10, style.strokeWidth * 3.2)
  }
}

export function createTextShape(x: number, y: number, style: StyleDefaults, text = ''): TextShape {
  const width = TEXT_DEFAULT_WIDTH
  return {
    ...base('text', x, y, style.opacity),
    type: 'text',
    text,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    fill: style.stroke,
    width,
    align: 'left',
    lineHeight: DEFAULT_LINE_HEIGHT
  }
}

export function createNoteShape(
  x: number,
  y: number,
  style: StyleDefaults,
  fill: string,
  text = ''
): NoteShape {
  const fontSize = Math.min(style.fontSize, DEFAULT_NOTE_FONT_SIZE + 2)
  return {
    ...base('note', x, y, style.opacity),
    type: 'note',
    text,
    width: NOTE_DEFAULT_SIZE.width,
    height: NOTE_DEFAULT_SIZE.height,
    fill,
    textFill: '#1f2937',
    fontSize,
    fontFamily: style.fontFamily,
    cornerRadius: 10,
    align: 'left',
    lineHeight: DEFAULT_LINE_HEIGHT
  }
}

export function createImageShape(
  x: number,
  y: number,
  width: number,
  height: number,
  src: string,
  name: string
): ImageShape {
  return {
    ...base('image', x, y, 1),
    type: 'image',
    src,
    width,
    height,
    name
  }
}

/** Deep-enough copy for the history stack. */
export function cloneShape(shape: Shape): Shape {
  if (shape.type === 'pen' || shape.type === 'line' || shape.type === 'arrow') {
    return { ...shape, points: [...shape.points] }
  }
  return { ...shape }
}

export function cloneShapes(shapes: Shape[]): Shape[] {
  return shapes.map(cloneShape)
}

/**
 * Grow a sticky note's height so its text fits, with a little breathing room.
 * Notes keep a fixed width (they are square-ish cards) and grow downwards.
 */
export function fitNoteHeight(note: NoteShape): NoteShape {
  const padding = 20
  const needed =
    textBlockHeight(note.text, note.fontFamily, note.fontSize, note.width - padding * 2, note.lineHeight) +
    padding * 2
  return { ...note, height: Math.max(NOTE_DEFAULT_SIZE.height, Math.ceil(needed)) }
}

export const NO_FILL = TRANSPARENT
