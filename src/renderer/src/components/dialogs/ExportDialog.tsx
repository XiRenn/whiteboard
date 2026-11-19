import { useState } from 'react'
import { Button, Switch } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { Slider } from '@/components/ui/Slider'
import { runExport } from '@/hooks/useKeyboardShortcuts'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'

type Format = 'png' | 'svg' | 'pdf'

const FORMATS: Array<{ id: Format; label: string; detail: string }> = [
  { id: 'png', label: 'PNG', detail: 'Raster image at 2× — best for pasting into chat or docs' },
  { id: 'svg', label: 'SVG', detail: 'True vector — scales forever, editable in Illustrator or Figma' },
  { id: 'pdf', label: 'PDF', detail: 'Print-ready page sized to the board at 3× resolution' }
]

/**
 * Export dialog.
 *
 * Padding and background are exposed because they are the two things that
 * actually change what a whiteboard export looks like: a transparent PNG drops
 * straight onto a slide, while an opaque one is what you want in a document.
 */
export function ExportDialog(): React.JSX.Element {
  const open = useUiStore((state) => state.exportDialogOpen)
  const setOpen = useUiStore((state) => state.setExportDialogOpen)
  const shapeCount = useBoardStore((state) => state.shapes.length)

  const [format, setFormat] = useState<Format>('png')
  const [includeBackground, setIncludeBackground] = useState(true)
  const [padding, setPadding] = useState(40)
  const [busy, setBusy] = useState(false)

  const close = (): void => setOpen(false)

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      await runExport(format)
      close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Export board"
      description={`${shapeCount} object${shapeCount === 1 ? '' : 's'} will be rendered at full quality.`}
      onClose={close}
      footer={
        <>
          <Button tone="ghost" onClick={close}>
            Cancel
          </Button>
          <Button tone="solid" disabled={busy || shapeCount === 0} onClick={() => void run()}>
            <Icon name="download" size={15} />
            {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Format
          </span>
          <div className="space-y-1.5">
            {FORMATS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFormat(option.id)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  format === option.id
                    ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-400 dark:bg-indigo-950/40'
                    : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/60'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    format === option.id
                      ? 'border-indigo-500 dark:border-indigo-400'
                      : 'border-neutral-300 dark:border-neutral-600'
                  }`}
                >
                  {format === option.id && (
                    <span className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    {option.detail}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-xs font-medium text-neutral-800 dark:text-neutral-100">
              Include background
            </span>
            <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">
              Turn off for a transparent PNG.
            </span>
          </span>
          <Switch
            checked={includeBackground}
            onChange={setIncludeBackground}
            label="Include background"
          />
        </label>

        <Slider
          label="Padding"
          value={padding}
          min={0}
          max={200}
          step={4}
          display={`${padding} px`}
          onChange={setPadding}
        />
      </div>
    </Modal>
  )
}
