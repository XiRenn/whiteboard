import type { WhiteboardApi } from '@shared/ipc-contract'

/**
 * The bridge injected by `src/preload/index.ts`.
 *
 * `window.whiteboard` is optional on purpose: the renderer bundle is also
 * served by the Vite dev server in a plain browser during UI work, where no
 * preload exists. Code that touches it must go through `boardService`, which
 * falls back to an in-memory store in that situation.
 */
declare global {
  interface Window {
    whiteboard?: WhiteboardApi
  }
}

export {}
