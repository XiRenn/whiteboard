import { useId } from 'react'

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Rendered to the right of the label, e.g. "4 px". */
  display?: string
  onChange: (value: number) => void
  /** Called when the drag ends — useful for committing a history entry once. */
  onCommit?: () => void
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
  onCommit
}: SliderProps): React.JSX.Element {
  const id = useId()

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
        >
          {label}
        </label>
        {display && (
          <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{display}</span>
        )}
      </div>
      <input
        id={id}
        type="range"
        className="wb-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </div>
  )
}
