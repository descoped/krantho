import { type ReactElement, type RefObject, useEffect, useRef, useState } from 'react'
import { bulkDeleteMedia, deleteMedia, type MediaItem } from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { filesText, type References, referenceCount, referenceText } from './media-model.js'

/** What a delete did: the ids it removed, and why any were left */
interface Outcome {
  deleted: string[]
  skipped: Array<{ id: string; reason: string }>
}

type Phase =
  | { name: 'ask' }
  | { name: 'working' }
  | { name: 'done'; outcome: Outcome }
  | { name: 'failed'; message: string }

/** One file through `DELETE /api/media/:id`; several through the bulk route (admins) */
async function runDelete(items: readonly MediaItem[]): Promise<Outcome> {
  const [only] = items
  if (only && items.length === 1) {
    await deleteMedia(only.id)
    return { deleted: [only.id], skipped: [] }
  }
  return bulkDeleteMedia(items.map((item) => item.id))
}

/** Each file to delete, with its references as the API reported them */
function DeleteList({
  items,
  references,
}: {
  items: readonly MediaItem[]
  references: (id: string) => References | undefined
}): ReactElement {
  const used = items.filter((item) => (referenceCount(references(item.id)) ?? 0) > 0)
  const unknown = items.filter((item) => referenceCount(references(item.id)) === null)
  return (
    <>
      <ul className="media-delete-list">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.filename}</strong> — {referenceText(references(item.id))}
          </li>
        ))}
      </ul>
      {used.length > 0 && (
        <p className="media-warning" role="note">
          {filesText(used.length)} {used.length === 1 ? 'is' : 'are'} used by documents. Their pages
          lose the image: the documents still point at a file that is gone.
        </p>
      )}
      {unknown.length > 0 && (
        <p className="media-warning" role="note">
          The references of {filesText(unknown.length)} are not read yet or could not be read, so
          they may be in use.
        </p>
      )}
      <p>This cannot be undone.</p>
    </>
  )
}

function OutcomeView({
  outcome,
  items,
}: {
  outcome: Outcome
  items: readonly MediaItem[]
}): ReactElement {
  const name = (id: string): string => items.find((item) => item.id === id)?.filename ?? id
  return (
    <div role="status">
      <p>Deleted {filesText(outcome.deleted.length)}.</p>
      {outcome.skipped.length > 0 && (
        <ul className="media-delete-list">
          {outcome.skipped.map((skip) => (
            <li key={skip.id}>
              {name(skip.id)}: {skip.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Actions({
  phase,
  count,
  safe,
  onClose,
  onRun,
}: {
  phase: Phase
  count: number
  safe: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onRun: () => void
}): ReactElement {
  if (phase.name === 'done' || phase.name === 'failed') {
    return (
      <Button ref={safe} onClick={onClose}>
        Close
      </Button>
    )
  }
  const busy = phase.name === 'working'
  return (
    <>
      <Button ref={safe} aria-disabled={busy} onClick={busy ? undefined : onClose}>
        Cancel
      </Button>
      <Button variant="danger" aria-disabled={busy} onClick={busy ? undefined : onRun}>
        {busy ? 'Deleting…' : `Delete ${filesText(count)}`}
      </Button>
    </>
  )
}

export interface DeleteModalProps {
  items: readonly MediaItem[]
  references: (id: string) => References | undefined
  onClose: () => void
  /** Called once the delete has run, with the ids it removed */
  onDone: (deleted: string[]) => void
}

/** The delete's phase, and the run that moves it: asked, working, then done or failed */
function useDeleteRun(props: DeleteModalProps): { phase: Phase; run: () => Promise<void> } {
  const [phase, setPhase] = useState<Phase>({ name: 'ask' })
  async function run(): Promise<void> {
    setPhase({ name: 'working' })
    try {
      const outcome = await runDelete(props.items)
      setPhase({ name: 'done', outcome })
      props.onDone(outcome.deleted)
    } catch (err: unknown) {
      setPhase({ name: 'failed', message: errorMessage(err, 'Delete failed') })
    }
  }
  return { phase, run }
}

/** Delete files once confirmed: what goes, which documents use them, then what it did */
export function DeleteModal(props: DeleteModalProps): ReactElement {
  const { phase, run } = useDeleteRun(props)
  const safe = useRef<HTMLButtonElement>(null)
  // The answer replaces the buttons: keep focus on the one that is left
  useEffect(() => {
    if (phase.name === 'done' || phase.name === 'failed') safe.current?.focus()
  }, [phase.name])
  const busy = phase.name === 'working'
  return (
    <Modal
      title={props.items.length === 1 ? 'Delete file' : 'Delete files'}
      onClose={busy ? () => undefined : props.onClose}
      initialFocus={safe}
      busy={busy}
      actions={
        <Actions
          phase={phase}
          count={props.items.length}
          safe={safe}
          onClose={props.onClose}
          onRun={() => void run()}
        />
      }
    >
      {phase.name === 'done' && <OutcomeView outcome={phase.outcome} items={props.items} />}
      {phase.name === 'failed' && <p role="alert">{phase.message}</p>}
      {(phase.name === 'ask' || phase.name === 'working') && (
        <DeleteList items={props.items} references={props.references} />
      )}
    </Modal>
  )
}
