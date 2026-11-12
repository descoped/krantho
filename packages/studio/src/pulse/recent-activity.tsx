import { CircleCheck, History, type LucideIcon, PenLine, Plus } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { collectionLabel } from '../lib/format.js'
import { editorPath, LAYOUT_COLLECTION } from '../lib/paths.js'
import { Chip, type ChipTone } from '../ui/chip.js'
import { EmptyState } from '../ui/empty-state.js'
import {
  type ActivityEntry,
  type ActivityEvent,
  EVENT_LABELS,
  relativeTime,
} from './pulse-activity.js'
import './recent-activity.css'

const EVENT_CHIPS: Readonly<Record<ActivityEvent, { tone: ChipTone; icon: LucideIcon }>> = {
  created: { tone: 'neutral', icon: Plus },
  saved: { tone: 'neutral', icon: PenLine },
  published: { tone: 'accent', icon: CircleCheck },
}

function ActivityRow({
  entry,
  defaultLocale,
  now,
}: {
  entry: ActivityEntry
  defaultLocale: string
  now: number
}): ReactElement {
  const { document: doc, event } = entry
  const otherLocale = doc.locale === defaultLocale ? undefined : doc.locale
  const chip = EVENT_CHIPS[event]
  return (
    <li className="activity-row">
      <Link to={editorPath(doc.collection, doc.slug, otherLocale)} className="activity-slug">
        {doc.slug}
      </Link>
      <span className="activity-collection">
        {doc.collection === LAYOUT_COLLECTION ? 'Layout' : collectionLabel(doc.collection)}
        {otherLocale && <code className="activity-locale">{otherLocale}</code>}
      </span>
      <span className="activity-event">
        <Chip tone={chip.tone} icon={chip.icon}>
          {EVENT_LABELS[event]}
        </Chip>
      </span>
      <time
        className="activity-time"
        dateTime={doc.updatedAt}
        title={new Date(doc.updatedAt).toLocaleString()}
      >
        {relativeTime(doc.updatedAt, now)}
      </time>
    </li>
  )
}

export interface RecentActivityProps {
  entries: readonly ActivityEntry[]
  defaultLocale: string
  /** The time "5 minutes ago" is counted from */
  now: number
}

/** The latest saves, publishes and new documents, newest first */
export function RecentActivity({ entries, defaultLocale, now }: RecentActivityProps): ReactElement {
  return (
    <section className="pulse-panel" aria-labelledby="pulse-activity-title">
      <div className="pulse-panel-head">
        <h2 id="pulse-activity-title">Recent activity</h2>
      </div>
      {entries.length === 0 ? (
        <EmptyState icon={History} title="No activity yet">
          New documents, saved drafts and publishes show up here.
        </EmptyState>
      ) : (
        <ol className="activity-list">
          {entries.map((entry) => (
            <ActivityRow
              key={`${entry.document.collection}/${entry.document.slug}/${entry.document.locale}`}
              entry={entry}
              defaultLocale={defaultLocale}
              now={now}
            />
          ))}
        </ol>
      )}
    </section>
  )
}
