/**
 * Shared constants. Anything that both the canvas and the UI need to agree on
 * lives here rather than being duplicated as a literal.
 */

export const HISTORY_LIMIT = 200

export const MIN_SCALE = 0.05
export const MAX_SCALE = 16
export const ZOOM_STEP = 1.15

/** Debounce for writing the board file after the last change. */
export const AUTOSAVE_DEBOUNCE_MS = 700
/** How often a crash-recovery snapshot is written while the board is dirty. */
export const RECOVERY_HEARTBEAT_MS = 5000

/** Above this shape count the canvas culls off-screen objects. */
export const CULL_THRESHOLD = 300
/** Slack added around the visible rect so partially visible shapes still draw. */
export const CULL_PADDING = 240

export const DEFAULT_GRID_SIZE = 24
export const GRID_DOT_RADIUS = 1.1

/** Hit tolerance for the eraser and for thin strokes, in screen pixels. */
export const HIT_TOLERANCE = 8

export const DEFAULT_FONT_FAMILY = 'Inter, Segoe UI, system-ui, sans-serif'
export const DEFAULT_NOTE_FONT_SIZE = 16
export const DEFAULT_TEXT_FONT_SIZE = 22
export const DEFAULT_LINE_HEIGHT = 1.3

export const STICKY_COLORS = [
  '#fef08a',
  '#fed7aa',
  '#fecaca',
  '#bbf7d0',
  '#bfdbfe',
  '#e9d5ff',
  '#fbcfe8',
  '#e2e8f0'
] as const

/** Stroke / fill palette. `transparent` is the "no fill" sentinel. */
export const PALETTE = [
  '#111827',
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#f43f5e'
] as const

export const TRANSPARENT = 'transparent'

export const STROKE_WIDTHS = [1, 2, 3, 4, 6, 8, 12, 18, 26] as const

export const DEFAULT_STYLE = {
  stroke: '#111827',
  fill: TRANSPARENT,
  strokeWidth: 3,
  opacity: 1,
  fontSize: DEFAULT_TEXT_FONT_SIZE,
  fontFamily: DEFAULT_FONT_FAMILY
} as const

/** Size of a shape created by a click (no drag). */
export const CLICK_CREATE_SIZE = { width: 160, height: 110 }
export const NOTE_DEFAULT_SIZE = { width: 220, height: 180 }
export const TEXT_DEFAULT_WIDTH = 320

/** Canvas background per theme. Also used for PNG/PDF export background. */
export const CANVAS_BACKGROUND = { light: '#ffffff', dark: '#0f1115' } as const
export const GRID_COLOR = { light: '#d7dbe0', dark: '#2a2f3a' } as const
