import { type ReactElement, type RefObject, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../lib/fetch.js'
import { type AheadGroup, countAhead, publishAhead } from '../lib/publish-ahead.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'

export interface PublishAllModalProps {
  groups: readonly AheadGroup[]
  onClose: () => void
  /** Called once the documents are published */
  onPublished: () => void
}

type Phase =
  | { name: 'ask' }
  | { name: 'publishing' }
  | { name: 'done'; published: number }
  | { name: 'failed'; message: string }

function documents(count: number): string {
  return count === 1 ? '1 document' : `${count} documents`
}

function Message({ phase, count }: { phase: Phase; count: number }): ReactElement {
  if (phase.name === 'done') {
    return (
      <p role="status">
        Published {documents(phase.published)}. Visitors now see the saved versions.
      </p>
    )
  }
  if (phase.name === 'failed') return <p role="alert">{phase.message}</p>
  if (count === 0) {
    return (
      <p>No document has unpublished changes. Every live page shows its latest saved version.</p>
    )
  }
  return (
    <p>
      {count === 1 ? '1 document has' : `${count} documents have`} unpublished changes. Publishing
      makes each saved version what visitors see.
    </p>
  )
}

/** The phase of publishing, and the action that starts it */
function usePublishAll(
  groups: readonly AheadGroup[],
  onPublished: () => void,
): { phase: Phase; publish: () => Promise<void> } {
  const [phase, setPhase] = useState<Phase>({ name: 'ask' })
  async function publish(): Promise<void> {
    if (phase.name === 'publishing') return
    setPhase({ name: 'publishing' })
    try {
      const published = await publishAhead(groups)
      setPhase({ name: 'done', published })
      onPublished()
    } catch (err: unknown) {
      setPhase({ name: 'failed', message: errorMessage(err, 'Publishing failed') })
    }
  }
  return { phase, publish }
}

interface ActionsProps {
  phase: Phase
  count: number
  safeRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onPublish: () => void
}

/**
 * Cancel and Publish while asking; Close once answered. While publishing the
 * buttons stay focusable but inert (`aria-disabled`), so focus never leaves the dialog.
 */
function Actions({ phase, count, safeRef, onClose, onPublish }: ActionsProps): ReactElement {
  const busy = phase.name === 'publishing'
  if (count === 0 || phase.name === 'done' || phase.name === 'failed') {
    return (
      <Button ref={safeRef} onClick={onClose}>
        Close
      </Button>
    )
  }
  return (
    <>
      <Button ref={safeRef} onClick={busy ? undefined : onClose} aria-disabled={busy}>
        Cancel
      </Button>
      <Button variant="primary" onClick={busy ? undefined : onPublish} aria-disabled={busy}>
        {busy ? 'Publishing…' : `Publish ${documents(count)}`}
      </Button>
    </>
  )
}

/** The confirmation before publishing every draft ahead of live, then its result */
export function PublishAllModal({
  groups,
  onClose,
  onPublished,
}: PublishAllModalProps): ReactElement {
  const count = countAhead(groups)
  const { phase, publish } = usePublishAll(groups, onPublished)
  const safeRef = useRef<HTMLButtonElement>(null)
  const busy = phase.name === 'publishing'

  // The answer replaces the buttons: keep focus on the one that is left
  useEffect(() => {
    if (phase.name === 'done' || phase.name === 'failed') safeRef.current?.focus()
  }, [phase.name])

  return (
    <Modal
      title="Publish all drafts ahead of live"
      onClose={busy ? () => undefined : onClose}
      initialFocus={safeRef}
      busy={busy}
      actions={
        <Actions
          phase={phase}
          count={count}
          safeRef={safeRef}
          onClose={onClose}
          onPublish={() => void publish()}
        />
      }
    >
      <Message phase={phase} count={count} />
    </Modal>
  )
}
