import type { ContentDocument, ContentSummary, DocumentMeta, IPersistenceAdapter } from './index.js'

/** What a query returns of each document */
export type QueryProjection = 'meta' | 'summary' | 'full'

/** Where a text match looks */
export type MatchTarget = 'slug' | 'fields' | 'body'

interface QueryBase<P extends QueryProjection> {
  /** The collections to read; every collection when omitted */
  collections?: readonly string[] | undefined
  /** One locale; every locale when omitted */
  locale?: string | undefined
  projection: P
  /** Case-insensitive substring match; a document matches when any target contains the text */
  match?: { text: string; in: readonly MatchTarget[] } | undefined
  /** `field` or `field:asc|desc`, the sort whitelist of sort-columns.ts */
  sort?: string | undefined
  /** At most this many items; every match when omitted */
  limit?: number | undefined
  offset?: number | undefined
}

/** The current version of each document (drafts included) */
export interface CurrentQuery<P extends QueryProjection = QueryProjection> extends QueryBase<P> {
  state: 'current'
  status?: 'draft' | 'published' | 'archived' | undefined
}

/** The live version of each document that has one */
export interface PublishedQuery<P extends QueryProjection = QueryProjection> extends QueryBase<P> {
  state: 'published'
}

export type ContentQuery<P extends QueryProjection = QueryProjection> =
  | CurrentQuery<P>
  | PublishedQuery<P>

export type QueryItem<P extends QueryProjection> = P extends 'meta'
  ? DocumentMeta
  : P extends 'summary'
    ? ContentSummary
    : ContentDocument

/** One page of a query */
export interface QueryPage<P extends QueryProjection> {
  /** Each item; `snippet` is set when the query matched `body` or `fields` */
  items: Array<QueryItem<P> & { snippet?: string | undefined }>
  /** Whether another page follows (read as LIMIT n + 1, never a count) */
  hasMore: boolean
}

/** Adapter that can answer a content query. */
export type QueryReader = IPersistenceAdapter & Required<Pick<IPersistenceAdapter, 'query'>>

/** Check if adapter can answer a content query. */
export function canQuery(adapter: IPersistenceAdapter): adapter is QueryReader {
  return !!adapter.query
}
