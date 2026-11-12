import { CircleX, ExternalLink, Info, type LucideIcon, TriangleAlert } from 'lucide-react'
import type { ReactElement } from 'react'
import type { SeoFinding } from '../lib/api-assistant.js'
import './finding-item.css'

/** How each severity is shown and ordered: errors first */
export const SEVERITIES: Readonly<
  Record<SeoFinding['severity'], { icon: LucideIcon; label: string; order: number }>
> = {
  error: { icon: CircleX, label: 'Error', order: 0 },
  warning: { icon: TriangleAlert, label: 'Warning', order: 1 },
  info: { icon: Info, label: 'Note', order: 2 },
}

/**
 * One SEO finding: its severity icon, the message, the property it is about
 * and a link to the documentation it cites; `reader` names the search engine
 * whose rule raised it when the list does not group by one
 */
export function FindingItem({
  finding,
  reader,
}: {
  finding: SeoFinding
  reader?: string | undefined
}): ReactElement {
  const { icon: Icon, label } = SEVERITIES[finding.severity]
  return (
    <li className={`editor-finding editor-finding--${finding.severity}`}>
      <Icon className="editor-finding-icon" role="img" aria-label={label} />
      <span className="editor-finding-text">
        {reader && <span className="editor-finding-reader">{reader}: </span>}
        {finding.message}
        {finding.property && (
          <>
            {' '}
            <code>
              {finding.type ? `${finding.type}.` : ''}
              {finding.property}
            </code>
          </>
        )}
        {finding.source && (
          <a
            className="editor-finding-source"
            href={finding.source}
            target="_blank"
            rel="noreferrer"
          >
            Documentation
            <ExternalLink aria-hidden="true" />
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        )}
      </span>
    </li>
  )
}
