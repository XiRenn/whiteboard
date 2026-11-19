import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuCommand } from '@shared/ipc-contract'

/**
 * Native application menu.
 *
 * Every command item uses `registerAccelerator: false`: the accelerator text is
 * still rendered in the menu so the user can discover the shortcut, but the key
 * itself is handled by the renderer's own keydown listener. Without this, a
 * single Ctrl+Z would be processed twice — once by the menu and once by the
 * renderer — and the user would see a double undo.
 *
 * On macOS this is the real, visible menu bar. On Windows and Linux the bar is
 * hidden (`setMenuBarVisibility(false)` in `index.ts`) because the menu is drawn
 * inside the custom title bar instead — but the menu is still installed, because
 * the `role` items below are what supply the F11 / F12 / Ctrl+R / Ctrl+W / Alt+F4
 * accelerators that the renderer does not handle.
 *
 * The *visible* Windows/Linux menu comes from `@shared/menu-model`. This file
 * still hand-maintains its own list, so a new command has to be added in both
 * places; the two are not generated from one source.
 */
export function buildAppMenu(getWindow: () => BrowserWindow | null): void {
  const send = (command: MenuCommand) => () => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.onMenuCommand, command)
  }

  const item = (
    label: string,
    command: MenuCommand,
    accelerator?: string
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: send(command)
  })

  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        item('New Board', 'new-board', 'CmdOrCtrl+N'),
        item('Open Board…', 'open-board', 'CmdOrCtrl+O'),
        item('Save', 'save', 'CmdOrCtrl+S'),
        { type: 'separator' },
        item('Import Images…', 'import-image', 'CmdOrCtrl+I'),
        {
          label: 'Export',
          submenu: [
            item('PNG Image…', 'export-png', 'CmdOrCtrl+Shift+E'),
            item('SVG Vector…', 'export-svg'),
            item('PDF Document…', 'export-pdf')
          ]
        },
        { type: 'separator' },
        {
          label: 'Open Data Folder',
          click: () => {
            void shell.openPath(app.getPath('userData'))
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'undo', 'CmdOrCtrl+Z'),
        item('Redo', 'redo', 'CmdOrCtrl+Shift+Z'),
        { type: 'separator' },
        item('Duplicate', 'duplicate', 'CmdOrCtrl+D'),
        item('Delete', 'delete', 'Delete'),
        { type: 'separator' },
        item('Select All', 'select-all', 'CmdOrCtrl+A'),
        { type: 'separator' },
        item('Group', 'group', 'CmdOrCtrl+G'),
        item('Ungroup', 'ungroup', 'CmdOrCtrl+Shift+G')
      ]
    },
    {
      label: 'View',
      submenu: [
        item('Zoom In', 'zoom-in', 'CmdOrCtrl+Plus'),
        item('Zoom Out', 'zoom-out', 'CmdOrCtrl+-'),
        item('Reset Zoom', 'zoom-reset', 'CmdOrCtrl+0'),
        item('Zoom to Fit', 'zoom-fit', 'CmdOrCtrl+1'),
        { type: 'separator' },
        item('Toggle Grid', 'toggle-grid', "CmdOrCtrl+'"),
        item('Toggle Theme', 'toggle-theme', 'CmdOrCtrl+Shift+L'),
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
