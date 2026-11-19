import { useCallback, useEffect } from 'react'
import { appService, prefsService } from '@/services/boardService'
import { useUiStore } from '@/store/useUiStore'

/**
 * Resolves the theme preference (light / dark / system) into a concrete theme
 * and keeps the document root in sync.
 *
 * The `dark` class is what Tailwind's `dark:` variant keys off, and
 * `color-scheme` is set so native scrollbars and form controls follow suit —
 * without it, a dark board gets a bright white scrollbar.
 *
 * It also repaints the native window-control overlay. Those buttons are drawn
 * by Windows, not by us, so they do not inherit the `dark` class and have to be
 * told explicitly — otherwise a dark title bar keeps bright white buttons.
 */
export function useTheme(): { toggleTheme: () => void } {
  const preference = useUiStore((state) => state.themePreference)
  const setResolvedTheme = useUiStore((state) => state.setResolvedTheme)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = (): void => {
      const resolved = preference === 'system' ? (query.matches ? 'dark' : 'light') : preference
      setResolvedTheme(resolved)
      const root = document.documentElement
      root.classList.toggle('dark', resolved === 'dark')
      root.style.colorScheme = resolved
      void appService.setTitlebarTheme(resolved)
    }

    apply()
    if (preference !== 'system') return
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [preference, setResolvedTheme])

  const toggleTheme = useCallback(() => {
    const state = useUiStore.getState()
    const next = state.resolvedTheme === 'dark' ? 'light' : 'dark'
    state.setThemePreference(next)
    void prefsService.set({ theme: next })
  }, [])

  return { toggleTheme }
}
