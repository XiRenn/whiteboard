import { Modal } from '@/components/ui/Modal'
import { TOOLS } from '@/types/tools'
import { useUiStore } from '@/store/useUiStore'

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Editing',
    items: [
      ['Ctrl + Z', 'Undo'],
      ['Ctrl + Shift + Z / Ctrl + Y', 'Redo'],
      ['Ctrl + D', 'Duplicate selection'],
      ['Ctrl + C / Ctrl + V', 'Copy and paste'],
      ['Ctrl + X', 'Cut'],
      ['Delete / Backspace', 'Delete selection'],
      ['Ctrl + G / Ctrl + Shift + G', 'Group / ungroup'],
      ['Ctrl + A', 'Select all'],
      ['Escape', 'Clear selection or return to Select']
    ]
  },
  {
    title: 'View',
    items: [
      ['Scroll', 'Pan the canvas'],
      ['Shift + Scroll', 'Pan horizontally'],
      ['Ctrl + Scroll', 'Zoom at the pointer'],
      ['Space + Drag', 'Pan (temporary hand tool)'],
      ['Middle-drag', 'Pan'],
      ['Ctrl + = / Ctrl + -', 'Zoom in and out'],
      ['Ctrl + 0', 'Reset to 100%'],
      ['Ctrl + 1', 'Zoom to fit the board'],
      ["Ctrl + '", 'Toggle the grid']
    ]
  },
  {
    title: 'Files and app',
    items: [
      ['Ctrl + N', 'New board'],
      ['Ctrl + O', 'Toggle the board list'],
      ['Ctrl + S', 'Save now'],
      ['Ctrl + I', 'Import images'],
      ['Ctrl + Shift + E', 'Export as PNG'],
      ['Ctrl + Shift + L', 'Toggle light / dark theme'],
      ['?', 'Show this dialog']
    ]
  }
]

/** Keyboard reference. Also the place the tool shortcuts are documented. */
export function ShortcutsDialog(): React.JSX.Element {
  const open = useUiStore((state) => state.shortcutsOpen)
  const setOpen = useUiStore((state) => state.setShortcutsOpen)

  return (
    <Modal
      open={open}
      title="Keyboard shortcuts"
      description="Everything in the app is reachable without the mouse."
      onClose={() => setOpen(false)}
      width="max-w-2xl"
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Tools
          </h3>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {TOOLS.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 px-2.5 py-1.5 dark:border-neutral-700"
              >
                <span className="truncate text-xs text-neutral-700 dark:text-neutral-200">
                  {tool.label}
                </span>
                <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {tool.shortcut}
                </kbd>
              </div>
            ))}
          </div>
        </section>

        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {group.title}
            </h3>
            <dl className="space-y-1">
              {group.items.map(([keys, description]) => (
                <div
                  key={keys}
                  className="flex items-center justify-between gap-4 rounded-md px-2 py-1 odd:bg-neutral-50 dark:odd:bg-neutral-800/40"
                >
                  <dt className="text-xs text-neutral-700 dark:text-neutral-200">{description}</dt>
                  <dd className="shrink-0 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                    {keys}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
