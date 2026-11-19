import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_LINE_HEIGHT } from '@/lib/constants'
import { fitNoteHeight } from '@/lib/shape-factory'
import { getLocalSize, worldToScreen } from '@/lib/shape-geometry'
import { textBlockHeight } from '@/lib/text'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import { isTextual } from '@/types/board'

/**
 * A real <textarea> positioned over the shape being edited.
 *
 * Canvas text editing is the one place where a canvas genuinely loses to the
 * DOM: caret placement, IME composition, selection, clipboard and undo inside a
 * text box all come free with a textarea and would each be a project to
 * reimplement on canvas.
 *
 * While the overlay is open the shape's Konva text is rendered blank, so the
 * textarea is the only thing drawing characters — that keeps the caret and the
 * glyphs perfectly aligned no matter how the text wraps.
 */
export function TextEditorOverlay(): React.JSX.Element | null {
  const editingId = useUiStore((state) => state.editingId)
  const viewport = useBoardStore((state) => state.viewport)
  const shape = useBoardStore((state) =>
    editingId ? state.shapes.find((candidate) => candidate.id === editingId) : undefined
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')
  const committedRef = useRef(false)

  // Load the current text whenever a new shape starts being edited.
  useEffect(() => {
    if (shape && isTextual(shape)) {
      setValue(shape.text)
      committedRef.current = false
    }
    // Intentionally keyed on the id only: re-running on every keystroke would
    // fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  // Focus has to be deferred to the next frame, and that is not a style choice.
  //
  // The overlay mounts while the `pointerdown` that created the shape is still
  // being dispatched (React flushes discrete events synchronously). Focusing
  // here and now therefore happens *before* the browser applies its own focus
  // change for the matching `mousedown`, which lands on the canvas and steals
  // focus straight back. That fires `blur`, which commits an empty string and
  // closes the editor — so the text box flashes into existence and vanishes,
  // and the user can never type anything.
  //
  // Waiting one frame puts the focus after the whole input sequence has been
  // processed, so it sticks.
  useEffect(() => {
    if (!editingId) return
    const element = textareaRef.current
    if (!element) return

    const frame = requestAnimationFrame(() => {
      element.focus({ preventScroll: true })
      element.setSelectionRange(element.value.length, element.value.length)
    })
    return () => cancelAnimationFrame(frame)
  }, [editingId])

  const commit = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true

    const board = useBoardStore.getState()
    const ui = useUiStore.getState()
    const current = board.shapes.find((candidate) => candidate.id === editingId)

    ui.setEditingId(null)
    if (!current || !isTextual(current)) return

    // An empty text box is almost never intentional — treat it as "remove".
    //
    // This has to come *before* the no-change check below. A box that was
    // opened and then abandoned compares equal to itself — both sides are the
    // empty string — so the early return would leave an invisible, text-less
    // object on the board: it counts towards the object total, gets saved and
    // exported, and cannot be clicked because it has no pixels to hit.
    if (value.trim() === '') {
      // Nothing was ever typed, so the whole interaction amounts to "nothing
      // happened". Pushing a history entry for it would only make undo step
      // back to the same invisible box.
      if (current.text !== '') board.snapshot()
      board.removeShapes([current.id])
      return
    }

    if (value === current.text) return

    board.snapshot()

    // A sticky note also has to grow to fit what was typed; a plain text shape
    // derives its height from the wrap width already.
    if (current.type === 'note') {
      board.replaceShape(current.id, fitNoteHeight({ ...current, text: value }))
    } else {
      board.replaceShape(current.id, { ...current, text: value })
    }
  }, [editingId, value])

  if (!shape || !isTextual(shape)) return null

  const { width } = getLocalSize(shape)
  const topLeft = worldToScreen({ x: shape.x, y: shape.y }, viewport)
  const padding = shape.type === 'note' ? 14 : 0
  const scale = viewport.scale

  // A text shape grows with what is typed; a sticky note keeps its card size and
  // clips instead, because its height is part of the object's identity.
  const height =
    shape.type === 'note'
      ? shape.height
      : Math.max(
          textBlockHeight(value || ' ', shape.fontFamily, shape.fontSize, width, shape.lineHeight),
          shape.fontSize * (shape.lineHeight ?? DEFAULT_LINE_HEIGHT)
        )

  const style: React.CSSProperties = {
    position: 'absolute',
    left: topLeft.x,
    top: topLeft.y,
    width: width * scale,
    height: height * scale,
    transform: `rotate(${shape.rotation}deg)`,
    transformOrigin: 'center center',
    padding: padding * scale,
    margin: 0,
    border: 'none',
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    background: 'transparent',
    color: shape.type === 'note' ? shape.textFill : shape.fill,
    caretColor: shape.type === 'note' ? shape.textFill : shape.fill,
    fontFamily: shape.fontFamily,
    fontSize: shape.fontSize * scale,
    lineHeight: String(shape.lineHeight ?? DEFAULT_LINE_HEIGHT),
    textAlign: shape.align,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxSizing: 'border-box'
  }

  return (
    <textarea
      ref={textareaRef}
      value={value}
      style={style}
      spellCheck={false}
      // The canvas owns pointer gestures; the overlay must not start one.
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          commit()
          return
        }
        // Ctrl/Cmd+Enter commits without leaving the keyboard.
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          commit()
          return
        }
        // Everything else (including plain Enter for a new line) stays local to
        // the textarea rather than reaching the canvas shortcuts.
        event.stopPropagation()
      }}
    />
  )
}
