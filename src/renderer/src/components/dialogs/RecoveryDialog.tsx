import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { formatRelativeTime, pluralize } from '@/lib/format'
import { boardService, recoveryService } from '@/services/boardService'
import { useBoardStore } from '@/store/useBoardStore'
import { useUiStore } from '@/store/useUiStore'
import type { RecoveryEntry } from '@shared/ipc-contract'

/**
 * Crash-recovery prompt.
 *
 * A snapshot only survives to this point if the previous session ended without
 * shutting down cleanly — the main process wipes the recovery directory on a
 * normal quit. So the presence of a list here *is* the signal that something
 * went wrong, and the dialog says so rather than being coy about it.
 *
 * An entry marked "interrupted write" came from the write journal, meaning the
 * app died between writing a board file and renaming it into place.
 */
export function RecoveryDialog({
  onRestored
}: {
  onRestored: () => void | Promise<void>
}): React.JSX.Element {
  const open = useUiStore((state) => state.recoveryOpen)
  const entries = useUiStore((state) => state.recoveryEntries)
  const setOpen = useUiStore((state) => state.setRecoveryOpen)
  const setRecoveryEntries = useUiStore((state) => state.setRecoveryEntries)
  const pushToast = useUiStore((state) => state.pushToast)

  const [busyId, setBusyId] = useState<string | null>(null)

  const restore = async (entry: RecoveryEntry): Promise<void> => {
    setBusyId(entry.boardId)
    try {
      const snapshot = await recoveryService.read(entry.boardId)
      useBoardStore.getState().hydrate(snapshot)
      // Write it back immediately: the snapshot is only in the recovery folder,
      // which the next clean shutdown will clear.
      const result = await boardService.save(snapshot)
      useBoardStore.getState().markSaved(result.savedAt)
      await recoveryService.clear(entry.boardId)
      await onRestored()
      pushToast(`Recovered “${snapshot.name}”`, 'success')
      finish()
    } catch (error) {
      pushToast(
        `Could not recover the board: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      )
    } finally {
      setBusyId(null)
    }
  }

  const discard = async (): Promise<void> => {
    try {
      await Promise.all(entries.map((entry) => recoveryService.clear(entry.boardId)))
    } catch {
      /* best effort */
    }
    finish()
  }

  const finish = (): void => {
    setRecoveryEntries([])
    setOpen(false)
  }

  return (
    <Modal
      open={open}
      title="Recover unsaved work?"
      description="The app did not shut down normally last time, so these snapshots were kept."
      onClose={finish}
      footer={
        <>
          <Button tone="ghost" onClick={() => void discard()}>
            Discard all
          </Button>
        </>
      }
    >
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.boardId}
            className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-neutral-700"
          >
            <Icon name="alert" size={18} className="shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                {entry.boardName}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                {formatRelativeTime(entry.savedAt)} · {pluralize(entry.shapeCount, 'object')}
                {entry.fromJournal && ' · interrupted write'}
              </p>
            </div>
            <Button
              size="sm"
              tone="solid"
              disabled={busyId !== null}
              onClick={() => void restore(entry)}
            >
              {busyId === entry.boardId ? 'Restoring…' : 'Restore'}
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
