import { useState } from 'react'
import { TRANSPARENT } from '@/lib/constants'
import { Icon } from './Icon'

export interface ColorPickerProps {
  label: string
  value: string
  palette: readonly string[]
  /** Adds a "no fill" swatch and a free-form colour input. */
  allowTransparent?: boolean
  onChange: (color: string) => void
}

const TRANSPARENT_SWATCH =
  'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'

export function ColorPicker({
  label,
  value,
  palette,
  allowTransparent = false,
  onChange
}: ColorPickerProps): React.JSX.Element {
  const [custom, setCustom] = useState(value === TRANSPARENT ? '#6366f1' : value)

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </span>

      <div className="grid grid-cols-8 gap-1.5">
        {allowTransparent && (
          <button
            type="button"
            title="No fill"
            aria-label="No fill"
            onClick={() => onChange(TRANSPARENT)}
            className={`relative h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
              value === TRANSPARENT
                ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                : 'border-neutral-300 dark:border-neutral-600'
            }`}
            style={{ background: TRANSPARENT_SWATCH }}
          >
            {value === TRANSPARENT && (
              <Icon
                name="close"
                size={12}
                className="absolute inset-0 m-auto text-neutral-500"
              />
            )}
          </button>
        )}

        {palette.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={color}
            onClick={() => onChange(color)}
            style={{ background: color }}
            className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
              value.toLowerCase() === color.toLowerCase()
                ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                : 'border-black/10 dark:border-white/15'
            }`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label
          className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-600"
          title={`Custom ${label.toLowerCase()}`}
          style={{
            background: value === TRANSPARENT ? TRANSPARENT_SWATCH : value
          }}
        >
          <input
            type="color"
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value)
              onChange(event.target.value)
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`Custom ${label.toLowerCase()}`}
          />
        </label>
        <span className="truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
          {value === TRANSPARENT ? 'no fill' : value.toUpperCase()}
        </span>
      </div>
    </div>
  )
}
