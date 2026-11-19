/**
 * Core logic test suite.
 *
 * These modules are pure on purpose — no React, no Konva, no DOM except canvas
 * text measurement — so they can be exercised in plain Node. That matters
 * because they hold the invariants everything else depends on: the viewport
 * maths, the model↔node transform bridge, and the SVG serialiser.
 *
 *   npm test
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { patchFromStyle } from '@/lib/apply-style'
import { cloneShapes, createEllipseShape, createLineShape, createNoteShape, createPenShape, createRectShape, createTextShape } from '@/lib/shape-factory'
import { applyNodeTransform } from '@/lib/node-transform'
import {
  boundsIntersect,
  fitViewport,
  getLocalSize,
  getShapeBounds,
  getShapesBounds,
  normalizePoints,
  screenToWorld,
  unionBounds,
  zoomAt
} from '@/lib/shape-geometry'
import { serializeToSvg } from '@/lib/svg-serializer'
import { wrapText } from '@/lib/text'
import { DEFAULT_FONT_FAMILY, TRANSPARENT } from '@/lib/constants'
import type { Shape } from '@/types/board'

let passed = 0
const failures: string[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
  } catch (error) {
    failures.push(`${name}\n    ${error instanceof Error ? error.message : String(error)}`)
  }
}

const STYLE = {
  stroke: '#111827',
  fill: TRANSPARENT,
  strokeWidth: 3,
  opacity: 1,
  fontSize: 22,
  fontFamily: DEFAULT_FONT_FAMILY
}

// ------------------------------------------------------------------ geometry ---

test('normalizePoints re-bases a stroke so its top-left is the origin', () => {
  const result = normalizePoints([110, 210, 160, 240, 130, 260])
  assert.equal(result.x, 110)
  assert.equal(result.y, 210)
  assert.deepEqual(result.points, [0, 0, 50, 30, 20, 50])
  assert.equal(result.width, 50)
  assert.equal(result.height, 50)
})

test('getLocalSize measures a rect from its own origin', () => {
  const rect = createRectShape(40, 60, 120, 80, STYLE)
  assert.deepEqual(getLocalSize(rect), { width: 120, height: 80 })
})

test('getLocalSize derives text height from the wrapped line count', () => {
  const text = createTextShape(0, 0, STYLE, 'short')
  const oneLine = getLocalSize(text)
  const longer = { ...text, text: 'a much longer string that will certainly wrap across lines' }
  assert.ok(getLocalSize(longer).height > oneLine.height)
  assert.equal(oneLine.width, text.width)
})

test('getShapeBounds grows once a shape is rotated', () => {
  const rect = createRectShape(0, 0, 100, 100, STYLE)
  const flat = getShapeBounds(rect)
  assert.deepEqual(flat, { x: 0, y: 0, width: 100, height: 100 })

  const rotated = getShapeBounds({ ...rect, rotation: 45 })
  // A 100×100 square rotated 45° has a bounding box of ~141×141.
  assert.ok(Math.abs(rotated.width - 141.42) < 0.5, `got ${rotated.width}`)
  assert.ok(rotated.x < 0 && rotated.y < 0)
})

test('boundsIntersect is exclusive on touching edges', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 }
  assert.equal(boundsIntersect(a, { x: 5, y: 5, width: 10, height: 10 }), true)
  assert.equal(boundsIntersect(a, { x: 10, y: 0, width: 10, height: 10 }), false)
})

test('unionBounds spans every input and ignores an empty list', () => {
  assert.equal(unionBounds([]), null)
  // A spans x 0..10, y 0..10. B spans x 20..30, y -5..5.
  // Union is therefore x 0..30 (30 wide) and y -5..10 (15 tall).
  assert.deepEqual(
    unionBounds([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: -5, width: 10, height: 10 }
    ]),
    { x: 0, y: -5, width: 30, height: 15 }
  )
})

test('getShapesBounds returns null for an empty board', () => {
  assert.equal(getShapesBounds([]), null)
})

// ------------------------------------------------------------------ viewport ---

test('zoomAt keeps the world point under the cursor stationary', () => {
  const viewport = { x: 120, y: -40, scale: 1 }
  const pointer = { x: 300, y: 200 }
  const before = screenToWorld(pointer, viewport)

  for (const factor of [1.15, 1.15, 0.5, 3]) {
    const next = zoomAt(viewport, pointer, factor, { min: 0.05, max: 16 })
    const after = screenToWorld(pointer, next)
    // This is the invariant that makes zoom feel anchored rather than drifting.
    assert.ok(Math.abs(after.x - before.x) < 1e-9, `x drifted: ${after.x} vs ${before.x}`)
    assert.ok(Math.abs(after.y - before.y) < 1e-9, `y drifted: ${after.y} vs ${before.y}`)
  }
})

test('zoomAt clamps to the scale limits', () => {
  const viewport = { x: 0, y: 0, scale: 15 }
  const zoomed = zoomAt(viewport, { x: 0, y: 0 }, 4, { min: 0.05, max: 16 })
  assert.equal(zoomed.scale, 16)

  const shrunk = zoomAt({ x: 0, y: 0, scale: 0.06 }, { x: 0, y: 0 }, 0.1, { min: 0.05, max: 16 })
  assert.equal(shrunk.scale, 0.05)
})

test('fitViewport centres content and keeps it inside the padding', () => {
  const bounds = { x: 100, y: 100, width: 400, height: 200 }
  const size = { width: 800, height: 600 }
  const fitted = fitViewport(bounds, size, 40, { min: 0.05, max: 16 })

  // Content centre lands on the viewport centre.
  const centreX = (bounds.x + bounds.width / 2) * fitted.scale + fitted.x
  const centreY = (bounds.y + bounds.height / 2) * fitted.scale + fitted.y
  assert.ok(Math.abs(centreX - size.width / 2) < 1e-6)
  assert.ok(Math.abs(centreY - size.height / 2) < 1e-6)

  // And it fits within the available area.
  assert.ok(bounds.width * fitted.scale <= size.width - 80 + 1e-6)
  assert.ok(bounds.height * fitted.scale <= size.height - 80 + 1e-6)
})

test('fitViewport falls back to identity for an empty board', () => {
  assert.deepEqual(fitViewport(null, { width: 400, height: 300 }, 40, { min: 0.05, max: 16 }), {
    x: 200,
    y: 150,
    scale: 1
  })
})

// -------------------------------------------------------------------- history ---

test('cloneShapes deep-copies the points array', () => {
  const stroke = createPenShape([0, 0, 10, 10, 20, 5], STYLE)
  const [copy] = cloneShapes([stroke])
  assert.notEqual(copy, stroke)
  assert.notEqual(copy.points, stroke.points)

  // Mutating the copy must not corrupt the snapshot the undo stack holds.
  copy.points.push(999, 999)
  assert.equal(stroke.points.length, 6)
})

// ---------------------------------------------------------------- node bridge ---

/** Minimal stand-in for a Konva node — only the accessors the bridge reads. */
function fakeNode(values: {
  x: number
  y: number
  rotation?: number
  scaleX?: number
  scaleY?: number
}) {
  return {
    x: () => values.x,
    y: () => values.y,
    rotation: () => values.rotation ?? 0,
    scaleX: () => values.scaleX ?? 1,
    scaleY: () => values.scaleY ?? 1
  } as unknown as import('konva').default.Node
}

test('applyNodeTransform bakes scale into a rect and re-centres it', () => {
  const rect = createRectShape(100, 100, 200, 100, STYLE)
  // Doubling the width around a centre at (200, 150).
  const node = fakeNode({ x: 200, y: 150, scaleX: 2, scaleY: 1 })
  const next = applyNodeTransform(rect, node)

  assert.equal(next.type, 'rect')
  if (next.type !== 'rect') return
  assert.equal(next.width, 400)
  assert.equal(next.height, 100)
  assert.equal(next.x, 0)
  assert.equal(next.y, 100)
})

test('applyNodeTransform scales a stroke point list instead of a scale factor', () => {
  const pen = createPenShape([0, 0, 100, 50], STYLE)
  const node = fakeNode({ x: 100, y: 50, scaleX: 2, scaleY: 2 })
  const next = applyNodeTransform(pen, node)

  assert.equal(next.type, 'pen')
  if (next.type !== 'pen') return
  assert.deepEqual(next.points, [0, 0, 200, 100])
  assert.equal(next.x, 0)
  assert.equal(next.y, 0)
})

test('applyNodeTransform recomputes text height after a width change', () => {
  const text = createTextShape(0, 0, STYLE, 'wrap me across several lines please')
  const node = fakeNode({ x: 100, y: 40, scaleX: 0.5, scaleY: 1 })
  const next = applyNodeTransform(text, node)

  assert.equal(next.type, 'text')
  if (next.type !== 'text') return
  assert.ok(next.width < text.width)
  // A narrower box must not produce a shorter block of text.
  assert.ok(getLocalSize(next).height >= getLocalSize(text).height)
})

test('applyNodeTransform normalises rotation into 0..360', () => {
  const rect = createRectShape(0, 0, 10, 10, STYLE)
  assert.equal(applyNodeTransform(rect, fakeNode({ x: 5, y: 5, rotation: -90 })).rotation, 270)
  assert.equal(applyNodeTransform(rect, fakeNode({ x: 5, y: 5, rotation: 450 })).rotation, 90)
})

// ---------------------------------------------------------------- style mapping ---

test('patchFromStyle sends stroke to fill on text and to textFill on a note', () => {
  const text = createTextShape(0, 0, STYLE, 'hi')
  const note = createNoteShape(0, 0, STYLE, '#fef08a', 'hi')
  const rect = createRectShape(0, 0, 10, 10, STYLE)

  // A text shape has no stroke — the panel's "stroke" is its glyph colour, so
  // the patch must carry `fill` and must NOT carry a stroke key at all.
  assert.deepEqual(patchFromStyle(text, { stroke: '#ff0000' }), { fill: '#ff0000' })
  assert.equal((patchFromStyle(note, { stroke: '#ff0000' }) as { textFill?: string }).textFill, '#ff0000')
  assert.equal((patchFromStyle(rect, { stroke: '#ff0000' }) as { stroke?: string }).stroke, '#ff0000')
})

test('patchFromStyle ignores fill on a line and font size on a rect', () => {
  const line = createLineShape(0, 0, 10, 10, STYLE, false)
  const rect = createRectShape(0, 0, 10, 10, STYLE)

  assert.equal((patchFromStyle(line, { fill: '#00ff00' }) as { fill?: string }).fill, undefined)
  assert.equal((patchFromStyle(rect, { fontSize: 40 }) as { fontSize?: number }).fontSize, undefined)
})

test('patchFromStyle resizes an arrow head with the stroke width', () => {
  const arrow = createLineShape(0, 0, 100, 0, STYLE, true)
  const patch = patchFromStyle(arrow, { strokeWidth: 10 }) as {
    strokeWidth?: number
    pointerLength?: number
  }
  assert.equal(patch.strokeWidth, 10)
  assert.ok((patch.pointerLength ?? 0) >= 32, `head too small: ${patch.pointerLength}`)
})

// -------------------------------------------------------------------- wrapping ---

test('wrapText honours explicit newlines and never returns zero lines', () => {
  assert.deepEqual(wrapText('', DEFAULT_FONT_FAMILY, 16, 200), [''])
  assert.deepEqual(wrapText('a\nb', DEFAULT_FONT_FAMILY, 16, 200), ['a', 'b'])
  assert.deepEqual(wrapText('a\n\nb', DEFAULT_FONT_FAMILY, 16, 200), ['a', '', 'b'])
})

test('wrapText hard-breaks a single word wider than the box', () => {
  const lines = wrapText('supercalifragilisticexpialidocious', DEFAULT_FONT_FAMILY, 16, 60)
  assert.ok(lines.length > 1, `expected a break, got ${JSON.stringify(lines)}`)
})

// ------------------------------------------------------------------------ SVG ---

function sampleBoard(): Shape[] {
  return [
    createRectShape(0, 0, 100, 50, { ...STYLE, fill: '#bfdbfe' }),
    createEllipseShape(200, 0, 80, 80, STYLE),
    createPenShape([0, 200, 50, 220, 100, 200], STYLE),
    createLineShape(0, 300, 100, 320, STYLE, true),
    createTextShape(200, 200, STYLE, 'Hello <world> & "friends"'),
    createNoteShape(300, 300, STYLE, '#fef08a', 'note text')
  ]
}

test('serializeToSvg emits one element per shape type', () => {
  const { svg } = serializeToSvg(sampleBoard(), { padding: 20, background: '#ffffff' })

  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'))
  assert.ok(svg.includes('<rect '), 'missing rect')
  assert.ok(svg.includes('<ellipse '), 'missing ellipse')
  assert.ok(svg.includes('<path '), 'missing path for the pen stroke')
  assert.ok(svg.includes('<line '), 'missing line')
  assert.ok(svg.includes('<polygon '), 'missing arrow head')
  assert.ok(svg.includes('<text '), 'missing text')
  assert.ok(svg.includes('<image ') === false, 'no image shape was supplied')
})

test('serializeToSvg escapes XML metacharacters', () => {
  const { svg } = serializeToSvg([createTextShape(0, 0, STYLE, 'a < b & c > d')], { padding: 0 })
  assert.ok(svg.includes('&lt;'), 'less-than not escaped')
  assert.ok(svg.includes('&amp;'), 'ampersand not escaped')
  assert.ok(svg.includes('&gt;'), 'greater-than not escaped')
  // The raw sequence must not survive into the document.
  assert.ok(!svg.includes('< b & c >'), 'raw metacharacters leaked into the SVG')
})

test('serializeToSvg sizes the viewBox to the content plus padding', () => {
  const rect = createRectShape(100, 100, 200, 100, STYLE)
  const { svg, width, height } = serializeToSvg([rect], { padding: 10 })
  assert.equal(width, 220)
  assert.equal(height, 120)
  assert.ok(svg.includes('viewBox="90 90 220 120"'), `unexpected viewBox in ${svg.slice(0, 400)}`)
})

test('serializeToSvg omits the background when asked for transparency', () => {
  const withBackground = serializeToSvg([createRectShape(0, 0, 10, 10, STYLE)], {
    padding: 0,
    background: '#ffffff'
  }).svg
  const withoutBackground = serializeToSvg([createRectShape(0, 0, 10, 10, STYLE)], {
    padding: 0,
    background: null
  }).svg

  assert.ok(withBackground.includes('fill="#ffffff"'))
  assert.ok(!withoutBackground.includes('fill="#ffffff"'))
})

test('serializeToSvg writes a transparent fill as none', () => {
  const { svg } = serializeToSvg([createRectShape(0, 0, 10, 10, STYLE)], { padding: 0 })
  assert.ok(svg.includes('fill="none"'), `expected fill="none" in ${svg}`)
})

test('serializeToSvg handles an empty board without throwing', () => {
  const { svg, width, height } = serializeToSvg([], { padding: 16 })
  assert.equal(width, 32)
  assert.equal(height, 32)
  assert.ok(svg.includes('</svg>'))
})

test('serializeToSvg applies rotation about the shape centre', () => {
  const rect = { ...createRectShape(100, 100, 100, 100, STYLE), rotation: 90 }
  const { svg } = serializeToSvg([rect], { padding: 0 })
  // Centre is (150, 150).
  assert.ok(svg.includes('rotate(90 150 150)'), `unexpected transform in ${svg}`)
  assert.ok(svg.includes('translate(100 100)'), 'missing translation')
})

// ------------------------------------------------------------ Konva JSX hygiene ---

/**
 * A run of spaces between two JSX elements *on the same line* is preserved by
 * JSX as a real text child. In an HTML tree that is harmless. Inside a Konva
 * tree it is fatal: react-konva cannot append a text instance to a Konva
 * container, so it passes `undefined` to `Container.add()`, which immediately
 * dereferences `child.getParent()` and throws. The scene graph then never
 * builds, every layer canvas goes missing, and the workspace renders blank —
 * with nothing the user can see pointing at the cause.
 *
 * One stray run of spaces is all it takes, and neither the compiler nor the
 * type checker flags it, so it is worth an explicit guard.
 */
const KONVA_COMPONENTS = [
  'src/renderer/src/components/canvas/CanvasStage.tsx',
  'src/renderer/src/components/canvas/Grid.tsx',
  'src/renderer/src/components/canvas/ShapeNode.tsx'
]

// `>` followed by only spaces/tabs and then `<`. The lookbehind skips arrow
// functions (`=> <Stage />`), which are legitimate and common.
const STRAY_JSX_WHITESPACE = /(?<!=)>[ \t]+</

test('Konva JSX trees contain no whitespace-only text nodes', () => {
  for (const file of KONVA_COMPONENTS) {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    source.split('\n').forEach((line, index) => {
      assert.ok(
        !STRAY_JSX_WHITESPACE.test(line),
        `${file}:${index + 1} has whitespace between JSX elements on one line — ` +
          `JSX turns that into a text child, which breaks the Konva tree. ` +
          `Put the opening tag on its own line.`
      )
    })
  }
})

// --------------------------------------------------------------------- report ---

console.log(`\n${passed} passed, ${failures.length} failed\n`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`  ✗ ${failure}\n`)
  process.exit(1)
}
