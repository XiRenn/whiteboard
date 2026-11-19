export type Tool =
  | 'select'
  | 'hand'
  | 'pen'
  | 'eraser'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'note'
  | 'image'

export interface ToolDefinition {
  id: Tool
  label: string
  /** Single-key shortcut, matched case-insensitively without modifiers. */
  shortcut: string
  /** Short hint shown in the tooltip. */
  hint: string
}

/**
 * Order matters: this is the order the tools appear in the toolbar.
 * Shortcuts mirror the conventions people already have from Figma / Excalidraw.
 */
export const TOOLS: ToolDefinition[] = [
  { id: 'select', label: 'Select', shortcut: 'V', hint: 'Select, move and resize objects' },
  { id: 'hand', label: 'Pan', shortcut: 'H', hint: 'Pan the canvas (or hold Space)' },
  { id: 'pen', label: 'Pen', shortcut: 'P', hint: 'Draw freehand' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', hint: 'Click or drag over objects to erase' },
  { id: 'text', label: 'Text', shortcut: 'T', hint: 'Click to place a text box' },
  { id: 'note', label: 'Sticky note', shortcut: 'N', hint: 'Click to place a sticky note' },
  { id: 'rect', label: 'Rectangle', shortcut: 'R', hint: 'Drag to draw a rectangle' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', hint: 'Drag to draw an ellipse' },
  { id: 'line', label: 'Line', shortcut: 'L', hint: 'Drag to draw a line' },
  { id: 'arrow', label: 'Arrow', shortcut: 'A', hint: 'Drag to draw an arrow' },
  { id: 'image', label: 'Image', shortcut: 'I', hint: 'Import an image from disk' }
]

export const TOOL_BY_SHORTCUT: Record<string, Tool> = Object.fromEntries(
  TOOLS.map((tool) => [tool.shortcut.toLowerCase(), tool.id])
)

/** Tools that create a new object by dragging out a bounding box. */
export const BOX_TOOLS: Tool[] = ['rect', 'ellipse', 'line', 'arrow']

export const isDrawingTool = (tool: Tool): boolean =>
  tool === 'pen' || tool === 'eraser' || BOX_TOOLS.includes(tool)
