import type {
  ContentDocument,
  ContentQuery,
  DirectSortColumn,
  DocumentMeta,
  MatchTarget,
  QueryItem,
  QueryPage,
  QueryProjection,
} from '@krantho/persistence'
import { isDirectSortColumn, isSafeSortField } from '@krantho/persistence'

/** Characters of a snippet before the match, and from the match on */
const SNIPPET_BEFORE = 80
const SNIPPET_LENGTH = 200

/** A document read for a query: `full` needs the rendered HTML and sections, the rest do not */
export type QueriedDocument = Omit<ContentDocument, 'html' | 'sections'> &
  Partial<Pick<ContentDocument, 'html' | 'sections'>>

/** Where a query reads the files of the adapter's collections */
export interface QuerySource {
  /** The collections the adapter was given a directory for */
  collections(): string[]
  /** The slugs of a collection's files */
  slugs(collection: string): Promise<string[]>
  /** One file as a document; rendered (HTML and sections) only when `render` is set */
  read(collection: string, slug: string, render: boolean): Promise<QueriedDocument>
}

/** The text of a document each match target searches */
function targetText(doc: QueriedDocument, target: MatchTarget): string {
  if (target === 'slug') return doc.meta.slug
  if (target === 'fields') return JSON.stringify(doc.fields)
  return doc.body
}

/**
 * The snippet of the first match: from the body when it matches there, else from the
 * fields' JSON. Positions count characters (code points), as `substr` does in SQL, and
 * the position found in the folded text applies to the original.
 */
function snippetOf(
  doc: QueriedDocument,
  targets: readonly MatchTarget[],
  needle: string,
): string | undefined {
  for (const target of ['body', 'fields'] as const) {
    if (!targets.includes(target)) continue
    const text = targetText(doc, target)
    const index = text.toLowerCase().indexOf(needle)
    if (index < 0) continue
    const before = Array.from(text.slice(0, index)).length
    const start = Math.max(0, before - SNIPPET_BEFORE)
    return Array.from(text)
      .slice(start, start + SNIPPET_LENGTH)
      .join('')
      .replace(/\s+/g, ' ')
  }
  return undefined
}

/** Whether any target contains the folded needle */
function matches(doc: QueriedDocument, targets: readonly MatchTarget[], needle: string): boolean {
  return targets.some((target) => targetText(doc, target).toLowerCase().includes(needle))
}

/** The value a sort field orders a document by; a document without it sorts first */
function sortValue(doc: QueriedDocument, field: string): string | number | null {
  const direct: Record<DirectSortColumn, string> = {
    slug: doc.meta.slug,
    status: doc.meta.status,
    locale: doc.meta.locale,
    created_at: doc.meta.createdAt,
  }
  if (isDirectSortColumn(field)) return direct[field]
  const value = isSafeSortField(field) ? doc.fields[field] : undefined
  if (typeof value === 'number' || typeof value === 'string') return value
  return value === undefined || value === null ? null : String(value)
}

/** Order two values as SQL does: nulls first, numbers numerically, text by code unit */
function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const left = String(a)
  const right = String(b)
  return left < right ? -1 : left > right ? 1 : 0
}

/** Order two documents: the requested sort, then `collection, slug, locale` so paging is stable */
function compareDocuments(sort: string | undefined) {
  const [field, direction] = sort ? sort.split(':') : []
  const sign = direction === 'desc' ? -1 : 1
  return (a: QueriedDocument, b: QueriedDocument): number => {
    const ordered = field ? sign * compareValues(sortValue(a, field), sortValue(b, field)) : 0
    return (
      ordered ||
      compareValues(a.meta.collection, b.meta.collection) ||
      compareValues(a.meta.slug, b.meta.slug) ||
      compareValues(a.meta.locale, b.meta.locale)
    )
  }
}

/** The documents of the query's collections that its state, status and locale admit */
async function candidates(source: QuerySource, spec: ContentQuery): Promise<QueriedDocument[]> {
  const render = spec.projection === 'full'
  const found: QueriedDocument[] = []
  for (const collection of spec.collections ?? source.collections()) {
    for (const slug of await source.slugs(collection)) {
      const doc = await source.read(collection, slug, render)
      if (spec.locale && doc.meta.locale !== spec.locale) continue
      // A file is one version and is live when published: `current` and `published` read the same file
      if (spec.state === 'published' && doc.meta.status !== 'published') continue
      if (spec.state === 'current' && spec.status && doc.meta.status !== spec.status) continue
      found.push(doc)
    }
  }
  return found
}

function projected(projection: QueryProjection, doc: QueriedDocument): unknown {
  if (projection === 'meta') return doc.meta satisfies DocumentMeta
  if (projection === 'summary')
    return { meta: doc.meta, fields: doc.fields, metadata: doc.metadata }
  return doc
}

/** Run a content query over the files of the adapter's collections */
export async function runContentQuery<P extends QueryProjection>(
  source: QuerySource,
  spec: ContentQuery<P>,
): Promise<QueryPage<P>> {
  const needle = spec.match?.text.toLowerCase() ?? ''
  const matched = (await candidates(source, spec)).filter(
    (doc) => !spec.match || matches(doc, spec.match.in, needle),
  )
  matched.sort(compareDocuments(spec.sort))

  const start = spec.offset ?? 0
  const end = spec.limit === undefined ? undefined : start + spec.limit
  const page = matched.slice(start, end)
  const hasMore = end !== undefined && matched.length > end
  const items = page.map((doc) => {
    const item = projected(spec.projection, doc) as QueryItem<P> & { snippet?: string | undefined }
    const snippet = spec.match ? snippetOf(doc, spec.match.in, needle) : undefined
    return snippet === undefined ? item : { ...item, snippet }
  })
  return { items, hasMore }
}
