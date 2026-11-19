import type { ExportResult } from '@shared/ipc-contract'
import { CANVAS_BACKGROUND, MAX_SCALE, MIN_SCALE } from '@/lib/constants'
import { fitViewport, getShapesBounds } from '@/lib/shape-geometry'
import { serializeToSvg } from '@/lib/svg-serializer'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import { canvasRegistry, nextPaint } from './canvasRegistry'
import { ioService } from './boardService'

/**
 * PNG / SVG / PDF export.
 *
 * **PNG and PDF** drive the live Konva stage. Konva's `toDataURL` does not
 * screenshot the visible canvas — it re-executes every drawing command into a
 * fresh canvas at the requested `pixelRatio`, cropped to a rectangle you choose.
 * That means the export is a genuine high-resolution re-render, not an upscaled
 * copy of whatever was on screen.
 *
 * To capture the whole board regardless of the user's current zoom, the world
 * group's transform is temporarily set to a fitted viewport, the grid and
 * selection chrome are hidden, and everything is restored in a `finally`. The
 * store is never touched, so exporting has no side effects on the document.
 *
 * **SVG** never touches Konva at all — it is serialised straight from the model,
 * which is why it stays true vector output.
 */

export type ExportFormat = 'png' | 'svg' | 'pdf'

export interface ExportOptions {
  includeBackground: boolean
  /** Padding around the content, in screen pixels, before the capture. */
  padding: number
  /** Device-pixel multiplier for the PNG raster. */
  pngPixelRatio?: number
  /** Device-pixel multiplier for the PDF raster. */
  pdfPixelRatio?: number
}

const DEFAULT_OPTIONS: ExportOptions = {
  includeBackground: true,
  padding: 40,
  pngPixelRatio: 2,
  pdfPixelRatio: 3
}

const ZOOM_LIMITS = { min: MIN_SCALE, max: MAX_SCALE }
/** 1 CSS pixel = 0.75 pt, so an exported board keeps its on-screen physical size. */
const PX_TO_PT = 0.75
/** Browsers refuse to allocate canvases beyond roughly this edge length. */
const MAX_RASTER_EDGE = 8192
/** PDF pages cannot exceed 200 inches. */
const MAX_PDF_PT = 14400

interface Raster {
  dataUrl: string
  cssWidth: number
  cssHeight: number
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Flatten the transparent capture onto a solid background. */
async function compositeOnto(dataUrl: string, background: string | null): Promise<string> {
  if (!background) return dataUrl

  const image = new Image()
  image.src = dataUrl
  await image.decode()

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d')
  if (!context) return dataUrl

  context.fillStyle = background
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)
  return canvas.toDataURL('image/png')
}

async function rasterize(pixelRatio: number, options: ExportOptions): Promise<Raster> {
  const stage = canvasRegistry.stage
  const worldGroup = canvasRegistry.worldGroup
  if (!stage || !worldGroup) throw new Error('The canvas is not ready yet')

  const shapes = useBoardStore.getState().shapes
  const bounds = getShapesBounds(shapes)
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('This board has nothing to export yet')
  }

  const { padding } = options
  const size = { width: stage.width(), height: stage.height() }
  const fitted = fitViewport(bounds, size, padding, ZOOM_LIMITS)

  const saved = {
    x: worldGroup.x(),
    y: worldGroup.y(),
    scaleX: worldGroup.scaleX(),
    scaleY: worldGroup.scaleY(),
    gridVisible: canvasRegistry.gridLayer?.visible() ?? false,
    overlayVisible: canvasRegistry.overlayLayer?.visible() ?? false,
    transformerNodes: canvasRegistry.transformer?.nodes() ?? []
  }

  try {
    canvasRegistry.gridLayer?.visible(false)
    canvasRegistry.overlayLayer?.visible(false)
    // An empty transformer draws nothing, which is more reliable than relying
    // on `visible(false)` propagating through the scene graph during export.
    canvasRegistry.transformer?.nodes([])

    worldGroup.setAttrs({ x: fitted.x, y: fitted.y, scaleX: fitted.scale, scaleY: fitted.scale })
    canvasRegistry.mainLayer?.batchDraw()
    await nextPaint()

    const cropX = Math.max(0, bounds.x * fitted.scale + fitted.x - padding)
    const cropY = Math.max(0, bounds.y * fitted.scale + fitted.y - padding)
    const cropWidth = Math.min(size.width - cropX, bounds.width * fitted.scale + padding * 2)
    const cropHeight = Math.min(size.height - cropY, bounds.height * fitted.scale + padding * 2)

    // Clamp the device pixel ratio so a large board cannot ask for a canvas the
    // browser will silently refuse to allocate.
    const safeRatio = Math.max(
      1,
      Math.min(pixelRatio, MAX_RASTER_EDGE / Math.max(cropWidth, cropHeight))
    )

    const raw = stage.toDataURL({
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
      pixelRatio: safeRatio,
      mimeType: 'image/png'
    })

    const background = options.includeBackground
      ? CANVAS_BACKGROUND[useUiStore.getState().resolvedTheme]
      : null

    return {
      dataUrl: await compositeOnto(raw, background),
      cssWidth: cropWidth,
      cssHeight: cropHeight
    }
  } finally {
    // Restore unconditionally: a failed export must not leave the canvas
    // reframed with its grid switched off.
    worldGroup.setAttrs({
      x: saved.x,
      y: saved.y,
      scaleX: saved.scaleX,
      scaleY: saved.scaleY
    })
    canvasRegistry.gridLayer?.visible(saved.gridVisible)
    canvasRegistry.overlayLayer?.visible(saved.overlayVisible)
    canvasRegistry.transformer?.nodes(saved.transformerNodes)
    canvasRegistry.mainLayer?.batchDraw()
  }
}

async function buildPdf(raster: Raster): Promise<Uint8Array> {
  // jsPDF is ~350 kB and only a PDF export ever needs it, so it is fetched on
  // demand. A static import would put it in the startup chunk and every user
  // would pay for it on launch, even the ones who only ever draw.
  const { jsPDF } = await import('jspdf')

  const widthPt = raster.cssWidth * PX_TO_PT
  const heightPt = raster.cssHeight * PX_TO_PT
  const shrink = Math.min(1, MAX_PDF_PT / Math.max(widthPt, heightPt))
  const pageWidth = widthPt * shrink
  const pageHeight = heightPt * shrink

  const document = new jsPDF({
    orientation: pageWidth >= pageHeight ? 'landscape' : 'portrait',
    unit: 'pt',
    // Passing the real dimensions keeps the PDF page exactly the size of the
    // exported board rather than an A4 sheet with the art floating in it.
    format: [pageWidth, pageHeight],
    compress: true
  })

  document.addImage(raster.dataUrl, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
  return new Uint8Array(document.output('arraybuffer'))
}

export async function exportBoard(
  format: ExportFormat,
  overrides: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  const options: ExportOptions = { ...DEFAULT_OPTIONS, ...overrides }
  const board = useBoardStore.getState()
  const suggestedName = board.boardName.trim() || 'whiteboard'

  if (format === 'svg') {
    if (board.shapes.length === 0) throw new Error('This board has nothing to export yet')
    const { svg } = serializeToSvg(board.shapes, {
      padding: options.padding,
      background: options.includeBackground
        ? CANVAS_BACKGROUND[useUiStore.getState().resolvedTheme]
        : null
    })
    return ioService.exportFile({ format: 'svg', suggestedName, text: svg })
  }

  if (format === 'png') {
    const raster = await rasterize(options.pngPixelRatio ?? 2, options)
    return ioService.exportFile({
      format: 'png',
      suggestedName,
      bytes: dataUrlToBytes(raster.dataUrl)
    })
  }

  const raster = await rasterize(options.pdfPixelRatio ?? 3, options)
  const bytes = await buildPdf(raster)
  return ioService.exportFile({ format: 'pdf', suggestedName, bytes })
}
