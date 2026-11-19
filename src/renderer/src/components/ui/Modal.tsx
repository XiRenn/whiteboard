import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * Modal dialog.
 *
 * Uses the native `<dialog>`-less approach on purpose: a portal would need a
 * DOM node outside the React root, and `showModal()` brings its own quirks in
 * Electron. Instead this renders an overlay with focus trapping and Escape
 * handling, which is all the app needs and behaves identically everywhere.
 */
export interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 'max-w-lg'
}: ModalProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      // Focus trap: keep Tab inside the dialog.
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{ background: 'rgba(9, 11, 16, 0.45)', backdropFilter: 'blur(3px)' }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${width} overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50/70 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950/40">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
