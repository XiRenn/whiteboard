import { Icon } from '@/components/ui/Icon'
import { useUiStore, type Toast } from '@/store/useUiStore'

const TONE_STYLES: Record<Toast['tone'], string> = {
  info: 'border-neutral-200 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100'
}

const TONE_ICONS: Record<Toast['tone'], 'info' | 'check' | 'alert'> = {
  info: 'info',
  success: 'check',
  error: 'alert'
}

/** Transient notifications, stacked bottom-right above the status bar. */
export function Toasts(): React.JSX.Element {
  const toasts = useUiStore((state) => state.toasts)
  const dismiss = useUiStore((state) => state.dismissToast)

  return (
    <div
      className="pointer-events-none fixed bottom-12 right-4 z-40 flex w-80 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg ${TONE_STYLES[toast.tone]}`}
        >
          <Icon name={TONE_ICONS[toast.tone]} size={15} className="mt-0.5 shrink-0" />
          <span className="flex-1 break-words">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
