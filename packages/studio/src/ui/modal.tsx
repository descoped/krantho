import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useId,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../hooks/use-focus-trap.js'
import './modal.css'

export interface ModalProps {
  title: string
  children: ReactNode
  /** The buttons, cancel first */
  actions: ReactNode
  onClose: () => void
  /** What to focus first — the safe choice of a confirmation */
  initialFocus?: RefObject<HTMLElement | null> | undefined
  /** Work is under way: announced as busy; the caller keeps focus inside */
  busy?: boolean | undefined
}

/**
 * A modal dialog over a scrim: focus stays inside while it is open and returns
 * where it was when it closes; Esc and the scrim close it.
 */
export function Modal({
  title,
  children,
  actions,
  onClose,
  initialFocus,
  busy = false,
}: ModalProps): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(dialogRef, true, initialFocus)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onClose()
  }

  return createPortal(
    <div className="ui-modal-layer">
      <div className="ui-modal-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        className="ui-modal"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="ui-modal-title">
          {title}
        </h2>
        <div className="ui-modal-body">{children}</div>
        <div className="ui-modal-actions">{actions}</div>
      </div>
    </div>,
    document.body,
  )
}
