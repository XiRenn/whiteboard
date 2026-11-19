import type Konva from 'konva'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ellipse, Group, Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import type { BoardViewport } from '@shared/ipc-contract'
import { Grid } from '@/components/canvas/Grid'
import { ShapeNode } from '@/components/canvas/ShapeNode'
import { TextEditorOverlay } from '@/components/canvas/TextEditorOverlay'
import { useElementSize } from '@/hooks/useElementSize'
import {
  CANVAS_BACKGROUND,
  CLICK_CREATE_SIZE,
  CULL_PADDING,
  CULL_THRESHOLD,
  GRID_COLOR,
  MAX_SCALE,
  MIN_SCALE
} from '@/lib/constants'
import {
  boundsIntersect,
  getShapeBounds,
  screenToWorld,
  visibleWorldRect,
  zoomAt,
  type Bounds,
  type Point
} from '@/lib/shape-geometry'
import {
  createEllipseShape,
  createLineShape,
  createNoteShape,
  createPenShape,
  createRectShape,
  createTextShape
} from '@/lib/shape-factory'
import { applyNodeTransform } from '@/lib/node-transform'
import { canvasRegistry } from '@/services/canvasRegistry'
import { importImagesAt } from '@/services/imageImport'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import type { Shape } from '@/types/board'
import { isTextual } from '@/types/board'

/**
 * The canvas.
 *
 * Three design decisions drive everything below:
 *
 * 1. **One source of truth.** The Konva scene graph is rebuilt from the Zustand
 *    document on every render. Nothing is read back out of Konva except during
 *    an active transform, and even then it is immediately converted back into
 *    model values. This is what keeps undo, autosave and export simple.
 *
 * 2. **Native pointer events, not Konva drag.** Dragging is implemented by
 *    patching model coordinates on pointermove rather than by making nodes
 *    `draggable`. Multi-select drags, group drags and snapping then all work
 *    through the same code path, and the store can never disagree with what is
 *    on screen.
 *
 * 3. **Stable callbacks.** Every handler reads live state through
 *    `getState()` instead of closing over it, so the callback identities never
 *    change. That is what lets `ShapeNode`'s `memo` actually skip work when one
 *    object moves on a board with thousands of objects.
 */

const ZOOM_LIMITS = { min: MIN_SCALE, max: MAX_SCALE }
/** Movement in screen pixels below which a press counts as a click, not a drag. */
const CLICK_DRAG_THRESHOLD = 3
const ANCHORS_ALL = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
]
/** Text re-wraps instead of stretching, so only the horizontal anchors apply. */
const ANCHORS_TEXT = ['middle-left', 'middle-right']

type BoxTool = 'rect' | 'ellipse' | 'line' | 'arrow'

type Gesture =
  | { kind: 'pan'; startScreen: Point; startViewport: BoardViewport }
  | { kind: 'marquee'; startWorld: Point; startScreen: Point; additive: boolean }
  | { kind: 'draw-box'; tool: BoxTool; startWorld: Point }
  | { kind: 'draw-pen'; points: number[]; lastWorld: Point }
  | { kind: 'erase'; erased: Set<string>; lastScreen: Point; snapshotTaken: boolean }
  | { kind: 'move'; startWorld: Point; origins: Record<string, Point>; moved: boolean }

type Preview =
  | { kind: 'box'; tool: BoxTool; start: Point; current: Point }
  | { kind: 'pen'; points: number[] }
  | { kind: 'marquee'; start: Point; current: Point }

function rectFromPoints(a: Point, b: Point): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  }
}

export function CanvasStage(): React.JSX.Element {
  const [containerRef, size] = useElementSize<HTMLDivElement>()

  const stageRef = useRef<Konva.Stage>(null)
  const worldGroupRef = useRef<Konva.Group>(null)
  const gridLayerRef = useRef<Konva.Layer>(null)
  const mainLayerRef = useRef<Konva.Layer>(null)
  const overlayLayerRef = useRef<Konva.Layer>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodeMap = useRef(new Map<string, Konva.Node>())

  const gestureRef = useRef<Gesture | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  const shapes = useBoardStore((state) => state.shapes)
  const viewport = useBoardStore((state) => state.viewport)
  const selectedIds = useBoardStore((state) => state.selectedIds)

  const tool = useUiStore((state) => state.tool)
  const editingId = useUiStore((state) => state.editingId)
  const spacePanning = useUiStore((state) => state.spacePanning)
  const showGrid = useUiStore((state) => state.showGrid)
  const gridSize = useUiStore((state) => state.gridSize)
  const theme = useUiStore((state) => state.resolvedTheme)
  const style = useUiStore((state) => state.style)

  // ------------------------------------------------------------ registry ----

  useEffect(() => {
    canvasRegistry.stage = stageRef.current
    canvasRegistry.worldGroup = worldGroupRef.current
    canvasRegistry.gridLayer = gridLayerRef.current
    canvasRegistry.mainLayer = mainLayerRef.current
    canvasRegistry.overlayLayer = overlayLayerRef.current
    canvasRegistry.transformer = transformerRef.current
    canvasRegistry.container = containerRef.current
    return () => {
      canvasRegistry.stage = null
      canvasRegistry.worldGroup = null
      canvasRegistry.gridLayer = null
      canvasRegistry.mainLayer = null
      canvasRegistry.overlayLayer = null
      canvasRegistry.transformer = null
      canvasRegistry.container = null
    }
    // `size` is in the deps because the Stage only mounts once the container has
    // been measured — without it the registry would capture a null stage.
  }, [containerRef, size.width, size.height])

  // ------------------------------------------------------------- helpers ----

  const snapValue = useCallback((value: number): number => {
    const ui = useUiStore.getState()
    return ui.snapToGrid && ui.gridSize > 0 ? Math.round(value / ui.gridSize) * ui.gridSize : value
  }, [])

  const screenFromEvent = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const container = containerRef.current
      if (!container) return { x: 0, y: 0 }
      const rect = container.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    },
    [containerRef]
  )

  const worldFromEvent = useCallback(
    (event: { clientX: number; clientY: number }): Point =>
      screenToWorld(screenFromEvent(event), useBoardStore.getState().viewport),
    [screenFromEvent]
  )

  const registerNode = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodeMap.current.set(id, node)
    else nodeMap.current.delete(id)
  }, [])

  /**
   * Walk up from whatever the hit graph returned to the node carrying a
   * document id — a sticky note's inner Text must resolve to the note itself.
   */
  const findShapeIdAt = useCallback((screen: Point): string | null => {
    const stage = stageRef.current
    if (!stage) return null
    let node: Konva.Node | null = stage.getIntersection(screen)
    while (node) {
      if (node.name() === 'shape' && node.id()) return node.id()
      node = node.getParent()
    }
    return null
  }, [])

  const eraseAt = useCallback(
    (screen: Point): void => {
      const gesture = gestureRef.current
      if (!gesture || gesture.kind !== 'erase') return
      const id = findShapeIdAt(screen)
      if (!id || gesture.erased.has(id)) return

      const board = useBoardStore.getState()
      const shape = board.shapes.find((candidate) => candidate.id === id)
      if (!shape || shape.locked) return

      // One history entry per eraser stroke, not per erased object.
      if (!gesture.snapshotTaken) {
        board.snapshot()
        gesture.snapshotTaken = true
      }
      gesture.erased.add(id)
      board.removeShapes([id])
    },
    [findShapeIdAt]
  )

  const createTextual = useCallback(
    (kind: 'text' | 'note', world: Point): void => {
      const ui = useUiStore.getState()
      const board = useBoardStore.getState()
      const x = snapValue(world.x)
      const y = snapValue(world.y)

      const shape =
        kind === 'text'
          ? createTextShape(x, y, ui.style)
          : createNoteShape(x, y, ui.style, ui.noteColor)

      board.snapshot()
      board.addShapes([shape], { select: true })
      ui.setTool('select')
      ui.setEditingId(shape.id)
    },
    [snapValue]
  )

  /**
   * Double-click opens an existing text or sticky note for editing.
   *
   * Without this the only way into the text editor is to create a *new* object,
   * which means committed text is write-once — you can move it, style it and
   * delete it, but never correct a typo.
   */
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      const ui = useUiStore.getState()
      if (ui.tool !== 'select') return

      const id = findShapeIdAt(screenFromEvent(event))
      if (!id) return

      const shape = useBoardStore.getState().shapes.find((candidate) => candidate.id === id)
      if (!shape || shape.locked || !isTextual(shape)) return

      ui.setEditingId(id)
    },
    [findShapeIdAt, screenFromEvent]
  )

  // ------------------------------------------------------------ gestures ----

  const handleShapePointerDown = useCallback(
    (id: string, event: Konva.KonvaEventObject<PointerEvent>): void => {
      const ui = useUiStore.getState()
      if (ui.tool !== 'select' || event.evt.button !== 0) return

      const board = useBoardStore.getState()
      const shape = board.shapes.find((candidate) => candidate.id === id)
      if (!shape || shape.locked) return

      const additive = event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey
      if (additive) {
        board.toggleSelection(id)
        // Shift-clicking an already-selected object removes it; there is then
        // nothing to drag.
        if (!useBoardStore.getState().selectedIds.includes(id)) return
      } else if (!board.selectedIds.includes(id)) {
        // Selecting an already-selected object must NOT collapse a
        // multi-selection, or dragging a group of objects would be impossible.
        board.setSelection([id])
      }

      const live = useBoardStore.getState()
      const origins: Record<string, Point> = {}
      for (const selectedId of live.selectedIds) {
        const selected = live.shapes.find((candidate) => candidate.id === selectedId)
        if (selected && !selected.locked) origins[selectedId] = { x: selected.x, y: selected.y }
      }

      gestureRef.current = {
        kind: 'move',
        startWorld: worldFromEvent(event.evt),
        origins,
        moved: false
      }
    },
    [worldFromEvent]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (gestureRef.current) return
      if (event.button !== 0 && event.button !== 1) return

      const ui = useUiStore.getState()
      const board = useBoardStore.getState()
      const screen = screenFromEvent(event)
      const world = worldFromEvent(event)

      event.currentTarget.setPointerCapture(event.pointerId)

      const wantsPan = event.button === 1 || ui.spacePanning || ui.tool === 'hand'
      if (wantsPan) {
        gestureRef.current = {
          kind: 'pan',
          startScreen: screen,
          startViewport: board.viewport
        }
        setIsPanning(true)
        return
      }

      switch (ui.tool) {
        case 'select':
          gestureRef.current = {
            kind: 'marquee',
            startWorld: world,
            startScreen: screen,
            additive: event.shiftKey
          }
          setPreview({ kind: 'marquee', start: screen, current: screen })
          return

        case 'pen':
          gestureRef.current = { kind: 'draw-pen', points: [world.x, world.y], lastWorld: world }
          setPreview({ kind: 'pen', points: [world.x, world.y] })
          return

        case 'eraser':
          gestureRef.current = {
            kind: 'erase',
            erased: new Set(),
            lastScreen: screen,
            snapshotTaken: false
          }
          eraseAt(screen)
          return

        case 'rect':
        case 'ellipse':
        case 'line':
        case 'arrow':
          gestureRef.current = { kind: 'draw-box', tool: ui.tool, startWorld: world }
          setPreview({ kind: 'box', tool: ui.tool, start: world, current: world })
          return

        case 'text':
        case 'note':
          createTextual(ui.tool, world)
          return

        case 'image':
          void importImagesAt(world)
          return

        default:
          return
      }
    },
    [createTextual, eraseAt, screenFromEvent, worldFromEvent]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current
      if (!gesture) return

      const screen = screenFromEvent(event)
      const world = worldFromEvent(event)
      const board = useBoardStore.getState()

      switch (gesture.kind) {
        case 'pan': {
          board.setViewport({
            x: gesture.startViewport.x + (screen.x - gesture.startScreen.x),
            y: gesture.startViewport.y + (screen.y - gesture.startScreen.y),
            scale: gesture.startViewport.scale
          })
          return
        }

        case 'marquee':
          setPreview({ kind: 'marquee', start: gesture.startScreen, current: screen })
          return

        case 'draw-box':
          setPreview({ kind: 'box', tool: gesture.tool, start: gesture.startWorld, current: world })
          return

        case 'draw-pen': {
          // Thin out the samples: at 60 Hz a fast stroke produces far more
          // points than the curve needs, and every point is stored in the file.
          const minDistance = 1.6 / board.viewport.scale
          if (Math.hypot(world.x - gesture.lastWorld.x, world.y - gesture.lastWorld.y) < minDistance) {
            return
          }
          gesture.points.push(world.x, world.y)
          gesture.lastWorld = world
          setPreview({ kind: 'pen', points: [...gesture.points] })
          return
        }

        case 'erase':
          if (Math.hypot(screen.x - gesture.lastScreen.x, screen.y - gesture.lastScreen.y) < 2) return
          gesture.lastScreen = screen
          eraseAt(screen)
          return

        case 'move': {
          const dx = world.x - gesture.startWorld.x
          const dy = world.y - gesture.startWorld.y
          if (!gesture.moved) {
            if (Math.hypot(dx, dy) * board.viewport.scale < CLICK_DRAG_THRESHOLD) return
            board.snapshot()
            gesture.moved = true
          }
          board.translateFromOrigins(gesture.origins, dx, dy)
          return
        }
      }
    },
    [eraseAt, screenFromEvent, worldFromEvent]
  )

  const finishGesture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean): void => {
      const gesture = gestureRef.current
      gestureRef.current = null
      setPreview(null)
      if (!gesture) return

      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* pointer already released */
      }

      const board = useBoardStore.getState()
      const ui = useUiStore.getState()

      if (cancelled) {
        if (gesture.kind === 'pan') setIsPanning(false)
        return
      }

      switch (gesture.kind) {
        case 'pan':
          setIsPanning(false)
          return

        case 'marquee': {
          const screen = screenFromEvent(event)
          const dragged =
            Math.hypot(screen.x - gesture.startScreen.x, screen.y - gesture.startScreen.y) >
            CLICK_DRAG_THRESHOLD

          if (!dragged) {
            if (!gesture.additive) board.clearSelection()
            return
          }

          const region = rectFromPoints(gesture.startWorld, worldFromEvent(event))
          const hits = board.shapes
            .filter((shape) => !shape.locked && boundsIntersect(getShapeBounds(shape), region))
            .map((shape) => shape.id)
          board.setSelection(gesture.additive ? [...board.selectedIds, ...hits] : hits)
          return
        }

        case 'draw-box': {
          const end = worldFromEvent(event)
          const start = gesture.startWorld
          const dragged =
            Math.hypot(end.x - start.x, end.y - start.y) * board.viewport.scale > CLICK_DRAG_THRESHOLD
          const style = ui.style

          let shape: Shape
          if (!dragged) {
            // A click with no drag places a default-sized object centred on the
            // click, so the tool never produces an invisible zero-size shape.
            const { width, height } = CLICK_CREATE_SIZE
            const x = snapValue(start.x - width / 2)
            const y = snapValue(start.y - height / 2)
            if (gesture.tool === 'rect') shape = createRectShape(x, y, width, height, style)
            else if (gesture.tool === 'ellipse') shape = createEllipseShape(x, y, width, height, style)
            else {
              shape = createLineShape(x, y, x + width, y + height / 2, style, gesture.tool === 'arrow')
            }
          } else if (gesture.tool === 'rect' || gesture.tool === 'ellipse') {
            const box = rectFromPoints(start, end)
            const x = snapValue(box.x)
            const y = snapValue(box.y)
            const width = Math.max(2, snapValue(box.width))
            const height = Math.max(2, snapValue(box.height))
            shape =
              gesture.tool === 'rect'
                ? createRectShape(x, y, width, height, style)
                : createEllipseShape(x, y, width, height, style)
          } else {
            shape = createLineShape(
              snapValue(start.x),
              snapValue(start.y),
              snapValue(end.x),
              snapValue(end.y),
              style,
              gesture.tool === 'arrow'
            )
          }

          board.snapshot()
          useBoardStore.getState().addShapes([shape], { select: true })
          // Shape tools are one-shot: the natural next action is to adjust what
          // was just drawn, which needs the select tool.
          ui.setTool('select')
          return
        }

        case 'draw-pen': {
          const points = gesture.points
          if (points.length < 2) return
          // A single click should still leave a dot; a zero-length segment with
          // a round cap renders exactly that.
          if (points.length === 2) points.push(points[0] + 0.6, points[1] + 0.6)
          const shape = createPenShape(points, ui.style)
          board.snapshot()
          useBoardStore.getState().addShapes([shape], { select: true })
          return
        }

        case 'erase':
        case 'move':
          return
      }
    },
    [screenFromEvent, snapValue, worldFromEvent]
  )

  // --------------------------------------------------------------- wheel ----

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onWheel = (event: WheelEvent): void => {
      // Without this, Chromium treats ctrl+wheel as page zoom and the canvas
      // jumps instead of zooming.
      event.preventDefault()

      const rect = container.getBoundingClientRect()
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const board = useBoardStore.getState()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * unit * 0.0022)
        board.setViewport((current) => zoomAt(current, point, factor, ZOOM_LIMITS))
        return
      }

      // Plain wheel pans, shift swaps the axis — the Figma / Excalidraw convention.
      const dx = event.shiftKey ? -event.deltaY * unit : -event.deltaX * unit
      const dy = event.shiftKey ? 0 : -event.deltaY * unit
      board.setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [containerRef])

  // ---------------------------------------------------------- transformer ----

  const showTransformer = tool === 'select' && !editingId

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return

    const nodes = showTransformer
      ? selectedIds
          .map((id) => nodeMap.current.get(id))
          .filter((node): node is Konva.Node => Boolean(node))
      : []

    transformer.nodes(nodes)
    transformer.getLayer()?.batchDraw()
  }, [selectedIds, shapes, showTransformer])

  const handleTransformStart = useCallback((): void => {
    useBoardStore.getState().snapshot()
  }, [])

  const handleTransformEnd = useCallback((): void => {
    const transformer = transformerRef.current
    if (!transformer) return
    const board = useBoardStore.getState()

    for (const node of transformer.nodes()) {
      const shape = board.shapes.find((candidate) => candidate.id === node.id())
      if (!shape) continue

      const next = applyNodeTransform(shape, node)
      // Scale is baked into the model's width/height (or point list), so the
      // node must return to unit scale or the next render would double it.
      node.scale({ x: 1, y: 1 })
      node.rotation(next.rotation)
      board.replaceShape(shape.id, next)
    }
  }, [])

  // -------------------------------------------------------------- render ----

  const visibleShapes = useMemo(() => {
    if (shapes.length < CULL_THRESHOLD || size.width === 0) return shapes
    const rect = visibleWorldRect(viewport, size)
    const padding = CULL_PADDING / viewport.scale
    const padded: Bounds = {
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2
    }
    return shapes.filter((shape) => boundsIntersect(getShapeBounds(shape), padded))
  }, [shapes, viewport, size])

  const textOnly = useMemo(() => {
    if (selectedIds.length === 0) return false
    return selectedIds.every(
      (id) => shapes.find((shape) => shape.id === id)?.type === 'text'
    )
  }, [selectedIds, shapes])

  const interactive = tool === 'select' || tool === 'eraser'

  const cursor = isPanning
    ? 'grabbing'
    : spacePanning || tool === 'hand'
      ? 'grab'
      : tool === 'eraser'
        ? 'cell'
        : tool === 'select'
          ? 'default'
          : 'crosshair'

  const accent = theme === 'dark' ? '#818cf8' : '#4f46e5'
  const surface = theme === 'dark' ? '#111827' : '#ffffff'

  const previewBox =
    preview && preview.kind === 'box' ? rectFromPoints(preview.start, preview.current) : null

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ cursor, background: CANVAS_BACKGROUND[theme] }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishGesture(event, false)}
      onPointerCancel={(event) => finishGesture(event, true)}
      onDoubleClick={handleDoubleClick}
    >
      {size.width > 0 && size.height > 0 && (
        <Stage ref={stageRef} width={size.width} height={size.height}>
          <Layer ref={gridLayerRef} listening={false}>
            {showGrid && (
              <Grid
                width={size.width}
                height={size.height}
                offsetX={viewport.x}
                offsetY={viewport.y}
                baseStep={gridSize}
                scale={viewport.scale}
                color={GRID_COLOR[theme]}
              />
            )}
          </Layer>

          <Layer ref={mainLayerRef} listening={!isPanning}>
            <Group
              ref={worldGroupRef}
              x={viewport.x}
              y={viewport.y}
              scaleX={viewport.scale}
              scaleY={viewport.scale}
            >
              {visibleShapes.map((shape) => (
                <ShapeNode
                  key={shape.id}
                  shape={shape}
                  isEditing={editingId === shape.id}
                  interactive={interactive}
                  onShapePointerDown={handleShapePointerDown}
                  registerNode={registerNode}
                />
              ))}

              {previewBox && preview?.kind === 'box' && (
                <>
                  {preview.tool === 'ellipse' ? (
                    <Ellipse
                      x={previewBox.x + previewBox.width / 2}
                      y={previewBox.y + previewBox.height / 2}
                      radiusX={previewBox.width / 2}
                      radiusY={previewBox.height / 2}
                      stroke={accent}
                      strokeWidth={1.5 / viewport.scale}
                      dash={[6 / viewport.scale, 4 / viewport.scale]}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  ) : preview.tool === 'line' || preview.tool === 'arrow' ? (
                    <Line
                      points={[
                        preview.start.x,
                        preview.start.y,
                        preview.current.x,
                        preview.current.y
                      ]}
                      stroke={accent}
                      strokeWidth={1.5 / viewport.scale}
                      dash={[6 / viewport.scale, 4 / viewport.scale]}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  ) : (
                    <Rect
                      {...previewBox}
                      stroke={accent}
                      strokeWidth={1.5 / viewport.scale}
                      dash={[6 / viewport.scale, 4 / viewport.scale]}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  )}
                </>
              )}

              {preview?.kind === 'pen' && preview.points.length >= 2 && (
                <Line
                  points={preview.points}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  tension={0.35}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                  perfectDrawEnabled={false}
                />
              )}
            </Group>

            <Transformer
              ref={transformerRef}
              rotateEnabled
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={6}
              flipEnabled={false}
              ignoreStroke
              keepRatio={false}
              padding={2}
              anchorSize={9}
              anchorCornerRadius={3}
              anchorStrokeWidth={1.5}
              anchorStroke={accent}
              anchorFill={surface}
              borderStroke={accent}
              borderStrokeWidth={1.25}
              borderDash={[5, 4]}
              enabledAnchors={textOnly ? ANCHORS_TEXT : ANCHORS_ALL}
              // Reject degenerate boxes so an object can never be collapsed to
              // zero size and become unreachable.
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 6 || newBox.height < 6 ? oldBox : newBox
              }
              onTransformStart={handleTransformStart}
              onTransformEnd={handleTransformEnd}
            />
          </Layer>

          <Layer ref={overlayLayerRef} listening={false}>
            {preview?.kind === 'marquee' && (
              <Rect
                x={Math.min(preview.start.x, preview.current.x)}
                y={Math.min(preview.start.y, preview.current.y)}
                width={Math.abs(preview.current.x - preview.start.x)}
                height={Math.abs(preview.current.y - preview.start.y)}
                fill={`${accent}1a`}
                stroke={accent}
                strokeWidth={1}
                dash={[5, 4]}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
          </Layer>
        </Stage>
      )}

      <TextEditorOverlay />
    </div>
  )
}
