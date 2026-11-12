import type { ReactElement } from 'react'
import type { DocumentStatus } from '../lib/document-status.js'
import { StatusDot } from '../ui/status-dot.js'
import type { StatusCounts } from './site-model.js'

/** The words the site tree's legend uses for each status */
const COUNT_WORDS: Readonly<Record<DocumentStatus, string>> = {
  live: 'live',
  ahead: 'draft ahead',
  draft: 'draft',
}

const ORDER: readonly DocumentStatus[] = ['live', 'ahead', 'draft']

/** A collection's live/draft summary: each status with its count, a status with none left out */
export function StatusSummary({ counts }: { counts: StatusCounts }): ReactElement {
  const shown = ORDER.filter((status) => counts[status] > 0)
  return (
    <p className="site-summary">
      {shown.length === 0 && <span>No documents</span>}
      {shown.map((status) => (
        <span key={status} className="site-summary-item">
          <StatusDot status={status} decorative />
          <span className="site-summary-number">{counts[status]}</span> {COUNT_WORDS[status]}
        </span>
      ))}
    </p>
  )
}
