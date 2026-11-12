import type {
  AuthoredMetadata,
  ContentDocument,
  ContentSummary,
  DocumentMeta,
  NormalizedContentRow,
  NormalizedMetaRow,
  NormalizedSummaryRow,
} from '@krantho/persistence'
import {
  contentDocumentFromRow,
  contentSummaryFromRow,
  documentMetaFromRow,
} from '@krantho/persistence'

/** Row shape from the append-only content table */
export interface ContentRow {
  id: string
  collection: string
  slug: string
  locale: string
  version: number
  is_current: boolean
  status: string
  authored: AuthoredMetadata
  fields: Record<string, unknown>
  body: string
  html: string
  sections: Record<string, string>
  source: string
  file_path: string | null
  changed_by: string | null
  deleted_at: Date | null
  created_at: Date
  /** The document's live version as of this row; NULL when nothing is live */
  live_version: number | null
}

/** A content row read without its body, rendered HTML and sections */
export type SummaryRow = Omit<ContentRow, 'body' | 'html' | 'sections' | 'authored'> & {
  /** `authored.metadata` alone: the contract and provenance stay in the row */
  metadata: AuthoredMetadata['metadata'] | null
}

/** A content row read with neither its fields nor its body, rendered HTML and sections */
export type MetaRow = Omit<SummaryRow, 'fields' | 'metadata'>

/** The columns of a content row that make up a document's meta */
export const META_COLUMNS =
  'id, collection, slug, locale, version, is_current, status, source, file_path, changed_by, deleted_at, created_at, live_version'

/** The columns of a content row that name a document: everything but its body, HTML and sections */
export const SUMMARY_COLUMNS =
  "id, collection, slug, locale, version, is_current, status, fields, authored->'metadata' AS metadata, source, file_path, changed_by, deleted_at, created_at, live_version"

/** Valid scalar types accepted by `sql.unsafe()` positional parameters. */
export type SqlParam = string | number | boolean | null

/**
 * Normalize a raw Postgres row into the canonical shape shared by every adapter.
 *
 * This is the only place in the Postgres adapter that coerces `Date` to ISO
 * strings or falls back null `html` / `sections` columns. All downstream
 * conversions go through the shared helpers in `@krantho/persistence`.
 */
function normalizeMetaRow(row: MetaRow): NormalizedMetaRow {
  return {
    collection: row.collection,
    slug: row.slug,
    locale: row.locale,
    version: row.version,
    liveVersion: row.live_version,
    status: row.status,
    source: row.source,
    changedBy: row.changed_by,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

function normalizeSummaryRow(row: SummaryRow): NormalizedSummaryRow {
  return { ...normalizeMetaRow(row), fields: row.fields, metadata: row.metadata ?? {} }
}

function normalizeRow(row: ContentRow): NormalizedContentRow {
  return {
    ...normalizeMetaRow(row),
    fields: row.fields,
    metadata: row.authored.metadata,
    authored: row.authored,
    body: row.body,
    html: row.html ?? '',
    sections: row.sections ?? {},
  }
}

export function rowToContentDocument(row: ContentRow): ContentDocument {
  return contentDocumentFromRow(normalizeRow(row))
}

export function rowToSummary(row: SummaryRow): ContentSummary {
  return contentSummaryFromRow(normalizeSummaryRow(row))
}

export function rowToDocumentMeta(row: MetaRow): DocumentMeta {
  return documentMetaFromRow(normalizeMetaRow(row))
}
