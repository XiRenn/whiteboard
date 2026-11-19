# Whiteboard

An offline-first, infinite-canvas whiteboard for the desktop. Draw, annotate,
diagram and export — with no account, no cloud and no network traffic at any
point.

Built with Electron, React, TypeScript, Konva and Zustand.

---

## Features

- **Infinite canvas** — smooth zoom (5%–1600%) and pan, with an adaptive dot
  grid that keeps its spacing readable at every zoom level.
- **Drawing tools** — freehand pen, eraser, text, sticky notes, rectangles,
  ellipses, lines and arrows. Import images from disk.
- **Full object editing** — select, move, resize, rotate, duplicate, group and
  delete. Multi-select via shift-click or marquee drag.
- **Undo / redo** — 200 steps of history, keyboard-driven.
- **Multiple boards** — create, rename, duplicate, open and delete.
- **Autosave and crash recovery** — writes are atomic; an abnormal exit leaves a
  recovery snapshot you are offered on next launch.
- **Export** — PNG (true high-resolution re-render, not a screenshot), vector
  SVG, and PDF sized to your content.
- **Dark and light themes**, responsive panels, and a keyboard shortcut for
  everything.

## Requirements

- **Node.js 22.12 or newer** (required by Electron 44's install script).
- Windows 10/11 for the packaged installer. macOS and Linux targets are
  configured but untested here.
- No network access is required at any point — including first run.

## Getting started

```bash
npm install
npm run icon     # generates build/icon.png (gitignored)
npm run dev      # launches with hot reload
```

> `npm run icon` is not optional on a fresh clone. `build/icon.png` is
> gitignored, so without it the packaging step ships the default Electron icon.
> The `pack` / `dist*` scripts run it for you; `dev` does not need it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev run with HMR for the renderer |
| `npm run start` | Preview the production build without packaging |
| `npm test` | Core logic suite (29 assertions, runs in plain Node) |
| `npm run verify:text` | Drives the built app over the DevTools Protocol and checks the text tool end to end |
| `npm run typecheck` | Type-checks the node and web projects |
| `npm run build` | Typecheck, then build all three targets into `out/` |
| `npm run pack` | Build, then an unpacked app in `release/win-unpacked/` |
| `npm run dist:installer` | Build, then an NSIS `setup.exe` |
| `npm run dist:portable` | Build, then a single-file portable `.exe` |
| `npm run dist:mac` / `dist:linux` | Build for macOS / Linux |

`npm run pack` is the honest test target — `win-unpacked/` is the exact tree the
installer wraps, so verify there before shipping.

`npm run verify:text` launches the **built** app, dispatches genuine mouse and
keyboard events through the DevTools Protocol, and asserts on the rendered DOM
and the saved document. Run `npm run build` first. Screenshots land in
`.review/`. It is the only check that exercises pointer input, so it catches
classes of bug that neither the type checker nor the core suite can see.

## Keyboard shortcuts

Press <kbd>?</kbd> in the app for this list.

### Tools

| Key | Tool | | Key | Tool |
|---|---|---|---|---|
| <kbd>V</kbd> | Select | | <kbd>R</kbd> | Rectangle |
| <kbd>H</kbd> | Pan | | <kbd>O</kbd> | Ellipse |
| <kbd>P</kbd> | Pen | | <kbd>L</kbd> | Line |
| <kbd>E</kbd> | Eraser | | <kbd>A</kbd> | Arrow |
| <kbd>T</kbd> | Text | | <kbd>I</kbd> | Import image |
| <kbd>N</kbd> | Sticky note | | | |

### Editing

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Undo / redo |
| <kbd>Ctrl</kbd>+<kbd>Y</kbd> | Redo |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select all |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> | Copy / cut / paste |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate selection |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> | Group / ungroup |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd> | Delete selection |
| <kbd>Esc</kbd> | Clear selection, then return to Select |

### View and file

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save now |
| <kbd>Ctrl</kbd>+<kbd>N</kbd> | New board |
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | Toggle the boards panel |
| <kbd>Ctrl</kbd>+<kbd>I</kbd> | Import images |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> | Export PNG |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Toggle dark / light theme |
| <kbd>Ctrl</kbd>+<kbd>0</kbd> / <kbd>1</kbd> | Reset zoom / zoom to fit |
| <kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>-</kbd> | Zoom in / out |

### Mouse

| Input | Action |
|---|---|
| Wheel | Pan vertically |
| <kbd>Shift</kbd>+wheel | Pan horizontally |
| <kbd>Ctrl</kbd>+wheel | Zoom at the pointer |
| <kbd>Space</kbd> (hold) + drag | Pan |
| <kbd>Shift</kbd>-click | Add to / remove from selection |
| Drag on empty canvas | Marquee select |

## Architecture

```
src/
  shared/ipc-contract.ts   the boundary: channel names, DTOs, size limits
  main/                    Node side — storage, dialogs, menu, ipc, lifecycle
  preload/index.ts         contextBridge surface (enumerated, frozen)
  renderer/src/
    types/                 Shape union, tool definitions
    lib/                   pure logic — geometry, text, factory, transform, SVG
    store/                 useBoardStore (document + history), useUiStore (UI)
    services/              canvas registry, export, image import, viewport
    hooks/                 autosave, keyboard, menu, theme, element size
    components/            canvas/, dialogs/, ui/
```

Three processes, three jobs. The renderer owns all drawing and state; the main
process owns all disk and OS access; the preload is the only thing that connects
them.

### The decisions that matter

**The model is the source of truth.** Konva nodes are rebuilt from the Zustand
document on every render. Nothing is ever read back out of the Konva scene graph
except during an active transform, where it is unavoidable. This is what keeps
undo, export and save consistent — they all read the same model.

**`snapshot()` runs before a mutation, never after.** Undo restores a
deep-cloned document. Selection is deliberately excluded from history, so
clicking around the canvas never consumes an undo step.

**Persistence is two layers.** A debounced autosave (700 ms) writes the board
file; a 5-second heartbeat writes a separate recovery snapshot while the board
is dirty. Both use write-then-rename, so a crash mid-write cannot corrupt an
existing board. On a clean shutdown the recovery snapshots are deleted — which
means a snapshot that survives to the next launch is proof of an abnormal exit,
and the app offers to restore it.

**Scale is baked, not accumulated.** The transformer's scale factor is
multiplied into a shape's width/height (or its point list) and then reset to 1.
Rotations are normalised into 0–360. A shape never accumulates floating-point
drift no matter how many times it is resized.

**Rendering stays bounded on large boards.** Above 300 shapes the canvas culls
anything outside the visible rect (plus 240 px of slack). The dot grid is a
single Konva `Shape` with a custom `sceneFunc` — one path, not thousands of
nodes — and its step doubles or halves to stay within an 18–64 px band.

**Export never screenshots.** Konva's `toDataURL` re-executes every drawing
command into a fresh canvas at the requested pixel ratio, so PNG and PDF are
genuine high-resolution re-renders. SVG does not touch Konva at all — it is
serialised straight from the model, which is why it stays true vector output.

**The keyboard has exactly one owner.** The native menu sets
`registerAccelerator: false` on every command, so it displays the shortcut but
does not claim the key. That is why <kbd>Ctrl</kbd>+<kbd>Z</kbd> never undoes
twice.

## Security posture

This is a local-first app, so the renderer is treated as untrusted even though
we wrote it.

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- No raw `ipcRenderer` in the renderer. The bridge is an enumerated, frozen API.
- **No filesystem path ever crosses the IPC boundary.** The renderer sends a
  board *id*, never a path. Paths are built in the main process from ids that
  must match `^[a-z0-9][a-z0-9-]{5,63}$` — a pattern that cannot contain a
  separator, so traversal is structurally impossible rather than filtered.
- Every IPC handler validates the sender before acting.
- `window.open` is denied, navigation is blocked, and every permission request
  is refused.
- **All non-local network requests are cancelled** in `onBeforeRequest`. This is
  the enforcement point for "works completely offline" — even a dependency that
  tried to phone home would be stopped in-process.

## Where your data lives

Everything is plain JSON under Electron's `userData` directory — on Windows,
`%APPDATA%\Whiteboard`.

```
boards/<id>.board.json        your boards
boards/<id>.board.json.tmp    write journal — only present if a write was cut short
recovery/<id>.json            crash-recovery snapshot, deleted on clean exit
preferences.json              theme, last opened board, grid settings
```

Boards are portable: copy the `.board.json` files to another machine and they
open as-is. Deleting a board is permanent — it unlinks the board file, any
write journal, and its recovery snapshot. The UI asks for confirmation first,
but there is no trash folder to recover from, so back up anything you care
about.

**Limits:** a board document may be up to 64 MB; a single imported image up to
12 MB; up to 20 images per import.

## Configuration

The app takes no configuration, but three development escape hatches exist.
None are needed on a normal machine.

| Variable | Flag | Purpose |
|---|---|---|
| `WHITEBOARD_NO_SANDBOX=1` | `--whiteboard-no-sandbox` | Disables Chromium's sandbox for environments where it cannot start |
| `WHITEBOARD_SOFTWARE_GL=1` | `--whiteboard-software-gl` | Forces software rendering |
| `WHITEBOARD_SMOKE=1` | — | Runs a self-check and exits, writing to `%TEMP%\whiteboard-smoke.log` |

The smoke check boots the real window and reports the preload bridge, the board
count, the canvas DOM (layer canvases and how many pixels each one actually
painted), any renderer console output, and a PNG of the main layer written to
`%TEMP%\whiteboard-canvas.png`. That is enough to tell "the stage never mounted"
apart from "it mounted but nothing was drawn" without attaching a debugger:

```bash
WHITEBOARD_SMOKE=1 WHITEBOARD_NO_SANDBOX=1 npm run dev
```

> **`WHITEBOARD_NO_SANDBOX` removes a real security boundary.** It exists for
> managed Windows images, VMs and remote-desktop sessions where Chromium's
> renderer sandbox cannot initialise at all. It is opt-in, off by default, and
> logs a loud warning when active. Do not ship with it on.

## Troubleshooting

**The window opens blank or the app exits immediately.**
Chromium's sandbox cannot start in some locked-down environments. Try
`WHITEBOARD_NO_SANDBOX=1 npm run dev`. If the app then works, the environment is
the problem, not the app.

**A GPU crash on launch.**
The app detects a GPU process failure and relaunches itself once with software
rendering. If it keeps happening, force it directly with
`WHITEBOARD_SOFTWARE_GL=1`.

**Nothing responds to clicks, but the UI looks normal.**
The crash-recovery dialog is open. It renders a full-window backdrop that
swallows every pointer event, so the app looks idle while nothing is
clickable. It appears whenever the previous run did not shut down cleanly —
including a hard kill from a script or Task Manager. Restore or discard the
snapshot to clear it. If you are scripting the app, quit it through
`window.whiteboard.app.command('quit')` rather than killing the process, or the
next run will start with the dialog up.

**Packaging fails with `EBUSY: resource busy or locked` on a file in `release/`.**
Something outside the build is holding a handle on a file in the output
directory — almost always your editor's file watcher, since `release/` contains
thousands of generated files. The build cannot wait for it, and the error names
a file you have never opened.

Confirm it is a real lock rather than a transient one by trying to rename the
file; `Device or resource busy` means a genuine OS handle:

```bash
mv "release/win-unpacked.tmp/resources/default_app.asar" /tmp/probe
```

Close the editor (or reboot to release the handle), then delete the stale
output. To avoid it entirely, either build to a fresh directory:

```bash
npx electron-builder --dir -c.directories.output=release2
```

or stop the editor watching generated output. `.vscode/settings.json` in this
repo already excludes `out/`, `release*/`, `dist/` and `.test-out/` from the
watcher and the search indexer — if you use a different editor, configure the
equivalent.

**The UI renders but the workspace is blank — the canvas draws nothing.**
The document is fine (the status bar still counts its objects); the Konva scene
graph failed to build. Check the renderer console for
`Cannot read properties of undefined (reading 'getParent')` alongside react-konva
warnings reading `Text components are not supported for now`.

The cause is a whitespace-only text node between two JSX elements **on the same
line**:

```jsx
<Layer listening={!isPanning}>            <Group>
```

JSX preserves that run of spaces as a real text child. react-konva cannot append
a text instance to a Konva container, so it passes `undefined` to
`Container.add()`, which immediately dereferences `child.getParent()` and throws.
The throw aborts the whole tree, so no layer canvases are ever created — the
container is correctly sized, but empty. Put the opening tag on its own line.
`npm test` guards against this.

**`Cannot find module @rollup/rollup-win32-x64-msvc` (or `@esbuild/win32-x64`).**
A known npm optional-dependency bug. Install the platform package explicitly at
the version your lockfile already resolved:

```bash
npm install --ignore-scripts @rollup/rollup-win32-x64-msvc@4.63.5
npm install --ignore-scripts @esbuild/win32-x64
```

**`npm install` fails with `EBUSY` during a postinstall step.**
Re-run with `npm install --ignore-scripts`, then run
`node node_modules/electron/install.js` to fetch the Electron binary.

**`electron --version` prints a Node version.**
`ELECTRON_RUN_AS_NODE` is set in your environment. Run Electron with it cleared:
`env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron --version`.

## License

MIT
