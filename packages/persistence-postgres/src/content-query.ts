import type {
  ContentQuery,
  MatchTarget,
  QueryItem,
  QueryPage,
  QueryProjection,
} from '@krantho/persistence'
import { isDirectSortColumn, isSafeSortField, statusCondition } from '@krantho/persistence'
import type { Sql } from 'postgres'
import type { ContentRow, MetaRow, SqlParam, SummaryRow } from './row-mapping.js'
import {
  META_COLUMNS,
  rowToContentDocument,
  rowToDocumentMeta,
  rowToSummary,
  SUMMARY_COLUMNS,
} from './row-mapping.js'

/** Characters of a snippet before the match, and from the match on */
const SNIPPET_BEFORE = 80
const SNIPPET_LENGTH = 200

/** The column set a projection reads; `full` reads the whole row */
const PROJECTION_COLUMNS: Record<QueryProjection, string> = {
  meta: META_COLUMNS,
  summary: SUMMARY_COLUMNS,
  full: '*',
}

/** The SQL expression of the text each match target searches */
const MATCH_COLUMNS: Record<MatchTarget, string> = {
  slug: 'slug',
  fields: 'fields::text',
  body: 'body',
}

/** Escape LIKE wildcards (and the escape character) so the text matches literally */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Collects the parameters of one statement and hands out their `$n` placeholders */
class Parameters {
  readonly values: SqlParam[] = []

  bind(value: SqlParam): string {
    this.values.push(value)
    return `$${this.values.length}`
  }
}

/**
 * The sort keys of a field, ordered as SQLite orders `json_extract`: a missing value first,
 * then numbers numerically, then the rest as text. `fields->>` alone is text, which would
 * put `10` before `9`.
 */
function fieldSortKeys(field: string, dir: string): string {
  const value = `fields->'${field}'`
  const text = `fields->>'${field}'`
  const isNumber = `jsonb_typeof(${value}) = 'number'`
  return [
    `${text} IS NOT NULL ${dir}`,
    `NOT ${isNumber} ${dir}`,
    `CASE WHEN ${isNumber} THEN (${text})::numeric END ${dir}`,
    `${text} ${dir}`,
  ].join(', ')
}

/**
 * The ORDER BY of a query: the requested sort, then `collection, slug, locale` so paging is stable.
 *
 * Exported for unit testing — consumers of this package should not call it.
 */
export function orderByClause(sort: string | undefined): string {
  const [field, direction] = sort ? sort.split(':') : []
  const tieBreak = 'collection, slug, locale'
  if (!field) return ` ORDER BY ${tieBreak}`
  const dir = direction === 'desc' ? 'DESC' : 'ASC'
  if (isDirectSortColumn(field)) return ` ORDER BY ${field} ${dir}, ${tieBreak}`
  if (isSafeSortField(field)) return ` ORDER BY ${fieldSortKeys(field, dir)}, ${tieBreak}`
  return ` ORDER BY ${tieBreak}`
}

/** The condition that a document matches the text in any of the targets */
function matchCondition(targets: readonly MatchTarget[], pattern: string): string {
  const likes = targets.map(
    (target) => `lower(${MATCH_COLUMNS[target]}) LIKE ${pattern} ESCAPE '\\'`,
  )
  return `(${likes.join(' OR ')})`
}

/**
 * The substring of the first match: from the body when it matches there, else from
 * the fields' JSON. `strpos` and `substr` count characters, so the position found in
 * the folded text applies to the original.
 */
function snippetColumn(targets: readonly MatchTarget[], needle: string): string {
  const cases = (['body', 'fields'] as const)
    .filter((target) => targets.includes(target))
    .map((target) => {
      const column = MATCH_COLUMNS[target]
      const position = `strpos(lower(${column}), ${needle})`
      return `WHEN ${position} > 0 THEN substr(${column}, greatest(1, ${position} - ${SNIPPET_BEFORE}), ${SNIPPET_LENGTH})`
    })
  return `, CASE ${cases.join(' ')} END AS snippet`
}

/** The conditions that narrow rows to the query's collections and locale; `prefix` qualifies the columns */
function scopeConditions(spec: ContentQuery, params: Parameters, prefix: string): string[] {
  const conditions: string[] = []
  if (spec.collections) {
    const list = spec.collections.map((collection) => params.bind(collection)).join(', ')
    conditions.push(spec.collections.length > 0 ? `${prefix}collection IN (${list})` : 'FALSE')
  }
  if (spec.locale) conditions.push(`${prefix}locale = ${params.bind(spec.locale)}`)
  return conditions
}

/**
 * The WHERE conditions of the rows the query reads. `current` is the current, not
 * deleted rows; `published` the live row of each current, not deleted document, found
 * in a subquery over the same table so the outer columns stay those of the live row.
 */
function sourceConditions(spec: ContentQuery, params: Parameters): string[] {
  if (spec.state === 'current') {
    const where = ['is_current = TRUE', 'deleted_at IS NULL', ...scopeConditions(spec, params, '')]
    if (spec.status) where.push(statusCondition(spec.status))
    return where
  }
  const inner = ['cur.is_current = TRUE', 'cur.deleted_at IS NULL']
  inner.push(...scopeConditions(spec, params, 'cur.'))
  const liveIds = `SELECT live.id FROM content cur
    JOIN content live ON live.collection = cur.collection AND live.slug = cur.slug
      AND live.locale = cur.locale AND live.version = cur.live_version
    WHERE ${inner.join(' AND ')}`
  return [`id IN (${liveIds})`]
}

/**
 * Build the one statement a content query runs: the projection's columns, the rows of
 * its state, the text match, the order and a page of `limit + 1` rows.
 *
 * Every name in the SQL is a whitelisted column; collections, locale, match text and
 * paging are parameters.
 */
export function buildContentQuery(spec: ContentQuery): { sql: string; params: SqlParam[] } {
  const params = new Parameters()
  const where = sourceConditions(spec, params)
  let snippet = ''
  if (spec.match) {
    // A parameter no expression references fails in Postgres ("could not determine
    // data type"), so each is bound only when its expression is written.
    const needle = spec.match.text.toLowerCase()
    const targets = spec.match.in
    where.push(
      targets.length > 0
        ? matchCondition(targets, params.bind(`%${escapeLike(needle)}%`))
        : 'FALSE',
    )
    if (targets.includes('body') || targets.includes('fields')) {
      snippet = snippetColumn(targets, params.bind(needle))
    }
  }

  let sql = `SELECT ${PROJECTION_COLUMNS[spec.projection]}${snippet} FROM content WHERE ${where.join(' AND ')}`
  sql += orderByClause(spec.sort)
  if (spec.limit !== undefined) sql += ` LIMIT ${params.bind(spec.limit + 1)}`
  if (spec.offset !== undefined) sql += ` OFFSET ${params.bind(spec.offset)}`
  return { sql, params: params.values }
}

/** A snippet is the matched text with its whitespace runs collapsed to one space */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ')
}

function rowItem(projection: QueryProjection, row: Record<string, unknown>): unknown {
  if (projection === 'meta') return rowToDocumentMeta(row as unknown as MetaRow)
  if (projection === 'summary') return rowToSummary(row as unknown as SummaryRow)
  return rowToContentDocument(row as unknown as ContentRow)
}

/** Run a content query: one statement, one page */
export async function runContentQuery<P extends QueryProjection>(
  sql: Sql,
  spec: ContentQuery<P>,
): Promise<QueryPage<P>> {
  const built = buildContentQuery(spec)
  const rows = (await sql.unsafe(built.sql, built.params)) as Array<Record<string, unknown>>
  const hasMore = spec.limit !== undefined && rows.length > spec.limit
  const page = hasMore ? rows.slice(0, spec.limit) : rows
  const items = page.map((row) => {
    const item = rowItem(spec.projection, row) as QueryItem<P> & { snippet?: string | undefined }
    if (typeof row['snippet'] === 'string') item.snippet = collapseWhitespace(row['snippet'])
    return item
  })
  return { items, hasMore }
}
