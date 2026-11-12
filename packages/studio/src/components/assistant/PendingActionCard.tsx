import { CheckCircle, Clock, XCircle } from 'lucide-react'
import type { DocumentChange } from '../../lib/api-assistant.js'
import type { PendingEntry } from '../../lib/assistant-chat-state.js'
import { buttonClass } from '../../ui/button.js'
import { DocumentChangeView } from './DocumentChangeView.js'

interface PendingActionCardProps {
  entry: PendingEntry
  changes: readonly DocumentChange[]
  onConfirm: (token: string) => void
  onCancel: (token: string) => void
}

function expiryTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function Outcome({ entry }: { entry: PendingEntry }): React.ReactElement | null {
  if (entry.phase === 'done') {
    return (
      <p className="assistant-pending-outcome assistant-outcome-done">
        <CheckCircle aria-hidden="true" /> {entry.result}
      </p>
    )
  }
  if (entry.phase === 'failed') {
    return (
      <p className="assistant-pending-outcome assistant-outcome-failed">
        <XCircle aria-hidden="true" /> {entry.result}
      </p>
    )
  }
  if (entry.phase === 'cancelled') {
    return <p className="assistant-pending-outcome assistant-muted">Cancelled</p>
  }
  return null
}

/**
 * A proposal that waits for the user: what confirming does, the change, and
 * Confirm / Cancel. The server's result replaces the buttons.
 */
export function PendingActionCard({
  entry,
  changes,
  onConfirm,
  onCancel,
}: PendingActionCardProps): React.ReactElement {
  const { view, phase } = entry
  const awaiting = phase === 'open' || phase === 'confirming'
  const confirming = phase === 'confirming'
  const confirmClass = buttonClass(view.destructive ? 'danger' : 'primary', 'sm')

  return (
    <div className="assistant-pending">
      <p className="assistant-pending-label">
        <Clock aria-hidden="true" />
        {awaiting ? 'Needs your confirmation' : 'Proposal'}
      </p>
      <p className="assistant-pending-title">{view.title}</p>
      {changes.length > 0 && (
        <details className="assistant-details" open>
          <summary>Changes</summary>
          {changes.map((change) => (
            <DocumentChangeView
              key={`${change.ref.collection}/${change.ref.slug}@${change.ref.locale}`}
              change={change}
            />
          ))}
        </details>
      )}
      {awaiting ? (
        <>
          <p className="assistant-muted">Expires at {expiryTime(view.expiresAt)}</p>
          <div className="assistant-pending-actions">
            <button
              type="button"
              className={confirmClass}
              disabled={confirming}
              onClick={() => onConfirm(view.token)}
            >
              {confirming ? 'Confirming…' : view.confirmLabel}
            </button>
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              disabled={confirming}
              onClick={() => onCancel(view.token)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <Outcome entry={entry} />
      )}
    </div>
  )
}
