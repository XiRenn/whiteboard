import { create } from 'zustand'
import type { AppPreferences, BoardMeta, RecoveryEntry } from '@shared/ipc-contract'
import type { Tool } from '@/types/tools'
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_STYLE,
  DEFAULT_FONT_FAMILY,
  STICKY_COLORS
} from '@/lib/constants'
import type { StyleDefaults } from '@/lib/shape-factory'

/**
 * Ephemeral UI state: the active tool, style defaults, theme, open panels,
 * toasts and save status. None of it is persisted in the board file — only the
 * handful of preferences that survive a restart go through `prefs.set`.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
}

export interface UiState {
  tool: Tool
  /** Tool to restore when a temporary mode (space-to-pan) ends. */
  toolBeforeTemporary: Tool | null

  style: StyleDefaults
  noteColor: string

  editingId: string | null

  themePreference: ThemePreference
  resolvedTheme: ResolvedTheme

  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  autosaveEnabled: boolean

  boardsPanelOpen: boolean
  stylePanelOpen: boolean
  exportDialogOpen: boolean
  shortcutsOpen: boolean

  /** Cached board list, refreshed after every create/rename/delete/save. */
  boards: BoardMeta[]
  boardsLoading: boolean
  setBoards: (boards: BoardMeta[]) => void
  setBoardsLoading: (loading: boolean) => void

  recoveryEntries: RecoveryEntry[]
  recoveryOpen: boolean

  spacePanning: boolean
  saveState: SaveState
  lastError: string | null
  toasts: Toast[]

  setTool: (tool: Tool) => void
  beginTemporaryTool: (tool: Tool) => void
  endTemporaryTool: () => void
  setStyle: (patch: Partial<StyleDefaults>) => void
  setNoteColor: (color: string) => void
  setEditingId: (id: string | null) => void

  setThemePreference: (preference: ThemePreference) => void
  setResolvedTheme: (theme: ResolvedTheme) => void

  setShowGrid: (value: boolean) => void
  setSnapToGrid: (value: boolean) => void
  setGridSize: (value: number) => void
  setAutosaveEnabled: (value: boolean) => void

  toggleBoardsPanel: () => void
  toggleStylePanel: () => void
  setExportDialogOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void

  setRecoveryEntries: (entries: RecoveryEntry[]) => void
  setRecoveryOpen: (open: boolean) => void

  setSpacePanning: (value: boolean) => void
  setSaveState: (state: SaveState, error?: string | null) => void
  pushToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void

  applyPreferences: (prefs: AppPreferences) => void
}

let toastSeq = 0

export const useUiStore = create<UiState>((set, get) => ({
  tool: 'select',
  toolBeforeTemporary: null,

  style: { ...DEFAULT_STYLE, fontFamily: DEFAULT_FONT_FAMILY },
  noteColor: STICKY_COLORS[0],

  editingId: null,

  themePreference: 'system',
  resolvedTheme: 'light',

  showGrid: true,
  snapToGrid: false,
  gridSize: DEFAULT_GRID_SIZE,
  autosaveEnabled: true,

  boardsPanelOpen: true,
  stylePanelOpen: true,
  exportDialogOpen: false,
  shortcutsOpen: false,

  boards: [],
  boardsLoading: false,

  recoveryEntries: [],
  recoveryOpen: false,

  spacePanning: false,
  saveState: 'idle',
  lastError: null,
  toasts: [],

  setTool: (tool) => set({ tool, editingId: null, toolBeforeTemporary: null }),

  /** Used by space-to-pan: switch away, then restore on release. */
  beginTemporaryTool: (tool) =>
    set((state) => ({
      toolBeforeTemporary: state.toolBeforeTemporary ?? state.tool,
      tool
    })),

  endTemporaryTool: () =>
    set((state) => ({
      tool: state.toolBeforeTemporary ?? state.tool,
      toolBeforeTemporary: null
    })),

  setStyle: (patch) => set((state) => ({ style: { ...state.style, ...patch } })),
  setNoteColor: (noteColor) => set({ noteColor }),
  setEditingId: (editingId) => set({ editingId }),

  setThemePreference: (themePreference) => set({ themePreference }),
  setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),

  setShowGrid: (showGrid) => set({ showGrid }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setGridSize: (gridSize) => set({ gridSize }),
  setAutosaveEnabled: (autosaveEnabled) => set({ autosaveEnabled }),

  toggleBoardsPanel: () => set((state) => ({ boardsPanelOpen: !state.boardsPanelOpen })),
  toggleStylePanel: () => set((state) => ({ stylePanelOpen: !state.stylePanelOpen })),
  setExportDialogOpen: (exportDialogOpen) => set({ exportDialogOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

  setBoards: (boards) => set({ boards }),
  setBoardsLoading: (boardsLoading) => set({ boardsLoading }),

  setRecoveryEntries: (recoveryEntries) => set({ recoveryEntries, recoveryOpen: recoveryEntries.length > 0 }),
  setRecoveryOpen: (recoveryOpen) => set({ recoveryOpen }),

  setSpacePanning: (spacePanning) => set({ spacePanning }),

  setSaveState: (saveState, error = null) => set({ saveState, lastError: error }),

  pushToast: (message, tone = 'info') => {
    const id = ++toastSeq
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }))
    // Errors stay long enough to read; everything else clears quickly.
    const ttl = tone === 'error' ? 6000 : 2600
    setTimeout(() => get().dismissToast(id), ttl)
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  applyPreferences: (prefs) =>
    set({
      themePreference: prefs.theme,
      showGrid: prefs.showGrid,
      snapToGrid: prefs.snapToGrid,
      gridSize: prefs.gridSize,
      autosaveEnabled: prefs.autosaveEnabled
    })
}))
