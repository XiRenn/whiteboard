import { useEffect, useRef, useState } from 'react'
import { MENU_MODEL, type MenuItem } from '@shared/menu-model'
import type { MenuCommand } from '@shared/ipc-contract'
import { runMenuCommand } from '@/hooks/useMenuCommands'
import type { BoardOperations } from '@/hooks/useBoardOperations'
import { appService } from '@/services/boardService'
import { useBoardStore } from '@/store/useBoardStore'

/**
 * The application menu, rendered inside the custom title bar.
 *
 * Structure comes from `MENU_MODEL` and clicks are routed through the same
 * `runMenuCommand` the native menu uses, so an item's *behaviour* is shared
 * with the native menu rather than reimplemented.
 *
 * It is only rendered on Windows and Linux, where the native menu bar is
 * hidden. macOS keeps its system menu bar, so rendering this there too would
 * show the same menu twice — see `IS_MAC`.
 *
 * The dropdowns are absolutely positioned against a full-height wrapper rather
 * than the button, so `top-full` lands on the title bar's bottom edge instead of
 * on the bottom of a 48px-tall button.
 */
export function TitleBarMenu({ operations }: { operations: BoardOperations }): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const selectedCount = useBoardStore((state) => state.selectedIds.length)
  const canUndo = useBoardStore((state) => state.past.length > 0)
  const canRedo = useBoardStore((state) => state.future.length > 0)

  /**
   * Menu items whose target does not exist should look unavailable rather than
   * silently doing nothing when clicked.
   */
  const isDisabled = (command: MenuCommand): boolean => {
    switch (command) {
      case 'undo':
        return !canUndo
      case 'redo':
        return !canRedo
      case 'delete':
      case 'duplicate':
        return selectedCount === 0
      case 'group':
        return selectedCount < 2
      case 'ungroup':
        return selectedCount === 0
      default:
        return false
    }
  }

  // Close on an outside click, and on Escape. Both listeners are registered in
  // the capture phase so the canvas never sees the event that dismissed the
  // menu — otherwise Escape would close the menu *and* clear the selection.
  useEffect(() => {
    if (!openId) return

    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenId(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpenId(null)
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [openId])

  const activate = (item: MenuItem): void => {
    setOpenId(null)
    if (item.action.kind === 'command') {
      runMenuCommand(item.action.command, operations)
    } else {
      // Window/app-level commands run in main; there is nothing to do here
      // beyond handing it over.
      void appService.command(item.action.command)
    }
  }

  return (
    <div ref={rootRef} className="flex h-full items-stretch">
      {MENU_MODEL.map((section) => {
        const isOpen = openId === section.id

        return (
          <div
            key={section.id}
            className="relative h-full"
            // Once one menu is open, sliding across the bar should switch
            // between them, the way a native menu bar behaves.
            onMouseEnter={() => openId && setOpenId(section.id)}
          >
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : section.id)}
              className={`flex h-full items-center rounded-md px-2.5 text-[13px] transition-colors ${
                isOpen
                  ? 'bg-neutral-200/70 text-neutral-900 dark:bg-neutral-700/70 dark:text-neutral-50'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-50'
              }`}
            >
              {section.label}
            </button>

            {isOpen && (
              <div
                role="menu"
                aria-label={section.label}
                data-no-drag
                className="absolute left-0 top-full z-50 min-w-60 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-800"
              >
                {section.items.map((item) => {
                  const disabled = item.action.kind === 'command' && isDisabled(item.action.command)

                  return (
                    <div key={item.label}>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={disabled}
                        onClick={() => activate(item)}
                        className={`group flex w-full items-center gap-6 px-3 py-1.5 text-left text-[13px] transition-colors ${
                          disabled
                            ? 'cursor-default text-neutral-300 dark:text-neutral-600'
                            : 'text-neutral-700 hover:bg-indigo-500 hover:text-white dark:text-neutral-200'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        {item.accelerator && (
                          <span
                            className={`ml-auto shrink-0 text-[11px] tabular-nums ${
                              disabled
                                ? 'text-neutral-300 dark:text-neutral-600'
                                : 'text-neutral-400 group-hover:text-white dark:text-neutral-500'
                            }`}
                          >
                            {item.accelerator}
                          </span>
                        )}
                      </button>

                      {item.separatorAfter && (
                        <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
