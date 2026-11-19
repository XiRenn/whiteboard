/**
 * Text measurement and wrapping.
 *
 * Konva wraps text internally, but the SVG exporter and the model both need to
 * know the resulting line breaks *without* a Konva node. Rather than guess with
 * a magic character-width constant, we measure with a real 2D canvas context —
 * the same mechanism Konva uses — so the model, the canvas and the exported SVG
 * agree on where the lines break.
 */

import { DEFAULT_LINE_HEIGHT } from './constants'

let measureCanvas: HTMLCanvasElement | null = null

function context(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  return measureCanvas.getContext('2d')
}

export function measureTextWidth(text: string, fontFamily: string, fontSize: number): number {
  const ctx = context()
  if (!ctx) return text.length * fontSize * 0.55
  ctx.font = `${fontSize}px ${fontFamily}`
  return ctx.measureText(text).width
}

/**
 * Break `text` into rendered lines.
 *
 * Explicit `\n` always breaks. Words wrap at `maxWidth`; a single word longer
 * than the box is hard-broken by character, matching what Konva does rather than
 * overflowing the box.
 */
export function wrapText(
  text: string,
  fontFamily: string,
  fontSize: number,
  maxWidth: number
): string[] {
  const lines: string[] = []
  const limit = Math.max(maxWidth, fontSize)

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('')
      continue
    }

    let current = ''
    // Split on spaces but keep the separator so spacing is preserved.
    for (const token of paragraph.split(/(\s+)/)) {
      if (token === '') continue
      const candidate = current + token

      if (current !== '' && measureTextWidth(candidate, fontFamily, fontSize) > limit) {
        lines.push(current.replace(/\s+$/, ''))
        current = token.replace(/^\s+/, '')
      } else {
        current = candidate
      }

      // Hard-break a token that cannot fit on a line by itself.
      while (measureTextWidth(current, fontFamily, fontSize) > limit && current.length > 1) {
        let cut = current.length - 1
        while (cut > 1 && measureTextWidth(current.slice(0, cut), fontFamily, fontSize) > limit) cut--
        lines.push(current.slice(0, cut))
        current = current.slice(cut)
      }
    }

    lines.push(current.replace(/\s+$/, ''))
  }

  return lines.length > 0 ? lines : ['']
}

export function textBlockHeight(
  text: string,
  fontFamily: string,
  fontSize: number,
  maxWidth: number,
  lineHeight: number = DEFAULT_LINE_HEIGHT
): number {
  const lineCount = Math.max(1, wrapText(text, fontFamily, fontSize, maxWidth).length)
  return lineCount * fontSize * lineHeight
}

/** Widest rendered line — used to size text shapes to their content. */
export function textBlockWidth(
  text: string,
  fontFamily: string,
  fontSize: number,
  maxWidth: number
): number {
  const lines = wrapText(text, fontFamily, fontSize, maxWidth)
  return lines.reduce((widest, line) => Math.max(widest, measureTextWidth(line, fontFamily, fontSize)), 0)
}

/**
 * Font ascent/descent, used to place a baseline the way Konva does.
 *
 * Konva draws text with `textBaseline = 'alphabetic'` and offsets each line by
 * `(ascent - descent) / 2 + lineHeight / 2`. The SVG exporter reproduces that
 * exact formula so exported text lands on the same pixels as the canvas.
 */
export function fontVerticalMetrics(
  fontFamily: string,
  fontSize: number
): { ascent: number; descent: number } {
  const ctx = context()
  if (!ctx) return { ascent: fontSize * 0.8, descent: fontSize * 0.2 }

  ctx.font = `${fontSize}px ${fontFamily}`
  const metrics = ctx.measureText('M') as TextMetrics & {
    fontBoundingBoxAscent?: number
    fontBoundingBoxDescent?: number
    actualBoundingBoxAscent?: number
    actualBoundingBoxDescent?: number
  }

  return {
    ascent: metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? fontSize * 0.8,
    descent: metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? fontSize * 0.2
  }
}

/** Vertical offset of the baseline of line `index`, matching Konva. */
export function baselineOffset(
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  index: number
): number {
  const { ascent, descent } = fontVerticalMetrics(fontFamily, fontSize)
  const lineHeightPx = lineHeight * fontSize
  return (ascent - descent) / 2 + lineHeightPx * (index + 0.5)
}
