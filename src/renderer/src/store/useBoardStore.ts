import { create } from 'zustand'
import type { BoardDocument, BoardViewport } from '@shared/ipc-contract'
import type { AnyShapePatch, Shape } from '@/types/board'
import { HISTORY_LIMIT } from '@/lib/constants'
import { createGroupId } from '@/lib/id'
import { cloneShape, cloneShapes } from '@/lib/shape-factory'

/**
 * The document store: the board, its selection, and its undo history.
 *
 * History is snapshot-based rather than command-based. `snapshot()` is called
 * *before* a mutation and pushes a copy of the current shapes onto the past
 * stack. That gives one rule for every operation — gestures call `snapshot()`
 * once when they begin, then mutate freely — instead of every action having to
 * know how to invert itself.
 *
 * Selection is intentionally NOT part of the history: undoing a drawing action
 * should not also rewind what the user had selected.
 */

export interface BoardState {
  boardId: string
  boardName: string
  createdAt: string
  viewport: BoardViewport
  shapes: Shape[]
  selectedIds: string[]
  past: Shape[][]
  future: Shape[][]
  /** Changes since the last successful write to disk. */
  dirty: boolean
  lastSavedAt: string | null

  // --- document lifecycle -------------------------------------------------
  hydrate: (doc: BoardDocument) => void
  setName: (name: string) => void
  setViewport: (viewport: BoardViewport | ((current: BoardViewport) => BoardViewport)) => void
  markSaved: (at: string) => void
  markClean: () => void
  toDocument: () => BoardDocument

  // --- history ------------------------------------------------------------
  snapshot: () => void
  undo: () => void
  redo: () => void

  // --- object operations --------------------------------------------------
  addShapes: (shapes: Shape[], options?: { select?: boolean }) => void
  patchShapes: (ids: string[], patch: AnyShapePatch) => void
  /**
   * Apply a different patch to each shape in one update.
   *
   * Styling a mixed selection needs per-type patches — setting a stroke on a
   * text object means changing its fill, and a sticky note has no stroke at all
   * — so a single shared patch cannot express it.
   */
  patchEach: (entries: Array<{ id: string; patch: AnyShapePatch }>) => void
  replaceShape: (id: string, shape: Shape) => void
  removeShapes: (ids: string[]) => void
  /**
   * Move shapes relative to where they were when the drag began.
   *
   * Taking the origin snapshot once and applying an absolute delta — rather
   * than accumulating per-frame deltas — means a dragged selection cannot
   * drift away from the pointer over a long gesture.
   */
  translateFromOrigins: (origins: Record<string, { x: number; y: number }>, dx: number, dy: number) => void
  reorder: (ids: string[], mode: 'front' | 'back' | 'forward' | 'backward') => void
  duplicateShapes: (ids: string[]) => string[]
  groupShapes: (ids: string[]) => void
  ungroupShapes: (ids: string[]) => void

  // --- selection ----------------------------------------------------------
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
}

const nowIso = (): string => new Date().toISOString()

/** Selecting one member of a group selects the whole group. */
function expandGroups(ids: string[], shapes: Shape[]): string[] {
  const wanted = new Set(ids)
  const groups = new Set<string>()
  for (const shape of shapes) {
    if (wanted.has(shape.id) && shape.groupId) groups.add(shape.groupId)
  }
  if (groups.size === 0) return ids
  for (const shape of shapes) {
    if (shape.groupId && groups.has(shape.groupId)) wanted.add(shape.id)
  }
  return [...wanted]
}

/** Drop ids that no longer exist, so selection can never go stale. */
function reconcileSelection(selectedIds: string[], shapes: Shape[]): string[] {
  const alive = new Set(shapes.map((s) => s.id))
  const next = selectedIds.filter((id) => alive.has(id))
  return next.length === selectedIds.length ? selectedIds : next
}

export const useBoardStore = create<BoardState>((set, get) => ({
  boardId: '',
  boardName: 'Untitled board',
  createdAt: nowIso(),
  viewport: { x: 0, y: 0, scale: 1 },
  shapes: [],
  selectedIds: [],
  past: [],
  future: [],
  dirty: false,
  lastSavedAt: null,

  // ------------------------------------------------------------ lifecycle ---

  hydrate: (doc) =>
    set({
      boardId: doc.id,
      boardName: doc.name,
      createdAt: doc.createdAt,
      viewport: doc.viewport,
      shapes: doc.shapes as Shape[],
      selectedIds: [],
      past: [],
      future: [],
      dirty: false,
      lastSavedAt: doc.updatedAt
    }),

  setName: (name) => set({ boardName: name, dirty: true }),

  setViewport: (viewport) =>
    set((state) => ({
      viewport: typeof viewport === 'function' ? viewport(state.viewport) : viewport,
      // The viewport is part of the document, so reopening a board restores the
      // exact view the user left it in.
      dirty: true
    })),

  markSaved: (at) => set({ dirty: false, lastSavedAt: at }),
  markClean: () => set({ dirty: false }),

  toDocument: () => {
    const state = get()
    return {
      version: 1,
      id: state.boardId,
      name: state.boardName,
      createdAt: state.createdAt,
      updatedAt: state.lastSavedAt ?? nowIso(),
      viewport: state.viewport,
      shapes: state.shapes
    }
  },

  // -------------------------------------------------------------- history ---

  snapshot: () =>
    set((state) => {
      const past = [...state.past, cloneShapes(state.shapes)]
      // Trim from the front: the oldest states are the least likely to be wanted.
      if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT)
      return { past, future: [], dirty: true }
    }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        shapes: previous,
        past: state.past.slice(0, -1),
        future: [cloneShapes(state.shapes), ...state.future].slice(0, HISTORY_LIMIT),
        selectedIds: reconcileSelection(state.selectedIds, previous),
        dirty: true
      }
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        shapes: next,
        future: state.future.slice(1),
        past: [...state.past, cloneShapes(state.shapes)].slice(-HISTORY_LIMIT),
        selectedIds: reconcileSelection(state.selectedIds, next),
        dirty: true
      }
    }),

  // -------------------------------------------------------------- objects ---

  addShapes: (incoming, options) =>
    set((state) => ({
      shapes: [...state.shapes, ...incoming],
      selectedIds: options?.select ? incoming.map((s) => s.id) : state.selectedIds,
      dirty: true
    })),

  patchShapes: (ids, patch) => {
    if (ids.length === 0) return
    const target = new Set(ids)
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        target.has(shape.id) ? ({ ...shape, ...patch } as Shape) : shape
      ),
      dirty: true
    }))
  },

  patchEach: (entries) => {
    if (entries.length === 0) return
    const byId = new Map(entries.map((entry) => [entry.id, entry.patch]))
    set((state) => ({
      shapes: state.shapes.map((shape) => {
        const patch = byId.get(shape.id)
        return patch ? ({ ...shape, ...patch } as Shape) : shape
      }),
      dirty: true
    }))
  },

  replaceShape: (id, shape) =>
    set((state) => ({
      shapes: state.shapes.map((existing) => (existing.id === id ? shape : existing)),
      dirty: true
    })),

  removeShapes: (ids) => {
    if (ids.length === 0) return
    const target = new Set(ids)
    set((state) => {
      const shapes = state.shapes.filter((shape) => !target.has(shape.id))
      return { shapes, selectedIds: reconcileSelection(state.selectedIds, shapes), dirty: true }
    })
  },

  translateFromOrigins: (origins, dx, dy) => {
    if (dx === 0 && dy === 0) return
    set((state) => ({
      shapes: state.shapes.map((shape) => {
        const origin = origins[shape.id]
        return origin ? { ...shape, x: origin.x + dx, y: origin.y + dy } : shape
      }),
      dirty: true
    }))
  },

  reorder: (ids, mode) => {
    if (ids.length === 0) return
    const target = new Set(ids)
    set((state) => {
      const picked = state.shapes.filter((s) => target.has(s.id))
      const rest = state.shapes.filter((s) => !target.has(s.id))
      if (picked.length === 0) return state

      let shapes: Shape[]
      switch (mode) {
        case 'front':
          shapes = [...rest, ...picked]
          break
        case 'back':
          shapes = [...picked, ...rest]
          break
        case 'forward':
        case 'backward': {
          // Move each picked shape one slot past its nearest unpicked neighbour.
          shapes = [...state.shapes]
          const order = mode === 'forward' ? [...shapes.keys()].reverse() : [...shapes.keys()]
          for (const index of order) {
            if (!target.has(shapes[index].id)) continue
            const neighbour = mode === 'forward' ? index + 1 : index - 1
            if (neighbour < 0 || neighbour >= shapes.length) continue
            if (target.has(shapes[neighbour].id)) continue
            ;[shapes[index], shapes[neighbour]] = [shapes[neighbour], shapes[index]]
          }
          break
        }
      }
      return { shapes, dirty: true }
    })
  },

  duplicateShapes: (ids) => {
    const state = get()
    const target = new Set(ids)
    const picked = state.shapes.filter((s) => target.has(s.id))
    if (picked.length === 0) return []

    // Copies of a grouped selection form their own new group, so dragging the
    // duplicate does not drag the original along with it.
    const groupRemap = new Map<string, string>()
    const offset = 24

    const copies = picked.map((shape) => {
      const copy = cloneShape(shape)
      copy.id = `${shape.id}_c${Math.random().toString(16).slice(2, 8)}`
      copy.x += offset
      copy.y += offset
      if (shape.groupId) {
        if (!groupRemap.has(shape.groupId)) groupRemap.set(shape.groupId, createGroupId())
        copy.groupId = groupRemap.get(shape.groupId)!
      }
      return copy
    })

    set({
      shapes: [...state.shapes, ...copies],
      selectedIds: copies.map((c) => c.id),
      dirty: true
    })
    return copies.map((c) => c.id)
  },

  groupShapes: (ids) => {
    const unique = [...new Set(ids)]
    if (unique.length < 2) return
    const groupId = createGroupId()
    const target = new Set(unique)
    set((state) => ({
      shapes: state.shapes.map((shape) => (target.has(shape.id) ? { ...shape, groupId } : shape)),
      dirty: true
    }))
  },

  ungroupShapes: (ids) => {
    const target = new Set(ids)
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        target.has(shape.id) && shape.groupId ? { ...shape, groupId: null } : shape
      ),
      dirty: true
    }))
  },

  // ------------------------------------------------------------ selection ---

  setSelection: (ids) =>
    set((state) => ({ selectedIds: expandGroups([...new Set(ids)], state.shapes) })),

  toggleSelection: (id) =>
    set((state) => {
      const has = state.selectedIds.includes(id)
      const next = has
        ? state.selectedIds.filter((existing) => existing !== id)
        : [...state.selectedIds, id]
      return { selectedIds: expandGroups(next, state.shapes) }
    }),

  selectAll: () => set((state) => ({ selectedIds: state.shapes.map((s) => s.id) })),

  clearSelection: () => set((state) => (state.selectedIds.length ? { selectedIds: [] } : state))
}))

// ----------------------------------------------------------------- selectors ---

export const selectSelectedShapes = (state: BoardState): Shape[] =>
  state.shapes.filter((shape) => state.selectedIds.includes(shape.id))

export const selectShapeById = (id: string | null) => (state: BoardState): Shape | undefined =>
  id ? state.shapes.find((shape) => shape.id === id) : undefined

export const selectCanUndo = (state: BoardState): boolean => state.past.length > 0
export const selectCanRedo = (state: BoardState): boolean => state.future.length > 0
