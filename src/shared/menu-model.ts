import type { AppCommand, MenuCommand } from './ipc-contract'

/**
 * The application menu, defined once.
 *
 * Two consumers read this:
 *
 *   - `src/main/menu.ts` builds the native menu from it. On macOS that is the
 *     real menu bar; on Windows/Linux the bar is hidden but the menu is still
 *     installed, because it is what gives us the `role` accelerators
 *     (F11, F12, Ctrl+R, Ctrl+W, Alt+F4) for free.
 *   - `src/renderer/src/components/TitleBarMenu.tsx` renders the same structure
 *     as in-app dropdowns inside the custom titlebar.
 *
 * Keeping one model means a menu item can never exist in one place and not the
 * other — the failure mode of hand-maintaining two menus.
 */

export type MenuAction =
  /** Handled by the renderer, dispatched through `useMenuCommands`. */
  | { kind: 'command'; command: MenuCommand }
  /** Handled by the main process, sent over `IPC.appCommand`. */
  | { kind: 'app'; command: AppCommand }

export interface MenuItem {
  label: string
  /**
   * Display only. The renderer's own keydown listener owns the actual key —
   * see the note in `useKeyboardShortcuts`. Shown right-aligned in the menu.
   */
  accelerator?: string
  action: MenuAction
  /** Draw a separator beneath this item. */
  separatorAfter?: boolean
}

export interface MenuSection {
  id: string
  label: string
  items: MenuItem[]
}

const command = (label: string, cmd: MenuCommand, accelerator?: string, separatorAfter?: boolean): MenuItem => ({
  label,
  accelerator,
  action: { kind: 'command', command: cmd },
  separatorAfter
})

const appCommand = (label: string, cmd: AppCommand, accelerator?: string, separatorAfter?: boolean): MenuItem => ({
  label,
  accelerator,
  action: { kind: 'app', command: cmd },
  separatorAfter
})

export const MENU_MODEL: readonly MenuSection[] = [
  {
    id: 'file',
    label: 'File',
    items: [
      command('New Board', 'new-board', 'Ctrl+N'),
      command('Open Board…', 'open-board', 'Ctrl+O'),
      command('Save', 'save', 'Ctrl+S', true),
      command('Import Images…', 'import-image', 'Ctrl+I'),
      // The native menu nests these under an "Export" submenu. Flattened here:
      // a nested flyout in a 48px titlebar is more fiddly than it is worth.
      command('Export PNG…', 'export-png', 'Ctrl+Shift+E'),
      command('Export SVG…', 'export-svg'),
      command('Export PDF…', 'export-pdf', undefined, true),
      appCommand('Open Data Folder', 'open-data-folder', undefined, true),
      appCommand('Exit', 'quit', 'Alt+F4')
    ]
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      command('Undo', 'undo', 'Ctrl+Z'),
      command('Redo', 'redo', 'Ctrl+Shift+Z', true),
      command('Duplicate', 'duplicate', 'Ctrl+D'),
      command('Delete', 'delete', 'Del', true),
      command('Select All', 'select-all', 'Ctrl+A', true),
      command('Group', 'group', 'Ctrl+G'),
      command('Ungroup', 'ungroup', 'Ctrl+Shift+G')
    ]
  },
  {
    id: 'view',
    label: 'View',
    items: [
      command('Zoom In', 'zoom-in', 'Ctrl++'),
      command('Zoom Out', 'zoom-out', 'Ctrl+-'),
      command('Reset Zoom', 'zoom-reset', 'Ctrl+0'),
      command('Zoom to Fit', 'zoom-fit', 'Ctrl+1', true),
      command('Toggle Grid', 'toggle-grid', "Ctrl+'"),
      command('Toggle Theme', 'toggle-theme', 'Ctrl+Shift+L', true),
      appCommand('Toggle Developer Tools', 'toggle-devtools', 'F12'),
      appCommand('Reload', 'reload', 'Ctrl+R')
    ]
  },
  {
    id: 'window',
    label: 'Window',
    items: [
      appCommand('Minimize', 'minimize'),
      appCommand('Toggle Full Screen', 'toggle-fullscreen', 'F11', true),
      appCommand('Close Window', 'close-window', 'Ctrl+W')
    ]
  }
] as const
