import { app, BrowserWindow, ipcMain, session } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { IPC } from '@shared/ipc-contract'
import { registerIpc, setTrustedSender } from './ipc'
import { buildAppMenu } from './menu'
import { resolveTitlebarTheme, titlebarOverlayFor } from './titlebar'
import { clearAllRecovery, readPrefs } from './storage'

// ---------------------------------------------------------------- GPU traps ---
//
// On machines without a usable GPU (VMs, RDP sessions, locked-down sandboxes)
// Chromium aborts with a *fatal* error instead of degrading gracefully:
//
//   FATAL:gpu_data_manager_impl_private.cc(423)] GPU process isn't usable. Goodbye.
//
// `disableHardwareAcceleration()` alone is not enough — Chromium still brings up
// a GL implementation and dies. `in-process-gpu` is the switch that actually
// keeps the process tree alive, because it stops Chromium spawning a separate
// GPU process that can fail on its own and take the whole app down.
const SOFTWARE_GL_FLAG = '--whiteboard-software-gl'
const NO_SANDBOX_FLAG = '--whiteboard-no-sandbox'
const APP_ARGS = process.argv.slice(app.isPackaged ? 1 : 2)

function enableSoftwareRendering(): void {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-gpu-rasterization')
  app.commandLine.appendSwitch('in-process-gpu')
}

if (APP_ARGS.includes(SOFTWARE_GL_FLAG) || process.env.WHITEBOARD_SOFTWARE_GL === '1') {
  enableSoftwareRendering()
}

/**
 * Escape hatch for locked-down environments.
 *
 * Some managed Windows images, VMs and remote-desktop sessions cannot start
 * Chromium's renderer sandbox at all — the renderer dies during startup and the
 * window loads nothing. The correct fix is the environment, not the app, so this
 * is strictly opt-in and off by default:
 *
 *   set WHITEBOARD_NO_SANDBOX=1        (or pass --whiteboard-no-sandbox)
 *
 * Running with the sandbox off removes a real security boundary. It is
 * documented here rather than silently enabled, and it is logged loudly when it
 * is active so nobody forgets it is on.
 */
const sandboxDisabled =
  APP_ARGS.includes(NO_SANDBOX_FLAG) || process.env.WHITEBOARD_NO_SANDBOX === '1'

if (sandboxDisabled) {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  console.warn(
    '[security] Chromium sandbox DISABLED (WHITEBOARD_NO_SANDBOX). ' +
      'Only use this on machines where the sandbox cannot start.'
  )
}

let relaunchAttempted = false
app.on('child-process-gone', (_event, details) => {
  if (!details || details.type !== 'GPU') return
  // A deliberate, clean kill is not a failure.
  if (details.reason === 'killed' && details.exitCode === 0) return
  if (relaunchAttempted || APP_ARGS.includes(SOFTWARE_GL_FLAG)) return
  relaunchAttempted = true
  console.error(
    `[gpu] process gone (${details.reason}/${details.exitCode}) — restarting with software rendering`
  )

  // The lock MUST be released before relaunching. The replacement process starts
  // while this one is still shutting down; without this it fails to acquire the
  // lock, calls app.quit(), and the user sees the app flash and disappear.
  app.releaseSingleInstanceLock()
  // `relaunch` replaces the whole argument list; Electron supplies argv[0].
  app.relaunch({ args: [...APP_ARGS, SOFTWARE_GL_FLAG] })
  app.exit(0)
})

// ------------------------------------------------------------ single instance ---

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

const APP_USER_MODEL_ID = 'com.xirenn.whiteboard'
if (process.platform === 'win32') {
  // In development there is no Start Menu shortcut to match, so the executable
  // path is the identity Windows can actually resolve.
  app.setAppUserModelId(app.isPackaged ? APP_USER_MODEL_ID : process.execPath)
}

// ------------------------------------------------------------------ window ---

const isDev = !app.isPackaged
const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL']
const SMOKE = process.env.WHITEBOARD_SMOKE === '1'

let mainWindow: BrowserWindow | null = null
const getWindow = (): BrowserWindow | null => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)

/** Renderer console output, buffered for the smoke check. */
const rendererLog: string[] = []

async function createWindow(): Promise<void> {
  const prefs = await readPrefs()

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: 'Whiteboard',
    backgroundColor: prefs.theme === 'light' ? '#f6f7f9' : '#0f1115',
    // The renderer draws the title bar; Windows keeps drawing the window
    // buttons, in an overlay sized to match. See `titlebar.ts`.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? {}
      : { titleBarOverlay: titlebarOverlayFor(resolveTitlebarTheme(prefs.theme)) }),
    // The menu bar is hidden on Windows/Linux because the menu now lives inside
    // the custom title bar. The menu itself stays *installed* — it is what
    // supplies the F11 / F12 / Ctrl+R / Ctrl+W / Alt+F4 accelerators, which the
    // renderer does not handle. Hiding the bar keeps those working while
    // removing the second row of chrome. `autoHideMenuBar: false` stops Alt
    // from revealing it again, which would look wrong under a custom title bar.
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The three settings that keep the renderer unable to touch the filesystem.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      // A whiteboard has no use for a <webview>.
      webviewTag: false
    }
  })

  setTrustedSender(mainWindow)

  // Renderer-side errors are invisible from the main process, which makes a
  // silently blank canvas very hard to diagnose. Buffer them for the smoke
  // check so a thrown exception in the Konva tree shows up in the log.
  if (SMOKE) {
    mainWindow.webContents.on('console-message', (event) => {
      rendererLog.push(`[console:${event.level}] ${event.message}`)
    })
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      rendererLog.push(`[renderer-gone] ${details.reason}/${details.exitCode}`)
    })
    mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
      rendererLog.push(`[fail-load] ${code} ${description}`)
    })
  }

  // macOS puts the app menu in the system menu bar, where it belongs and where
  // hiding it is not an option. Everywhere else the menu bar is redundant now
  // that the menu is rendered inside the title bar.
  if (process.platform !== 'darwin') mainWindow.setMenuBarVisibility(false)

  mainWindow.once('ready-to-show', () => {
    if (!SMOKE) mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (shutdownDone) return
    event.preventDefault()
    beginShutdown(getWindow())
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (SMOKE) void runSmokeCheck()
  })

  if (DEV_SERVER_URL) {
    await mainWindow.loadURL(DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ------------------------------------------------------------ security wall ---

function installSecurityPolicy(): void {
  // 1. No new windows, ever. An offline whiteboard has no legitimate reason to
  //    spawn one; anything that tries is either a bug or an attack.
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      console.warn(`[security] blocked window.open -> ${url}`)
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      const allowed = DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL)
      if (!allowed) {
        event.preventDefault()
        console.warn(`[security] blocked navigation -> ${url}`)
      }
    })

    // Nothing in this app should ever ask for a permission.
    contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  })

  // 2. Block every network request that is not a local resource. This is the
  //    enforcement point for "works completely offline": even if some dependency
  //    tried to phone home, the request never leaves the process.
  const devOrigin = DEV_SERVER_URL ? new URL(DEV_SERVER_URL) : null
  const devWsOrigin = devOrigin ? `ws://${devOrigin.host}` : null

  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const { url } = details
    if (devOrigin && (url.startsWith(devOrigin.origin) || (devWsOrigin && url.startsWith(devWsOrigin)))) {
      return callback({})
    }
    if (url.startsWith('devtools://')) return callback({})
    console.warn(`[security] blocked network request -> ${url}`)
    callback({ cancel: true })
  })
}

// ----------------------------------------------------------------- shutdown ---

let shutdownStarted = false
let shutdownDone = false

/** Ask the renderer to flush pending writes; never wait longer than 2.5s. */
function flushRenderer(win: BrowserWindow | null): Promise<void> {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return Promise.resolve()
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ipcMain.removeListener(IPC.appFlushDone, finish)
      resolve()
    }
    const timer = setTimeout(finish, 2500)
    ipcMain.once(IPC.appFlushDone, finish)
    win.webContents.send(IPC.onBeforeQuit)
  })
}

function beginShutdown(win: BrowserWindow | null): void {
  if (shutdownStarted || shutdownDone) return
  shutdownStarted = true
  void (async () => {
    try {
      await flushRenderer(win)
    } catch (error) {
      console.error('[shutdown] renderer flush failed', error)
    }
    // The session ended normally, so the heartbeat snapshots are no longer
    // needed — leaving them behind would offer a bogus recovery next launch.
    await clearAllRecovery().catch(() => {})
    shutdownDone = true
    app.quit()
  })()
}

app.on('before-quit', (event) => {
  if (shutdownDone) return
  event.preventDefault()
  beginShutdown(getWindow())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})

// -------------------------------------------------------------------- smoke ---
//
// Optional end-to-end check used during development. It proves the preload
// bridge, the IPC channel and the renderer bundle all work in the *built* app —
// which a successful `electron-vite build` does not.
//
//   WHITEBOARD_SMOKE=1 npm start
//
async function runSmokeCheck(): Promise<void> {
  const lines: string[] = []
  try {
    await new Promise((r) => setTimeout(r, 2500))
    const result = await mainWindow?.webContents.executeJavaScript(
      `(() => {
         const root = document.getElementById('root')
         const bridge = typeof window.whiteboard === 'object' && window.whiteboard !== null
         const api = bridge ? Object.keys(window.whiteboard).sort() : []
         return { children: root ? root.childElementCount : -1, bridge, api, title: document.title }
       })()`
    )
    lines.push(`renderer=${JSON.stringify(result)}`)
    const boardCount = await mainWindow?.webContents.executeJavaScript(
      `window.whiteboard.boards.list().then(b => b.length).catch(e => 'ERR:' + e.message)`
    )
    lines.push(`boards=${JSON.stringify(boardCount)}`)

    // Canvas diagnostics. A blank workspace with a populated document means the
    // Konva stage never painted, and the cause is either "the stage was never
    // mounted" (zero-measured container) or "it mounted but the pixels are not
    // there". Counting non-transparent pixels tells the two apart directly,
    // which DOM inspection alone cannot.
    const canvas = await mainWindow?.webContents.executeJavaScript(
      `(() => {
         const content = document.querySelector('.konvajs-content')
         const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
           const r = c.getBoundingClientRect()
           const s = getComputedStyle(c)
           let painted = -1
           try {
             const ctx = c.getContext('2d')
             const data = ctx.getImageData(0, 0, c.width, c.height).data
             painted = 0
             for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) painted++
           } catch (e) { painted = 'ERR:' + e.message }
           return {
             attr: c.width + 'x' + c.height,
             css: Math.round(r.width) + 'x' + Math.round(r.height),
             at: Math.round(r.x) + ',' + Math.round(r.y),
             display: s.display, visibility: s.visibility, opacity: s.opacity,
             painted
           }
         })
         const main = document.querySelector('main')
         const mr = main ? main.getBoundingClientRect() : null
         return {
           content: content ? content.getBoundingClientRect().width + 'x' + content.getBoundingClientRect().height : 'MISSING',
           contentChildren: content ? content.childElementCount : -1,
           contentTags: content ? Array.from(content.children).map((e) => e.tagName).join(',') : '',
           contentHTML: content ? content.innerHTML.slice(0, 200) : '',
           main: mr ? Math.round(mr.width) + 'x' + Math.round(mr.height) : 'MISSING',
           count: canvases.length,
           canvases
         }
       })()`
    )
    lines.push(`canvas=${JSON.stringify(canvas)}`)

    // Dump the main layer as a PNG. `capturePage()` is unreliable here (it can
    // return a stale frame), whereas the layer canvas re-runs the draw commands
    // and shows exactly what was painted.
    const shot = await mainWindow?.webContents.executeJavaScript(
      `(() => { const c = document.querySelectorAll('canvas')[1]; return c ? c.toDataURL('image/png') : null })()`
    )
    if (typeof shot === 'string' && shot.startsWith('data:image/png;base64,')) {
      const shotPath = join(tmpdir(), 'whiteboard-canvas.png')
      await fs.writeFile(shotPath, Buffer.from(shot.slice(22), 'base64'))
      lines.push(`shot=${shotPath}`)
    }
    if (rendererLog.length > 0) lines.push(`renderer-log=${JSON.stringify(rendererLog.slice(0, 20))}`)
  } catch (error) {
    lines.push(`error=${error instanceof Error ? error.message : String(error)}`)
  }

  const logPath = join(tmpdir(), 'whiteboard-smoke.log')
  await fs.writeFile(logPath, lines.join('\n'), 'utf8').catch(() => {})
  console.log(`[smoke] ${lines.join(' | ')}`)
  app.exit(0)
}

// --------------------------------------------------------------------- boot ---

app.whenReady().then(async () => {
  if (isDev) {
    console.log(
      `[boot] whiteboard ${app.getVersion()} — userData=${app.getPath('userData')} renderer=${
        DEV_SERVER_URL ?? 'file://out/renderer/index.html'
      }`
    )
  }

  installSecurityPolicy()
  registerIpc(getWindow)
  buildAppMenu(getWindow)
  await createWindow()

  app.on('second-instance', () => {
    const win = getWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
})
