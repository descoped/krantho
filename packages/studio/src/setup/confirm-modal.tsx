import { type ReactElement, type ReactNode, useRef } from 'react'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { useBusyAction } from './use-busy-action.js'

export interface ConfirmModalProps {
  title: string
  /** What the action does, said plainly before it runs */
  children: ReactNode
  confirmLabel: string
  /** A danger confirmation colours its action so */
  danger?: boolean | undefined
  /** Runs the action; a refusal stays in the dialog, in the API's words */
  onConfirm: () => Promise<void>
  onClose: () => void
}

/**
 * A confirmation: Cancel takes focus first, the action says what it does, and
 * while it runs the dialog is busy and keeps focus; a refusal is shown in it
 */
export function ConfirmModal({
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps): ReactElement {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const { busy, error, run } = useBusyAction()
  const close = busy ? () => undefined : onClose
  const actions = (
    <>
      <Button ref={cancelRef} onClick={close} aria-disabled={busy}>
        Cancel
      </Button>
      <Button
        variant={danger ? 'danger' : 'primary'}
        aria-disabled={busy}
        onClick={() => void run(onConfirm, 'It did not work')}
      >
        {busy ? 'Working…' : confirmLabel}
      </Button>
    </>
  )
  return (
    <Modal title={title} onClose={close} actions={actions} initialFocus={cancelRef} busy={busy}>
      <div className="setup-confirm">{children}</div>
      {error && <ErrorLine text={error} />}
    </Modal>
  )
}

/** A refusal or a failed check, announced where the action was asked for */
export function ErrorLine({ text }: { text: string }): ReactElement {
  return (
    <p role="alert" className="setup-note setup-note--error">
      {text}
    </p>
  )
}
