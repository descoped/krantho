import { useRef } from 'react'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string | undefined
  cancelLabel?: string | undefined
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.ReactElement {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const actions = (
    <>
      <Button ref={cancelRef} onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button variant="danger" onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </>
  )
  return (
    <Modal title={title} onClose={onCancel} actions={actions} initialFocus={cancelRef}>
      <p>{message}</p>
    </Modal>
  )
}
