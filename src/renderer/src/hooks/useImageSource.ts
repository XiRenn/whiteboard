import { useEffect, useState } from 'react'

/**
 * Load an image from a `data:` URL into an HTMLImageElement for Konva.
 *
 * Images are cached by source string at module scope: a board with the same
 * logo on twenty notes must decode the bitmap once, not twenty times. The cache
 * is what makes re-rendering a large board cheap.
 */

const cache = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<HTMLImageElement>>()

function load(src: string): Promise<HTMLImageElement> {
  const cached = cache.get(src)
  if (cached) return Promise.resolve(cached)

  const existing = pending.get(src)
  if (existing) return existing

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      cache.set(src, image)
      pending.delete(src)
      resolve(image)
    }
    image.onerror = () => {
      pending.delete(src)
      reject(new Error('Image could not be decoded'))
    }
    image.src = src
  })

  pending.set(src, promise)
  return promise
}

export function useImageSource(src: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(() => cache.get(src) ?? null)

  useEffect(() => {
    if (!src) {
      setImage(null)
      return
    }

    const cached = cache.get(src)
    if (cached) {
      setImage(cached)
      return
    }

    let cancelled = false
    load(src)
      .then((loaded) => {
        if (!cancelled) setImage(loaded)
      })
      .catch(() => {
        if (!cancelled) setImage(null)
      })

    return () => {
      cancelled = true
    }
  }, [src])

  return image
}

/** Free a cached bitmap once no board references it any more. */
export function releaseImageSource(src: string): void {
  cache.delete(src)
  pending.delete(src)
}
