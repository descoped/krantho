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
import type { ContentRow, MetaRow, SummaryRow } from './queries.js'

/**
 * Safely parse a JSON column value.
 *
 * Throws with a clear error if the column holds malformed JSON or a non-object
 * value. Replaces the raw `JSON.parse(...) as Record<string, unknown>` pattern
 * that previously hid parse errors behind an unchecked cast.
 */
export function parseJsonRecord(json: string, column: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Expected object, got ${parsed === null ? 'null' : typeof parsed}`)
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON in ${column} column: ${cause}`)
  }
}

/**
 * Normalize a raw SQLite row into the canonical shape shared by every adapter.
 *
 * This is the only place in the SQLite adapter that parses JSON columns or
 * interprets status/source strings. All downstream conversions (to
 * ContentDocument, DocumentMeta) go through the shared helpers in
 * `@krantho/persistence`.
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
    createdAt: row.created_at,
  }
}

function normalizeSummaryRow(row: SummaryRow): NormalizedSummaryRow {
  return {
    ...normalizeMetaRow(row),
    fields: parseJsonRecord(row.fields, 'fields'),
    metadata: parseJsonRecord(row.metadata ?? '{}', 'metadata') as AuthoredMetadata['metadata'],
  }
}

function normalizeRow(row: ContentRow): NormalizedContentRow {
  const authored = JSON.parse(row.authored) as AuthoredMetadata
  return {
    ...normalizeMetaRow(row),
    fields: parseJsonRecord(row.fields, 'fields'),
    metadata: authored.metadata,
    authored,
    body: row.body,
    html: row.html,
    sections: parseJsonRecord(row.sections, 'sections') as Record<string, string>,
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
