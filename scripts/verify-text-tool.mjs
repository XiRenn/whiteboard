/**
 * End-to-end check of the text tool against the built app, using real input
 * events over the DevTools Protocol.
 *
 *   npm run verify:text        (requires a build: npm run build)
 *
 * Notes for anyone re-running this:
 *  - The app shows its crash-recovery dialog if a previous run was killed, and
 *    that dialog covers the whole window and swallows every click. The run
 *    fails fast if a dialog is present, and quits through the app's own
 *    `app.command('quit')` so it leaves no snapshot behind.
 *  - Always `Page.bringToFront` before dispatching input.
 *  - Do NOT assert on `getImageData` pixel counts here: in some environments the
 *    2D readback reports a stale frame, so a canvas that visibly redrew measures
 *    as unchanged. `toDataURL` is reliable, so compare a hash of that instead.
 *  - Screenshots land in `.review/`.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 9419
const OUT = path.join(ROOT, '.review')
mkdirSync(OUT, { recursive: true })
const req = createRequire(path.join(ROOT, 'package.json'))
const electronPath = req('electron')
const { ELECTRON_RUN_AS_NODE, ...env } = process.env
const child = spawn(
  electronPath,
  ['.', `--remote-debugging-port=${PORT}`, '--in-process-gpu', '--no-sandbox'],
  { cwd: ROOT, env: { ...env, WHITEBOARD_NO_SANDBOX: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }
)
child.stdout.on('data', (d) => process.stdout.write('[app] ' + d))
child.stderr.on('data', (d) => process.stderr.write('[app] ' + d))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (p) return p
    } catch {}
    await sleep(500)
  }
  throw new Error('no devtools target')
}
const page = await findTarget()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', () => rej(new Error('ws failed')), { once: true })
})
let nextId = 1
const pending = new Map()
const exceptions = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject, timer } = pending.get(m.id)
    pending.delete(m.id)
    clearTimeout(timer)
    if (m.error) reject(new Error(JSON.stringify(m.error)))
    else resolve(m.result)
    return
  }
  if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text)
})
function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)) }, 15000)
    pending.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result.value
}
async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, clickCount: 0 })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
}
async function doubleClick(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, clickCount: 0 })
  for (const n of [1, 2]) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: n })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: n })
  }
}
async function typeText(text) {
  for (const ch of text) {
    const code = ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`
    const vk = ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0)
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown', text: ch, unmodifiedText: ch, key: ch, code, windowsVirtualKeyCode: vk
    })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk })
  }
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'))
}
async function layerPng(name) {
  const d = await ev(`(() => { const c = document.querySelectorAll('canvas')[1]; return c ? c.toDataURL('image/png') : null })()`)
  if (d) writeFileSync(path.join(OUT, name), Buffer.from(d.slice(22), 'base64'))
}
/** Hash of the main layer's pixels, via toDataURL (getImageData can be stale). */
const canvasHash = () =>
  ev(`(() => {
    const c = document.querySelectorAll('canvas')[1]
    if (!c) return null
    const s = c.toDataURL('image/png')
    let h = 0
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
    return h + ':' + s.length
  })()`)
/** Ctrl+S then read the document back — authoritative for object counts. */
async function saveAndLoad() {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 })
  await sleep(1300)
  return ev(`(async () => {
    const list = await window.whiteboard.boards.list()
    const doc = await window.whiteboard.boards.load(list[0].id)
    return { board: doc.name, total: doc.shapes.length,
             texts: doc.shapes.filter((s) => s.type === 'text').map((s) => s.text) }
  })()`)
}
const overlay = () =>
  ev(`(() => {
    const t = document.querySelector('textarea')
    const a = document.activeElement
    if (!t) return { present: false, activeTag: a ? a.tagName : 'none' }
    const s = getComputedStyle(t)
    return { present: true, value: t.value, focused: a === t, activeTag: a ? a.tagName : 'none',
             fontFamily: s.fontFamily, fontSize: s.fontSize, lineHeight: s.lineHeight, textAlign: s.textAlign }
  })()`)

await send('Runtime.enable')
await send('Page.enable')
await sleep(4000)
await send('Page.bringToFront')
await sleep(300)

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const dialog = await ev(`(() => { const d = document.querySelector('[role="dialog"]'); return d ? d.getAttribute('aria-label') : null })()`)
if (dialog) {
  console.log(`ABORT: a modal dialog is open ("${dialog}") — it covers the window and swallows clicks.`)
  await ev(`window.whiteboard.app.command('quit')`).catch(() => {})
  await sleep(2000)
  process.exit(2)
}

for (let i = 0; i < 40; i++) {
  if ((await canvasHash()) !== null) break
  await sleep(250)
}

const tool = await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label')||'').startsWith('Text —'))
  const r = b.getBoundingClientRect()
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }
})()`)
const main = await ev(`(() => { const r = document.querySelector('main').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })()`)
const at = { x: main.x + 260, y: main.y + 150 }
const away = { x: main.x + main.w - 70, y: main.y + main.h - 70 }

// --- 1. create + focus ------------------------------------------------------
await click(tool.x, tool.y)
await sleep(300)
check('Text tool activates', (await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label')||'').startsWith('Text —'))
  return b.getAttribute('aria-pressed')
})()`)) === 'true')

await click(at.x, at.y)
await sleep(500)
const created = await overlay()
check('text tool opens the editor', created.present === true, created.present ? '' : 'no textarea in the DOM')
check('editor holds focus', created.focused === true, `activeElement=${created.activeTag}`)
await sleep(700)
check('editor survives the pointer sequence', (await overlay()).present === true, 'still open 1.2s later')
await shot('fix-01-editor-open.png')

// --- 2. type ----------------------------------------------------------------
await typeText('Hello world')
await sleep(400)
const typed = await overlay()
check('typing lands in the editor', typed.present && typed.value === 'Hello world', `value=${JSON.stringify(typed.value ?? null)}`)
console.log(`      editor font: ${typed.fontFamily} / ${typed.fontSize} / lh ${typed.lineHeight} / ${typed.textAlign}`)
await shot('fix-02-typed.png')

// --- 3. commit --------------------------------------------------------------
const beforeHash = await canvasHash()
const beforeDoc = await saveAndLoad()
await click(away.x, away.y)
await sleep(900)
check('editor closes on commit', (await overlay()).present === false)
const afterHash = await canvasHash()
check('canvas repaints with the text', afterHash !== beforeHash, `hash ${beforeHash} -> ${afterHash}`)

const saved = await saveAndLoad()
console.log('      saved document:', JSON.stringify(saved))
check('saved document contains the typed text', Array.isArray(saved.texts) && saved.texts.includes('Hello world'))
check('object count grows by one', saved.total === beforeDoc.total + 1, `${beforeDoc.total} -> ${saved.total}`)
await shot('fix-03-committed.png')
await layerPng('fix-04-layer.png')

// --- 4. re-edit -------------------------------------------------------------
await doubleClick(at.x + 30, at.y + 12)
await sleep(700)
const reopened = await overlay()
check('double-click reopens the editor', reopened.present === true)
check('reopened editor shows the saved text', reopened.present && reopened.value === 'Hello world', `value=${JSON.stringify(reopened.value ?? null)}`)
await shot('fix-05-reopened.png')

// --- 5. abandoning an empty box leaves nothing behind -----------------------
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await sleep(600)
const countBeforeAbandon = (await saveAndLoad()).total
await click(tool.x, tool.y)
await sleep(250)
await click(at.x + 40, at.y + 90)
await sleep(600)
await click(away.x, away.y)
await sleep(800)
const countAfterAbandon = (await saveAndLoad()).total
check('abandoned empty text box is not left behind', countAfterAbandon === countBeforeAbandon,
  `${countBeforeAbandon} -> ${countAfterAbandon}`)

// --- 6. panel font matches what is rendered ---------------------------------
const fontState = await ev(`(() => {
  const s = document.querySelector('select')
  const t = document.querySelector('textarea')
  return { selectValue: s ? s.value : null, textareaFont: t ? getComputedStyle(t).fontFamily : null }
})()`)
console.log('      font select:', JSON.stringify(fontState))

console.log('\nexceptions:', exceptions.slice(0, 6))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)

await ev(`window.whiteboard.app.command('quit')`).catch(() => {})
await sleep(2000)
try { ws.close() } catch {}
if (!child.killed) child.kill()
await sleep(300)
process.exit(failed.length ? 1 : 0)
