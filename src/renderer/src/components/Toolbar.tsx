import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/Button'
import { TOOLS } from '@/types/tools'
import { useUiStore } from '@/store/useUiStore'

/**
 * The left tool rail.
 *
 * Shortcut hints live in the tooltip rather than on the button: a rail of
 * letters would be unreadable, and the full list is one keystroke away via the
 * shortcuts dialog.
 */
export function Toolbar(): React.JSX.Element {
  const tool = useUiStore((state) => state.tool)
  const setTool = useUiStore((state) => state.setTool)

  return (
    <aside
      className="flex w-13 shrink-0 flex-col items-center gap-0.5 border-r border-neutral-200 bg-white py-2 dark:border-neutral-800 dark:bg-neutral-900"
      aria-label="Tools"
    >
      {TOOLS.map((definition, index) => (
        <div key={definition.id} className="contents">
          {/* A visual break between "interact" tools and "create" tools. */}
          {index === 2 && <span className="my-1 h-px w-6 bg-neutral-200 dark:bg-neutral-700" />}
          <IconButton
            label={`${definition.label} — ${definition.hint} (${definition.shortcut})`}
            active={tool === definition.id}
            size="lg"
            onClick={() => setTool(definition.id)}
          >
            <Icon name={definition.id} size={19} />
          </IconButton>
        </div>
      ))}
    </aside>
  )
}
