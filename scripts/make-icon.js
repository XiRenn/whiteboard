#!/usr/bin/env node
/**
 * Generates build/icon.png (256x256, 32-bit RGBA) with no image library.
 *
 * electron-builder converts this PNG into a multi-resolution .ico. Windows
 * requires a 256x256 frame and an alpha channel, so we render exactly that.
 *
 * Rendering is done with 4x4 supersampling per pixel so the rounded corners and
 * the freehand stroke come out anti-aliased instead of jagged.
 *
 *   node scripts/make-icon.js
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const SIZE = 256
const SS = 4 // supersample factor per axis
const OUT = path.join(__dirname, '..', 'build', 'icon.png')

// ---------------------------------------------------------------- geometry ---

/** Signed coverage helper: is point inside a rounded rectangle? */
function insideRoundRect(px, py, x, y, w, h, r) {
  if (px < x || py < y || px > x + w || py > y + h) return false
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/** Sample a Catmull-Rom spline through the control points into a dense polyline. */
function spline(points, steps = 24) {
  const pts = [points[0], ...points, points[points.length - 1]]
  const out = []
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2]
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ])
    }
  }
  return out
}

/** Shortest distance from a point to a polyline. */
function distToPolyline(px, py, poly) {
  let best = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[i + 1]
    const vx = x2 - x1
    const vy = y2 - y1
    const len2 = vx * vx + vy * vy
    let t = len2 === 0 ? 0 : ((px - x1) * vx + (py - y1) * vy) / len2
    t = Math.min(1, Math.max(0, t))
    const dx = px - (x1 + t * vx)
    const dy = py - (y1 + t * vy)
    const d = dx * dx + dy * dy
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

// The marker stroke: a freehand squiggle across the sheet.
const STROKE = spline([
  [62, 176],
  [96, 118],
  [128, 168],
  [166, 92],
  [196, 132]
])

// --------------------------------------------------------------- rasteriser ---

const lerp = (a, b, t) => a + (b - a) * t

/** Returns [r,g,b,a] with a in 0..1, or null for a fully transparent sample. */
function shade(x, y) {
  // Rounded-square background with a diagonal gradient (#4f46e5 -> #7c3aed).
  if (insideRoundRect(x, y, 8, 8, SIZE - 16, SIZE - 16, 56)) {
    const t = (x + y) / (SIZE * 2)
    return [lerp(79, 124, t), lerp(70, 58, t), lerp(229, 237, t), 1]
  }
  // Amber accent dot in the lower right.
  const ddx = x - 186
  const ddy = y - 182
  if (ddx * ddx + ddy * ddy <= 24 * 24) return [251, 191, 36, 1]
  // White marker stroke.
  if (distToPolyline(x, y, STROKE) <= 11) return [255, 255, 255, 1]
  return null
}

function render() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4)
  const inv = 1 / (SS * SS)
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const s = shade(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)
          if (s) {
            // Premultiply so that partially covered edges blend correctly.
            r += s[0] * s[3]
            g += s[1] * s[3]
            b += s[2] * s[3]
            a += s[3]
          }
        }
      }
      const i = (py * SIZE + px) * 4
      if (a > 0) {
        rgba[i] = Math.round(r / a)
        rgba[i + 1] = Math.round(g / a)
        rgba[i + 2] = Math.round(b / a)
        rgba[i + 3] = Math.round((a * inv) * 255)
      }
    }
  }
  return rgba
}

// -------------------------------------------------------------- PNG encoder ---

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(rgba, width, height) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type 6 = truecolour with alpha
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // One filter byte (0 = None) per scanline.
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// --------------------------------------------------------------------- main ---

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, encodePng(render(), SIZE, SIZE))
console.log(`wrote ${OUT} (${SIZE}x${SIZE} RGBA, ${fs.statSync(OUT).size} bytes)`)
