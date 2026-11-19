import { app, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import {
  APP_COMMANDS,
  IPC,
  type AppCommand,
  type AppInfo,
  type BoardDocument,
  type ExportRequest,
  type ImportedImage,
  type TitlebarTheme
} from '@shared/ipc-contract'
import * as storage from './storage'
import { importImages, saveExport } from './dialogs'
import { applyTitlebarTheme } from './titlebar'

/**
 * Every renderer request lands here.
 *
 * Two rules hold for all handlers:
 *  1. The sender must be our own window. A compromised or unexpected frame
 *     cannot drive the file layer.
 *  2. Payloads are validated in `storage` / `dialogs` before touching disk.
 */

let trustedSenderId: number | null = null

export function setTrustedSender(win: BrowserWindow): void {
  trustedSenderId = win.webContents.id
}

function isTrusted(event: IpcMainInvokeEvent): boolean {
  return trustedSenderId !== null && event.sender.id === trustedSenderId
}

type Handler<TArgs extends unknown[], TResult> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => TResult | Promise<TResult>

/** Wrap a handler with sender validation and error logging. */
function handle<TArgs extends unknown[], TResult>(channel: string, fn: Handler<TArgs, TResult>): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrusted(event)) throw new Error(`Rejected ${channel} from an untrusted sender`)
    try {
      return await fn(event, ...(args as TArgs))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[ipc] ${channel} failed: ${message}`)
      // Rethrow so the renderer receives a rejected promise it can surface.
      throw new Error(message)
    }
  })
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // ------------------------------------------------------------- boards ----
  handle(IPC.boardList, () => storage.listBoards())
  handle(IPC.boardCreate, (_e, name: string) => storage.createBoard(name))
  handle(IPC.boardLoad, (_e, id: string) => storage.readBoard(id))
  handle(IPC.boardExists, (_e, id: string) => storage.boardExists(id))

  handle(IPC.boardSave, async (_e, doc: BoardDocument) => {
    const { savedAt, sizeBytes } = await storage.writeBoard(doc)
    return { ok: true, savedAt, sizeBytes }
  })

  handle(IPC.boardRename, (_e, id: string, name: string) => storage.renameBoard(id, name))
  handle(IPC.boardDelete, async (_e, id: string) => {
    await storage.deleteBoard(id)
    return { ok: true }
  })
  handle(IPC.boardDuplicate, (_e, id: string, name: string) => storage.duplicateBoard(id, name))

  // ----------------------------------------------------------- recovery ----
  handle(IPC.recoveryList, () => storage.listRecovery())
  handle(IPC.recoveryRead, (_e, id: string) => storage.readRecoverySnapshot(id))
  handle(IPC.recoveryWrite, async (_e, doc: BoardDocument) => {
    await storage.writeRecovery(doc)
    return { ok: true }
  })
  handle(IPC.recoveryClear, async (_e, id: string) => {
    await storage.clearRecovery(id)
    return { ok: true }
  })

  // --------------------------------------------------------------- i/o -----
  handle(IPC.exportSave, (_e, req: ExportRequest) => saveExport(getWindow(), req))
  handle(IPC.imageImport, (): Promise<ImportedImage[]> => importImages(getWindow()))

  // -------------------------------------------------------------- prefs ----
  handle(IPC.prefsGet, () => storage.readPrefs())
  handle(IPC.prefsSet, (_e, patch: Record<string, unknown>) => storage.writePrefs(patch))

  handle(IPC.appInfo, (): AppInfo => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      userDataPath: app.getPath('userData')
    }
  })

  // ---------------------------------------------------------- titlebar -----
  //
  // These act on the window rather than the document, so they belong here and
  // not in `useMenuCommands`. The command name is validated against the
  // enumerated union before dispatch — the renderer can only reach a command
  // that was deliberately declared, never an arbitrary one.
  handle(IPC.appCommand, (_e, command: AppCommand) => {
    if (!APP_COMMANDS.includes(command)) {
      throw new Error(`Unknown app command: ${String(command).slice(0, 32)}`)
    }
    const win = getWindow()

    switch (command) {
      case 'open-data-folder':
        void shell.openPath(app.getPath('userData'))
        return
      case 'toggle-devtools':
        win?.webContents.toggleDevTools()
        return
      case 'reload':
        win?.webContents.reload()
        return
      case 'toggle-fullscreen':
        if (win) win.setFullScreen(!win.isFullScreen())
        return
      case 'minimize':
        win?.minimize()
        return
      case 'close-window':
        // Routed through `close()` so it takes the same flush-then-quit path as
        // clicking the OS close button; the renderer still gets to save first.
        win?.close()
        return
      case 'quit':
        app.quit()
        return
    }
  })

  handle(IPC.appTitlebarTheme, (_e, theme: TitlebarTheme) => {
    if (theme !== 'light' && theme !== 'dark') {
      throw new Error(`Invalid titlebar theme: ${String(theme).slice(0, 16)}`)
    }
    applyTitlebarTheme(getWindow(), theme)
  })
}
