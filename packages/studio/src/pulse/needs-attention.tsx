import {
  CircleCheck,
  Languages,
  Lock,
  type LucideIcon,
  PenLine,
  TextSearch,
  TriangleAlert,
  Webhook,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { buttonClass } from '../ui/button.js'
import { EmptyState } from '../ui/empty-state.js'
import type {
  Attention,
  AttentionKind,
  AttentionOverflow,
  AttentionRow,
} from './pulse-attention.js'
import './needs-attention.css'

const KIND_ICONS: Readonly<Record<AttentionKind, LucideIcon>> = {
  delivery: Webhook,
  lock: Lock,
  ahead: PenLine,
  meta: TextSearch,
  locale: Languages,
}

/** What the rows left out past the cap are, counted */
const OVERFLOW_LABELS: Readonly<Record<AttentionKind, [string, string]>> = {
  delivery: ['failed delivery', 'failed deliveries'],
  lock: ['more locked document', 'more locked documents'],
  ahead: ['more document with unpublished changes', 'more documents with unpublished changes'],
  meta: ['more page without a meta description', 'more pages without a meta description'],
  locale: ['more collection missing a locale', 'more collections missing a locale'],
}

function AttentionItem({ row }: { row: AttentionRow }): ReactElement {
  const Icon = KIND_ICONS[row.kind]
  return (
    <li className={`attention-row attention-row--${row.kind}`}>
      <span className="attention-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="attention-text">
        <p className="attention-title">{row.title}</p>
        <p className="attention-detail">{row.detail}</p>
      </div>
      <Link
        to={row.to}
        className={buttonClass('secondary', 'sm', 'attention-action')}
        aria-label={`${row.action}: ${row.title}`}
      >
        {row.action}
      </Link>
    </li>
  )
}

function overflowText({ kind, count }: AttentionOverflow): string {
  const [one, many] = OVERFLOW_LABELS[kind]
  return `${count} ${count === 1 ? one : many}`
}

export interface NeedsAttentionProps {
  attention: Attention
  /** What the list watches, as a sentence's subject: "Unpublished changes, edit locks and …" */
  watched: string
  /** Sources that could not be read, named for people */
  unread: readonly string[]
}

/** The things an editor can act on, each with its action; a calm empty state when there are none */
export function NeedsAttention({ attention, watched, unread }: NeedsAttentionProps): ReactElement {
  const { rows, overflow } = attention
  return (
    <section className="pulse-panel" aria-labelledby="pulse-attention-title">
      <div className="pulse-panel-head">
        <h2 id="pulse-attention-title">Needs attention</h2>
        {rows.length > 0 && (
          <span className="pulse-count" aria-hidden="true">
            {rows.length + overflow.reduce((sum, o) => sum + o.count, 0)}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={CircleCheck} title="Nothing needs you right now">
          {watched} show up here.
        </EmptyState>
      ) : (
        <ul className="attention-list">
          {rows.map((row) => (
            <AttentionItem key={row.key} row={row} />
          ))}
        </ul>
      )}
      {overflow.length > 0 && (
        <p className="attention-more">And {overflow.map(overflowText).join(', ')}.</p>
      )}
      {unread.length > 0 && (
        <p className="pulse-unread">
          <TriangleAlert aria-hidden="true" />
          Could not check {unread.join(' or ')}.
        </p>
      )}
    </section>
  )
}
