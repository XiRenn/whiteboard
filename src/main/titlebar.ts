import { nativeTheme, type BrowserWindow } from 'electron'
import type { AppPreferences, TitlebarTheme } from '@shared/ipc-contract'

/**
 * The native window-control overlay.
 *
 * `titleBarOverlay` keeps Windows drawing its own minimise/maximise/close
 * buttons while letting us own the rest of the title bar. That is deliberate:
 * those controls come with Windows 11 Snap Layouts (hover the maximise button),
 * correct hit-testing at every DPI, and the OS's own accessibility behaviour —
 * all of which a hand-drawn button strip would have to reimplement badly.
 *
 * The trade is that the overlay's colours are ours to keep in sync. They are
 * defined here rather than in the renderer so there is exactly one place that
 * knows what colour the buttons are, and the renderer only has to say which
 * theme is active.
 */

/**
 * Height in DIPs. Must equal the title bar's rendered height or the native
 * buttons will sit proud of the bar — `TopBar` is `h-12`, which is 48px.
 */
export const TITLEBAR_HEIGHT = 48

/**
 * These must match the title bar's own background, not the canvas background:
 * the overlay is painted adjacent to the bar, so any mismatch shows as a seam.
 * `#ffffff` is Tailwind's `bg-white`, `#171717` its `dark:bg-neutral-900`.
 */
const OVERLAY: Record<TitlebarTheme, { color: string; symbolColor: string }> = {
  light: { color: '#ffffff', symbolColor: '#171717' },
  dark: { color: '#171717', symbolColor: '#fafafa' }
}

/** Collapse a preference into a concrete theme, consulting the OS for 'system'. */
export function resolveTitlebarTheme(preference: AppPreferences['theme']): TitlebarTheme {
  if (preference === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  return preference
}

export function titlebarOverlayFor(theme: TitlebarTheme): {
  color: string
  symbolColor: string
  height: number
} {
  return { ...OVERLAY[theme], height: TITLEBAR_HEIGHT }
}

/**
 * Repaint the overlay. Only Windows and Linux draw one; on macOS the traffic
 * lights are the OS's own and this would throw, so it is skipped there.
 */
export function applyTitlebarTheme(win: BrowserWindow | null, theme: TitlebarTheme): void {
  if (process.platform === 'darwin') return
  if (!win || win.isDestroyed()) return
  try {
    win.setTitleBarOverlay(titlebarOverlayFor(theme))
  } catch (error) {
    // A window without `titleBarOverlay` enabled throws here. That is a
    // configuration mistake, not something worth taking the app down for.
    console.warn('[titlebar] could not update the overlay:', error)
  }
}
