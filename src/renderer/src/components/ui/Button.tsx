import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

/**
 * Small, dependency-free UI primitives.
 *
 * Deliberately hand-rolled rather than pulled from a component library: the app
 * must work fully offline with no CDN fonts or runtime asset fetches, and a
 * handful of Tailwind-styled buttons is cheaper than a design system.
 */

type ButtonTone = 'ghost' | 'solid' | 'outline' | 'danger'
type ButtonSize = 'sm' | 'md'

const TONES: Record<ButtonTone, string> = {
  ghost:
    'text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-50',
  solid:
    'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/20 dark:bg-indigo-500 dark:hover:bg-indigo-400',
  outline:
    'border border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800',
  danger:
    'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50'
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone
  size?: ButtonSize
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = 'ghost', size = 'md', className = '', children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex select-none items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  tone?: ButtonTone
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const ICON_SIZES = {
  sm: 'h-7 w-7 rounded-md',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-10 w-10 rounded-lg'
} as const

/**
 * `label` is required and becomes both the accessible name and the native
 * tooltip, so an icon-only control is never unlabelled.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active = false, tone = 'ghost', size = 'md', className = '', children, ...rest },
  ref
) {
  const activeClasses = active
    ? 'bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400'
    : TONES[tone]

  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex shrink-0 select-none items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ICON_SIZES[size]} ${activeClasses} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
})

export function Divider({ vertical = false }: { vertical?: boolean }): React.JSX.Element {
  return vertical ? (
    <span className="mx-1 h-6 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700" />
  ) : (
    <span className="my-1 h-px w-full bg-neutral-200 dark:bg-neutral-700" />
  )
}

export function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-neutral-300 dark:bg-neutral-600'
      }`}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150"
        style={{ transform: `translateX(${checked ? 18 : 2}px)` }}
      />
    </button>
  )
}
