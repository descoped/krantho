import { type ReactElement, useRef } from 'react'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import type { StatusChange } from './header-model.js'
import { leaveMessage } from './kept-work.js'
import { PublishModal } from './publish-modal.js'
import type { Workspace } from './use-workspace.js'

/** The open confirmation, if any */
export type Dialog = { kind: 'publish' } | { kind: 'status'; change: StatusChange } | null

/** Leaving with unsaved changes: Stay is the safe choice and has focus */
function LeaveModal({
  message,
  onStay,
  onLeave,
}: {
  /** What happens to the unsaved work — `leaveMessage()`, true in every case */
  message: string
  onStay: () => void
  onLeave: () => void
}): ReactElement {
  const stayRef = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      title="Leave without saving?"
      onClose={onStay}
      initialFocus={stayRef}
      actions={
        <>
          <Button ref={stayRef} onClick={onStay}>
            Stay
          </Button>
          <Button variant="danger" onClick={onLeave}>
            Leave
          </Button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  )
}

interface StatusCopy {
  title: (name: string) => string
  verb: string
  busy: string
  says: string
  /** Taking the page off the site is the danger; unarchiving publishes nothing */
  danger: boolean
}

const STATUS_COPY: Readonly<Record<StatusChange, StatusCopy>> = {
  unpublish: {
    title: (name) => `Unpublish ${name}?`,
    verb: 'Unpublish',
    busy: 'Unpublishing…',
    says: 'Visitors stop seeing it. The change is recorded as a new version, and publishing makes it live again.',
    danger: true,
  },
  archive: {
    title: (name) => `Archive ${name}?`,
    verb: 'Archive',
    busy: 'Archiving…',
    says: 'Visitors stop seeing it and it is marked archived, recorded as a new version. Its versions stay.',
    danger: true,
  },
  unarchive: {
    title: (name) => `Restore ${name} to draft?`,
    verb: 'Restore to draft',
    busy: 'Restoring…',
    says: 'It is no longer archived and becomes a draft again, recorded as a new version. Nothing is published.',
    danger: false,
  },
}

interface StatusChangeProps {
  change: StatusChange
  name: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

function StatusChangeModal(props: StatusChangeProps): ReactElement {
  const { change, name, busy, onConfirm, onClose } = props
  const cancelRef = useRef<HTMLButtonElement>(null)
  const copy = STATUS_COPY[change]
  const actions = (
    <>
      <Button ref={cancelRef} onClick={busy ? undefined : onClose} aria-disabled={busy}>
        Cancel
      </Button>
      <Button
        variant={copy.danger ? 'danger' : 'primary'}
        onClick={busy ? undefined : onConfirm}
        aria-disabled={busy}
      >
        {busy ? copy.busy : copy.verb}
      </Button>
    </>
  )
  return (
    <Modal
      title={copy.title(name)}
      onClose={busy ? () => undefined : onClose}
      initialFocus={cancelRef}
      busy={busy}
      actions={actions}
    >
      <p>{copy.says}</p>
    </Modal>
  )
}

/** Publish, or take the page off the site, confirmed first */
function PublicationDialog({
  ws,
  hasPage,
  dialog,
  close,
}: {
  ws: Workspace
  /** The collection renders pages */
  hasPage: boolean
  dialog: NonNullable<Dialog>
  close: () => void
}): ReactElement | null {
  const { document, actions, facts } = ws
  if (!document || !facts.saved) return null
  const busy = actions.busy === 'publish'
  const run = (change: 'publish' | StatusChange): void => {
    void actions.changePublication(change).then(close)
  }
  const { collection, slug, locale } = document.meta
  if (dialog.kind === 'status') {
    const { change } = dialog
    const confirm = (): void => run(change)
    const status = { change, name: slug, busy }
    return <StatusChangeModal {...status} onConfirm={confirm} onClose={close} />
  }
  return (
    <PublishModal
      collection={collection}
      slug={slug}
      locale={locale}
      saved={facts.saved}
      hasPage={hasPage}
      busy={busy}
      onConfirm={() => run('publish')}
      onClose={close}
    />
  )
}

/** The open dialog: leaving with unsaved changes comes first */
export function Dialogs({
  ws,
  hasPage,
  dialog,
  close,
}: {
  ws: Workspace
  /** The collection renders pages */
  hasPage: boolean
  dialog: Dialog
  close: () => void
}): ReactElement | null {
  const { blocker } = ws.guard
  if (blocker.state === 'blocked') {
    return (
      <LeaveModal
        message={leaveMessage(ws.document?.meta.slug ?? 'the new document', ws.autosave.keeping)}
        onStay={() => blocker.reset()}
        onLeave={() => blocker.proceed()}
      />
    )
  }
  return dialog ? (
    <PublicationDialog ws={ws} hasPage={hasPage} dialog={dialog} close={close} />
  ) : null
}
