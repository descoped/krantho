import type { ReactElement } from 'react'
import { type DocumentStatus, STATUS_LABELS } from '../lib/document-status.js'
import './status-dot.css'

export interface StatusDotProps {
  status: DocumentStatus
  /** Beside text that already says the status: hidden from assistive technology */
  decorative?: boolean | undefined
}

/** The status model's dot: filled for live, half-filled for a draft ahead, a ring for not published */
export function StatusDot({ status, decorative = false }: StatusDotProps): ReactElement {
  const className = `ui-status-dot ui-status-dot--${status}`
  if (decorative) return <span className={className} aria-hidden="true" />
  const label = STATUS_LABELS[status]
  return <span className={className} role="img" aria-label={label} title={label} />
}
