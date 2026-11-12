import {
  Check,
  CircleAlert,
  CircleDashed,
  CircleX,
  CornerDownRight,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { STATUS_LABELS } from '../lib/document-status.js'
import type { MetaCoverage } from '../lib/findability.js'
import { formatShortDateTime } from '../lib/format.js'
import { editorPath, LAYOUT_COLLECTION } from '../lib/paths.js'
import { StatusDot } from '../ui/status-dot.js'
import { type GraphState, pageUrl, type SiteRow } from './site-model.js'

/** What a row's cells need beyond the row: where the site lives, and its default locale */
export interface CellContext {
  baseUrl: string
  defaultLocale: string
}

/** The editor of a row's document — in its own locale when that is not the default */
export function rowEditorPath(row: SiteRow, defaultLocale: string): string {
  return editorPath(row.collection, row.slug, row.locale === defaultLocale ? undefined : row.locale)
}

/** The page's path: a link to the live page (new tab), or plain text while nothing is live */
function PageAddress({ row, baseUrl }: { row: SiteRow; baseUrl: string }): ReactElement | null {
  if (row.path === null) return null
  if (row.liveVersion === null) {
    return (
      <span className="site-url" title="Not published yet">
        {row.path}
      </span>
    )
  }
  return (
    <a
      className="site-url site-url--link"
      href={pageUrl(baseUrl, row.path)}
      target="_blank"
      rel="noreferrer"
      aria-label={`${row.path} on the site (opens in a new tab)`}
    >
      {row.path}
      <ExternalLink className="site-url-icon" aria-hidden="true" />
    </a>
  )
}

/** The overview's Page cell: the status dot, the title opening the editor, and the URL */
export function PageCell({ row, context }: { row: SiteRow; context: CellContext }): ReactElement {
  return (
    <div className="site-page">
      <StatusDot status={row.status} decorative />
      <div className="site-page-text">
        <Link to={rowEditorPath(row, context.defaultLocale)} className="site-title">
          {row.title}
        </Link>
        {row.path === null ? (
          <span className="site-url">no URL, shared</span>
        ) : (
          <PageAddress row={row} baseUrl={context.baseUrl} />
        )}
      </div>
    </div>
  )
}

/** The collection view's Slug cell: the slug opening the editor, and the URL */
export function SlugCell({ row, context }: { row: SiteRow; context: CellContext }): ReactElement {
  return (
    <div className="site-page-text">
      <Link to={rowEditorPath(row, context.defaultLocale)} className="site-slug">
        {row.slug}
      </Link>
      <span className="site-links">
        <PageAddress row={row} baseUrl={context.baseUrl} />
      </span>
    </div>
  )
}

export function StatusCell({ row }: { row: SiteRow }): ReactElement {
  return (
    <span className={`site-status site-status--${row.status}`}>
      <StatusDot status={row.status} decorative />
      {STATUS_LABELS[row.status]}
    </span>
  )
}

export function LiveCell({ row }: { row: SiteRow }): ReactElement {
  if (row.liveVersion === null) {
    return (
      <span className="site-muted">
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">Not published</span>
      </span>
    )
  }
  return <span>v{row.liveVersion}</span>
}

export function UpdatedCell({ row }: { row: SiteRow }): ReactElement {
  return (
    <time dateTime={row.updatedAt} title={new Date(row.updatedAt).toLocaleString()}>
      {formatShortDateTime(row.updatedAt)}
    </time>
  )
}

type Tone = 'good' | 'warn' | 'bad' | 'muted'

interface Line {
  icon: LucideIcon
  tone: Tone
  text: string
}

const META_LINES: Readonly<Record<MetaCoverage, Line>> = {
  covered: { icon: Check, tone: 'good', text: 'Own meta description' },
  fallback: { icon: CornerDownRight, tone: 'muted', text: 'Falls back to description' },
  missing: { icon: CircleAlert, tone: 'warn', text: 'No meta description' },
}

function graphLine(graph: GraphState, defaultLocale: string): Line | null {
  switch (graph) {
    case 'valid':
      return { icon: Check, tone: 'good', text: 'Structured data valid' }
    case 'errors':
      return { icon: CircleX, tone: 'bad', text: 'Structured data has errors' }
    case 'not-live':
      return { icon: CircleDashed, tone: 'muted', text: 'Structured data checked once live' }
    case 'default-locale-only':
      return {
        icon: CircleDashed,
        tone: 'muted',
        text: `Structured data checked in ${defaultLocale}`,
      }
    case 'failed':
      return { icon: CircleDashed, tone: 'muted', text: 'Structured data unavailable' }
    case 'off':
      return null
  }
}

function FindabilityLine({ line }: { line: Line }): ReactElement {
  const Icon = line.icon
  return (
    <span className={`site-finding site-finding--${line.tone}`}>
      <Icon className="site-finding-icon" aria-hidden="true" />
      {line.text}
    </span>
  )
}

/**
 * The meta description's state, and the live page's structured data when `seo`
 * is on; a global reads as shared by every page
 */
export function FindabilityCell({
  row,
  context,
}: {
  row: SiteRow
  context: CellContext
}): ReactElement {
  if (row.meta === null) {
    // A global has no page of its own: it is part of the frame every page renders
    const shared = row.collection === LAYOUT_COLLECTION
    return <span className="site-muted">{shared ? 'Read by every page' : 'No page'}</span>
  }
  const graph = row.graph === null ? null : graphLine(row.graph, context.defaultLocale)
  return (
    <span className="site-findability">
      <FindabilityLine line={META_LINES[row.meta]} />
      {graph && <FindabilityLine line={graph} />}
    </span>
  )
}

/** The locales the document has a version in, and those it is missing */
export function LocalesCell({ row }: { row: SiteRow }): ReactElement {
  const { locales } = row
  if (locales.state === 'failed') return <span className="site-muted">Unavailable</span>
  if (locales.state === 'off') {
    return (
      <span className="site-muted">
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">Locale versions not tracked</span>
      </span>
    )
  }
  return (
    <span className="site-locales">
      {locales.present.map((locale) => (
        <code key={locale} className="site-locale">
          {locale}
        </code>
      ))}
      {locales.missing.map((locale) => (
        <code
          key={locale}
          className="site-locale site-locale--missing"
          title={`No ${locale} version`}
        >
          {locale}
          <span className="visually-hidden"> missing</span>
        </code>
      ))}
    </span>
  )
}
