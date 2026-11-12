import {
  CheckCircle,
  Clock,
  Copy,
  Info,
  Lightbulb,
  type LucideIcon,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { AssistantActivity, SeoFinding } from '../../lib/api-assistant.js'
import type { PendingEntry } from '../../lib/assistant-chat-state.js'
import { editorPath } from '../../lib/paths.js'
import { DocumentChangeView } from './DocumentChangeView.js'
import { PendingActionCard } from './PendingActionCard.js'

const STATUS_ICONS: Record<AssistantActivity['status'], { icon: LucideIcon; label: string }> = {
  done: { icon: CheckCircle, label: 'Done' },
  failed: { icon: XCircle, label: 'Failed' },
  pending: { icon: Clock, label: 'Waiting for confirmation' },
  proposed: { icon: Lightbulb, label: 'Proposed' },
}

const SEVERITY_ICONS: Record<SeoFinding['severity'], { icon: LucideIcon; label: string }> = {
  error: { icon: XCircle, label: 'Error' },
  warning: { icon: TriangleAlert, label: 'Warning' },
  info: { icon: Info, label: 'Info' },
}

function Findings({ findings }: { findings: readonly SeoFinding[] }): React.ReactElement {
  return (
    <ul className="assistant-findings">
      {findings.map((finding, index) => {
        const { icon: Icon, label } = SEVERITY_ICONS[finding.severity]
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, never reordered
            key={`${finding.check}-${finding.property ?? ''}-${index}`}
            className={`assistant-finding assistant-finding-${finding.severity}`}
          >
            <Icon role="img" aria-label={label} />
            <span>{finding.message}</span>
          </li>
        )
      })}
    </ul>
  )
}

function CopyBlock({ label, text }: { label: string; text: string }): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }
  return (
    <div className="assistant-proposal-item">
      <div className="assistant-proposal-head">
        <span className="assistant-proposal-label">{label}</span>
        <button type="button" className="assistant-icon-btn" onClick={copy}>
          <Copy aria-hidden="true" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="assistant-proposal-text">{text}</pre>
    </div>
  )
}

interface AssistantActivityEntryProps {
  activity: AssistantActivity
  pending: PendingEntry | undefined
  onConfirm: (token: string) => void
  onCancel: (token: string) => void
}

/** What one tool call did: its summary, the documents it touched, and what to review */
export function AssistantActivityEntry({
  activity,
  pending,
  onConfirm,
  onCancel,
}: AssistantActivityEntryProps): React.ReactElement {
  const { icon: Icon, label } = STATUS_ICONS[activity.status]
  const changes = activity.changes ?? []
  return (
    <li className={`assistant-activity assistant-activity-${activity.status}`}>
      <p className="assistant-activity-summary">
        <Icon role="img" aria-label={label} />
        <span>{activity.summary}</span>
      </p>
      {activity.documents.length > 0 && (
        <ul className="assistant-activity-docs">
          {activity.documents.map((doc) => (
            <li key={`${doc.collection}/${doc.slug}@${doc.locale}`}>
              <Link to={editorPath(doc.collection, doc.slug, doc.locale)}>
                {doc.collection}/{doc.slug}
              </Link>
              {doc.version !== undefined && (
                <span className="assistant-muted"> v{doc.version}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending ? (
        <PendingActionCard
          entry={pending}
          changes={changes}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : (
        changes.length > 0 && (
          <details className="assistant-details">
            <summary>Show changes</summary>
            {changes.map((change) => (
              <DocumentChangeView
                key={`${change.ref.collection}/${change.ref.slug}@${change.ref.locale}`}
                change={change}
              />
            ))}
          </details>
        )
      )}
      {activity.findings && activity.findings.length > 0 && (
        <Findings findings={activity.findings} />
      )}
      {activity.proposal && (
        <div className="assistant-proposal">
          <p className="assistant-proposal-title">{activity.proposal.title}</p>
          {activity.proposal.items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, never reordered
            <CopyBlock key={`${item.label}-${index}`} label={item.label} text={item.text} />
          ))}
        </div>
      )}
    </li>
  )
}
