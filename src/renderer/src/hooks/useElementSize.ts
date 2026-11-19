import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface Size {
  width: number
  height: number
}

/**
 * Track an element's content-box size with a ResizeObserver.
 *
 * The canvas needs this for two reasons: Konva's Stage must be given explicit
 * pixel dimensions, and every pointer position has to be converted to world
 * coordinates against the same box. Sizes are rounded to whole pixels so a
 * fractional layout width does not trigger a resize loop.
 */
export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, Size] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const apply = (width: number, height: number): void => {
      const next = { width: Math.round(width), height: Math.round(height) }
      setSize((previous) =>
        previous.width === next.width && previous.height === next.height ? previous : next
      )
    }

    apply(element.clientWidth, element.clientHeight)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const box = entry.contentBoxSize?.[0]
      if (box) apply(box.inlineSize, box.blockSize)
      else apply(entry.contentRect.width, entry.contentRect.height)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}
