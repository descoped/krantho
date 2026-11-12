import { type AuthoredMetadata, authoredMetadata } from './content-contract.js'
import type {
  ContentDocument,
  ContentSource,
  ContentStatus,
  ContentSummary,
  DocumentMeta,
} from './index.js'
import { statusOf } from './live-version.js'

const VALID_STATUSES: ReadonlySet<string> = new Set<ContentStatus>([
  'draft',
  'published',
  'archived',
  'deleted',
])
const VALID_SOURCES: ReadonlySet<string> = new Set<ContentSource>(['filesystem', 'api', 'import'])

/**
 * Canonical shape of a content row's meta — what a list that reads no fields, body, HTML or
 * sections returns — as understood by the shared mapper.
 *
 * Each adapter is responsible for normalizing its raw storage row into this shape
 * (or one that extends it) before passing it to `contentDocumentFromRow`,
 * `contentSummaryFromRow` or `documentMetaFromRow`. This
 * keeps the shared mapping logic in one place (this file) while letting each
 * adapter own its raw-row-to-normalized translation (JSON parsing for SQLite,
 * Date-to-ISO for Postgres, null-coalescing for html/sections, etc.).
 */
export interface NormalizedMetaRow {
  readonly collection: string
  readonly slug: string
  readonly locale: string
  readonly version: number
  /** The document's live version as of this row; null when nothing is live */
  readonly liveVersion: number | null
  readonly status: string
  readonly source: string
  readonly changedBy: string | null
  /** ISO 8601 timestamp — every adapter must normalize to this format */
  readonly createdAt: string
}

/** A content row with its fields, read without its body, rendered HTML and sections */
export interface NormalizedSummaryRow extends NormalizedMetaRow {
  readonly fields: Record<string, unknown>
  /** The authored metadata groups; a summary leaves out the contract and provenance */
  readonly metadata: AuthoredMetadata['metadata']
}

/** A content row with its body, rendered HTML and sections */
export interface NormalizedContentRow extends NormalizedSummaryRow {
  readonly authored: AuthoredMetadata
  readonly body: string
  readonly html: string
  readonly sections: Record<string, string>
}

/**
 * Produce a full `ContentDocument` from a normalized row.
 *
 * Called by every persistence adapter after its own `normalizeRow` step.
 * Having this in the shared package means a change to the `ContentDocument`
 * shape only needs to be propagated here, not in every adapter.
 */
export function contentDocumentFromRow(row: NormalizedContentRow): ContentDocument {
  const meta = documentMetaFromRow(row)
  return {
    meta,
    fields: row.fields,
    ...authoredMetadata(row.authored),
    body: row.body,
    html: row.html,
    sections: row.sections,
  }
}

/**
 * Produce a `ContentSummary` from a row read without its content: the meta and
 * the fields, never the body, the rendered HTML or the sections.
 */
export function contentSummaryFromRow(row: NormalizedSummaryRow): ContentSummary {
  const meta = documentMetaFromRow(row)
  return { meta, fields: row.fields, metadata: row.metadata }
}

/**
 * Produce a `DocumentMeta` (no body, no fields, no html, no sections) from a
 * normalized row. Used when listing version history where the caller only
 * needs metadata.
 */
export function documentMetaFromRow(row: NormalizedMetaRow): DocumentMeta {
  return {
    collection: row.collection,
    slug: row.slug,
    locale: row.locale,
    version: row.version,
    liveVersion: row.liveVersion,
    status: VALID_STATUSES.has(row.status)
      ? statusOf(row.status, row.liveVersion)
      : (console.warn(
          `[persistence] Unknown status "${row.status}" for ${row.collection}/${row.slug}, defaulting to "draft"`,
        ),
        statusOf('draft', row.liveVersion)),
    source: VALID_SOURCES.has(row.source)
      ? (row.source as ContentSource)
      : (console.warn(
          `[persistence] Unknown source "${row.source}" for ${row.collection}/${row.slug}, defaulting to "filesystem"`,
        ),
        'filesystem' as ContentSource),
    changedBy: row.changedBy,
    createdAt: row.createdAt,
  }
}
