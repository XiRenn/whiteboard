import { DEFAULT_LINE_HEIGHT, TRANSPARENT } from './constants'
import { getLocalSize, getShapesBounds } from './shape-geometry'
import { baselineOffset, wrapText } from './text'
import type { Shape } from '@/types/board'

/**
 * Model-driven SVG export.
 *
 * This deliberately does **not** try to walk the Konva scene graph. Konva has no
 * SVG output, and reverse-engineering its node tree would produce an SVG that
 * reflects whatever the canvas happened to be doing — grid, selection handles,
 * a transient drag preview. Serialising the document model instead gives real
 * vector output, no rasterisation, and a result that is identical no matter what
 * state the canvas is in.
 *
 * Coordinate strategy: every shape body is emitted in *local* coordinates
 * starting at (0, 0), and the wrapper applies
 * `rotate(angle cx cy) translate(x y)`. SVG composes transforms right to left,
 * so the local geometry is placed in the world first and then rotated about the
 * shape's own centre — the same convention the canvas uses.
 */

export interface SvgExportOptions {
  /** Padding in world units around the content. */
  padding?: number
  /** Background colour, or `null` for a transparent background. */
  background?: string | null
}

export interface SvgExportResult {
  svg: string
  width: number
  height: number
}

/** Compact number formatting — SVG files get large fast with 15-digit floats. */
function num(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case '"':
        return '&quot;'
      default:
        return '&apos;'
    }
  })
}

const paint = (color: string): string => (color === TRANSPARENT ? 'none' : color)

/** Catmull-Rom to cubic Bézier, using the same formula as Konva's `tension`. */
function smoothPath(points: number[], tension: number): string {
  const count = points.length / 2
  if (count === 0) return ''
  if (count === 1) {
    return `M ${num(points[0])} ${num(points[1])} l 0.01 0`
  }

  let d = `M ${num(points[0])} ${num(points[1])}`

  if (!tension || count === 2) {
    for (let i = 1; i < count; i++) {
      d += ` L ${num(points[i * 2])} ${num(points[i * 2 + 1])}`
    }
    return d
  }

  for (let i = 0; i < count - 1; i++) {
    const prev = Math.max(i - 1, 0)
    const next = Math.min(i + 2, count - 1)

    const p0x = points[prev * 2]
    const p0y = points[prev * 2 + 1]
    const p1x = points[i * 2]
    const p1y = points[i * 2 + 1]
    const p2x = points[(i + 1) * 2]
    const p2y = points[(i + 1) * 2 + 1]
    const p3x = points[next * 2]
    const p3y = points[next * 2 + 1]

    const cp1x = p1x + ((p2x - p0x) / 6) * tension
    const cp1y = p1y + ((p2y - p0y) / 6) * tension
    const cp2x = p2x - ((p3x - p1x) / 6) * tension
    const cp2y = p2y - ((p3y - p1y) / 6) * tension

    d += ` C ${num(cp1x)} ${num(cp1y)} ${num(cp2x)} ${num(cp2y)} ${num(p2x)} ${num(p2y)}`
  }

  return d
}

/** Text as a sequence of `<tspan>` lines, positioned like Konva positions them. */
function textElement(
  text: string,
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  fill: string,
  width: number,
  align: string,
  offsetX: number,
  offsetY: number
): string {
  const lines = wrapText(text, fontFamily, fontSize, width)
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
  const x = offsetX + (align === 'center' ? width / 2 : align === 'right' ? width : 0)

  const spans = lines
    .map((line, index) => {
      const y = offsetY + baselineOffset(fontFamily, fontSize, lineHeight, index)
      const content = line === '' ? ' ' : escapeXml(line)
      return `<tspan x="${num(x)}" y="${num(y)}">${content}</tspan>`
    })
    .join('')

  return (
    `<text font-family="${escapeXml(fontFamily)}" font-size="${num(fontSize)}" ` +
    `fill="${escapeXml(paint(fill))}" text-anchor="${anchor}" ` +
    `xml:space="preserve">${spans}</text>`
  )
}

function shapeBody(shape: Shape): string {
  switch (shape.type) {
    case 'pen':
      return (
        `<path d="${smoothPath(shape.points, shape.tension)}" fill="none" ` +
        `stroke="${escapeXml(paint(shape.stroke))}" stroke-width="${num(shape.strokeWidth)}" ` +
        `stroke-linecap="${shape.lineCap}" stroke-linejoin="${shape.lineJoin}"/>`
      )

    case 'rect':
      return (
        `<rect x="0" y="0" width="${num(shape.width)}" height="${num(shape.height)}" ` +
        `rx="${num(shape.cornerRadius)}" ry="${num(shape.cornerRadius)}" ` +
        `fill="${escapeXml(paint(shape.fill))}" stroke="${escapeXml(paint(shape.stroke))}" ` +
        `stroke-width="${num(shape.strokeWidth)}"/>`
      )

    case 'ellipse':
      return (
        `<ellipse cx="${num(shape.width / 2)}" cy="${num(shape.height / 2)}" ` +
        `rx="${num(shape.width / 2)}" ry="${num(shape.height / 2)}" ` +
        `fill="${escapeXml(paint(shape.fill))}" stroke="${escapeXml(paint(shape.stroke))}" ` +
        `stroke-width="${num(shape.strokeWidth)}"/>`
      )

    case 'line':
      return (
        `<line x1="${num(shape.points[0] ?? 0)}" y1="${num(shape.points[1] ?? 0)}" ` +
        `x2="${num(shape.points[2] ?? 0)}" y2="${num(shape.points[3] ?? 0)}" ` +
        `stroke="${escapeXml(paint(shape.stroke))}" stroke-width="${num(shape.strokeWidth)}" ` +
        `stroke-linecap="round"/>`
      )

    case 'arrow': {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = shape.points
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const length = shape.pointerLength
      const halfWidth = shape.pointerWidth / 2
      const baseX = x2 - Math.cos(angle) * length
      const baseY = y2 - Math.sin(angle) * length
      const normalX = -Math.sin(angle)
      const normalY = Math.cos(angle)

      const head = [
        `${num(x2)},${num(y2)}`,
        `${num(baseX + normalX * halfWidth)},${num(baseY + normalY * halfWidth)}`,
        `${num(baseX - normalX * halfWidth)},${num(baseY - normalY * halfWidth)}`
      ].join(' ')

      return (
        `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(baseX)}" y2="${num(baseY)}" ` +
        `stroke="${escapeXml(paint(shape.stroke))}" stroke-width="${num(shape.strokeWidth)}" ` +
        `stroke-linecap="round"/>` +
        `<polygon points="${head}" fill="${escapeXml(paint(shape.stroke))}"/>`
      )
    }

    case 'text':
      return textElement(
        shape.text,
        shape.fontFamily,
        shape.fontSize,
        shape.lineHeight ?? DEFAULT_LINE_HEIGHT,
        shape.fill,
        shape.width,
        shape.align,
        0,
        0
      )

    case 'note': {
      const padding = 14
      const innerWidth = Math.max(shape.width - padding * 2, 16)
      return (
        `<rect x="0" y="0" width="${num(shape.width)}" height="${num(shape.height)}" ` +
        `rx="${num(shape.cornerRadius)}" ry="${num(shape.cornerRadius)}" ` +
        `fill="${escapeXml(paint(shape.fill))}"/>` +
        textElement(
          shape.text,
          shape.fontFamily,
          shape.fontSize,
          shape.lineHeight ?? DEFAULT_LINE_HEIGHT,
          shape.textFill,
          innerWidth,
          shape.align,
          padding,
          padding
        )
      )
    }

    case 'image':
      return (
        `<image href="${escapeXml(shape.src)}" x="0" y="0" ` +
        `width="${num(shape.width)}" height="${num(shape.height)}" preserveAspectRatio="none"/>`
      )

    default:
      return ''
  }
}

function shapeToSvg(shape: Shape): string {
  const { width, height } = getLocalSize(shape)
  const centreX = shape.x + width / 2
  const centreY = shape.y + height / 2

  const transforms = [`translate(${num(shape.x)} ${num(shape.y)})`]
  if (shape.rotation) transforms.unshift(`rotate(${num(shape.rotation)} ${num(centreX)} ${num(centreY)})`)

  const opacity = shape.opacity < 1 ? ` opacity="${num(shape.opacity)}"` : ''
  const body = shapeBody(shape)
  if (!body) return ''

  return `<g transform="${transforms.join(' ')}"${opacity}>${body}</g>`
}

export function serializeToSvg(shapes: Shape[], options: SvgExportOptions = {}): SvgExportResult {
  const padding = options.padding ?? 32
  const content = getShapesBounds(shapes)

  const box = content
    ? {
        x: content.x - padding,
        y: content.y - padding,
        width: Math.max(content.width + padding * 2, 1),
        height: Math.max(content.height + padding * 2, 1)
      }
    : { x: -padding, y: -padding, width: padding * 2, height: padding * 2 }

  const background = options.background
    ? `<rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.width)}" height="${num(
        box.height
      )}" fill="${escapeXml(options.background)}"/>`
    : ''

  const body = shapes.map(shapeToSvg).filter(Boolean).join('\n  ')

  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${num(box.width)}" height="${num(box.height)}" ` +
      `viewBox="${num(box.x)} ${num(box.y)} ${num(box.width)} ${num(box.height)}">`,
    `  <title>Whiteboard export</title>`,
    background ? `  ${background}` : '',
    `  ${body}`,
    '</svg>'
  ]
    .filter((line) => line !== '')
    .join('\n')

  return { svg, width: box.width, height: box.height }
}
