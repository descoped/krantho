import type { ReactElement } from 'react'
import type { DocumentMeta } from '../lib/api-types.js'
import { documentStatus, STATUS_LABELS } from '../lib/document-status.js'
import { formatTimestamp } from '../lib/format.js'
import { lockHolderName } from '../lib/locks.js'
import { relativeTime } from '../pulse/pulse-activity.js'

/** What krantho itself keeps for the version: read only, never an input */
export function SystemFields(props: { meta: DocumentMeta }): ReactElement {
  const { meta } = props
  const saved = meta.changedBy
    ? `saved by ${lockHolderName(meta.changedBy)}, ${relativeTime(meta.createdAt)}`
    : `saved ${relativeTime(meta.createdAt)}`
  return (
    <p className="metadata-system" title={formatTimestamp(meta.createdAt)}>
      <span className="visually-hidden">System: </span>
      {[
        STATUS_LABELS[documentStatus(meta)],
        `v${meta.version}`,
        meta.locale.toUpperCase(),
        saved,
      ].join(' · ')}
    </p>
  )
}
