import type { ReactElement } from 'react'
import { type CheckpointInfo, deleteCheckpoint, restoreCheckpoint } from '../lib/api.js'
import { formatShortDateTime } from '../lib/format.js'
import { useToast } from '../ui/toast.js'
import { checkpointName } from './checkpoints-model.js'
import { ConfirmModal } from './confirm-modal.js'

interface CheckpointConfirmProps {
  checkpoint: CheckpointInfo
  /** The action ran: close, and read the checkpoints again */
  onDone: () => void
  onClose: () => void
}

/**
 * Restore, behind a danger confirmation that says what the API does
 * (`POST /api/checkpoints/:version/restore`): it takes a safety checkpoint,
 * rewinds documents, runtime fields and media records to the checkpoint's
 * time, and announces a site-wide change, which marks every cached page stale
 */
export function RestoreCheckpoint({
  checkpoint,
  onDone,
  onClose,
}: CheckpointConfirmProps): ReactElement {
  const toast = useToast()
  const name = checkpointName(checkpoint)
  async function restore(): Promise<void> {
    await restoreCheckpoint(checkpoint.version)
    toast({ text: `Restored ${name}. A safety checkpoint of the state before was taken first.` })
    onDone()
  }
  return (
    <ConfirmModal
      title={`Restore ${name}?`}
      confirmLabel="Restore checkpoint"
      danger
      onConfirm={restore}
      onClose={onClose}
    >
      <p>
        Every document — the version being edited and the version that is live — the runtime fields
        and the media library's records go back to how they stood at{' '}
        {formatShortDateTime(checkpoint.createdAt)}. Versions saved since stay in each document's
        history but are no longer current.
      </p>
      <p>
        A safety checkpoint, <code>pre-restore-v{checkpoint.version}</code>, is taken first, so you
        can return to how things are now. Settings, SEO configuration and people are not rewound.
      </p>
      <p>
        Every cached page is marked stale: its next visit may still get the old page while it is
        rendered again.
      </p>
    </ConfirmModal>
  )
}

/** Delete, confirmed: the checkpoint goes, the content stays as it is */
export function DeleteCheckpoint({
  checkpoint,
  onDone,
  onClose,
}: CheckpointConfirmProps): ReactElement {
  const toast = useToast()
  const name = checkpointName(checkpoint)
  async function remove(): Promise<void> {
    await deleteCheckpoint(checkpoint.version)
    toast({ text: `Deleted ${name}.` })
    onDone()
  }
  return (
    <ConfirmModal
      title={`Delete ${name}?`}
      confirmLabel="Delete checkpoint"
      danger
      onConfirm={remove}
      onClose={onClose}
    >
      <p>It can no longer be restored. The content stays as it is.</p>
    </ConfirmModal>
  )
}
