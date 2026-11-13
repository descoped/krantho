import type {
  ContentQuery,
  MatchTarget,
  QueryItem,
  QueryPage,
  QueryProjection,
} from '@krantho/persistence'
import { isDirectSortColumn, isSafeSortField, statusCondition } from '@krantho/persistence'
import type Database from 'better-sqlite3'
import type { ContentRow, MetaRow, SummaryRow } from './queries.js'
import { META_COLUMNS, SUMMARY_COLUMNS } from './queries.js'
import { rowToContentDocument, rowToDocumentMeta, rowToSummary } from './row-mapping.js'

/** Characters of a snippet before the match, and from the match on */
const SNIPPET_BEFORE = 80
const SNIPPET_LENGTH = 200

/** The column set a projection reads; `full` reads the whole row */
const PROJECTION_COLUMNS: Record<QueryProjection, string> = {
  meta: META_COLUMNS,
  summary: SUMMARY_COLUMNS,
  full: '*',
}

/** Escape LIKE wildcards (and the escape character) so the text matches literally */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** The ORDER BY of a query: the requested sort, then `collection, slug, locale` so paging is stable */
function orderByClause(sort: string | undefined): string {
  const [field, direction] = sort ? sort.split(':') : []
  const tieBreak = 'collection, slug, locale'
  if (!field) return ` ORDER BY ${tieBreak}`
  const dir = direction === 'desc' ? 'DESC' : 'ASC'
  if (isDirectSortColumn(field)) return ` ORDER BY ${field} ${dir}, ${tieBreak}`
  if (isSafeSortField(field)) {
    return ` ORDER BY json_extract(fields, '$.${field}') ${dir}, ${tieBreak}`
  }
  return ` ORDER BY ${tieBreak}`
}

/** The SQL expression of a text column the match folds and searches */
const MATCH_COLUMNS: Record<MatchTarget, string> = {
  slug: 'slug',
  fields: 'fields',
  body: 'body',
}

/** The condition that a document matches the text in any of the targets */
function matchCondition(targets: readonly MatchTarget[]): string {
  const likes = targets.map((target) => `kr_lower(${MATCH_COLUMNS[target]}) LIKE ? ESCAPE '\\'`)
  return likes.length > 0 ? `(${likes.join(' OR ')})` : '0'
}

/**
 * The substring of the first match: from the body when it matches there, else from
 * the fields' JSON. `instr` and `substr` count characters, so the position found in
 * the folded text applies to the original.
 */
function snippetColumn(targets: readonly MatchTarget[]): { sql: string; paramCount: number } {
  const cases = (['body', 'fields'] as const)
    .filter((target) => targets.includes(target))
    .map((target) => {
      const column = MATCH_COLUMNS[target]
      const position = `instr(kr_lower(${column}), ?)`
      return `WHEN ${position} > 0 THEN substr(${column}, max(1, ${position} - ${SNIPPET_BEFORE}), ${SNIPPET_LENGTH})`
    })
  if (cases.length === 0) return { sql: '', paramCount: 0 }
  return { sql: `, CASE ${cases.join(' ')} END AS snippet`, paramCount: cases.length * 2 }
}

/** The WHERE conditions of the query's current or live rows, and their parameters */
function scopeConditions(spec: ContentQuery): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []
  if (spec.collections) {
    conditions.push(`collection IN (${spec.collections.map(() => '?').join(', ')})`)
    params.push(...spec.collections)
  }
  if (spec.locale) {
    conditions.push('locale = ?')
    params.push(spec.locale)
  }
  return { conditions, params }
}

/**
 * The FROM/WHERE of the rows the query reads. `current` is the current, not deleted
 * rows; `published` the live row of each current, not deleted document, found in a
 * subquery over the same table so the outer columns stay those of the live row.
 */
function sourceClause(spec: ContentQuery): { where: string[]; params: unknown[] } {
  const { conditions, params } = scopeConditions(spec)
  if (spec.state === 'current') {
    const where = ['is_current = 1', 'deleted_at IS NULL', ...conditions]
    if (spec.status) where.push(statusCondition(spec.status))
    return { where, params }
  }
  const inner = conditions.map((condition) => `cur.${condition}`)
  const liveIds = `SELECT live.id FROM content cur
    JOIN content live ON live.collection = cur.collection AND live.slug = cur.slug
      AND live.locale = cur.locale AND live.version = cur.live_version
    WHERE ${['cur.is_current = 1', 'cur.deleted_at IS NULL', ...inner].join(' AND ')}`
  return { where: [`id IN (${liveIds})`], params }
}

/**
 * Build the one statement a content query runs: the projection's columns, the rows of
 * its state, the text match, the order and a page of `limit + 1` rows.
 *
 * Every name in the SQL is a whitelisted column; collections, locale, match text and
 * paging are parameters.
 */
export function buildContentQuery(spec: ContentQuery): { sql: string; params: unknown[] } {
  const source = sourceClause(spec)
  const where = [...source.where]
  const params: unknown[] = []
  let snippet = { sql: '', paramCount: 0 }
  let needle = ''
  if (spec.match) {
    needle = spec.match.text.toLowerCase()
    snippet = snippetColumn(spec.match.in)
    where.push(matchCondition(spec.match.in))
  }

  // Parameters are bound in the order their `?` appear: the snippet in the select
  // list, the scope and the match in the WHERE.
  params.push(...Array.from({ length: snippet.paramCount }, () => needle))
  params.push(...source.params)
  if (spec.match) {
    params.push(...spec.match.in.map(() => `%${escapeLike(needle)}%`))
  }

  let sql = `SELECT ${PROJECTION_COLUMNS[spec.projection]}${snippet.sql} FROM content WHERE ${where.join(' AND ')}`
  sql += orderByClause(spec.sort)
  if (spec.limit !== undefined) {
    sql += ' LIMIT ?'
    params.push(spec.limit + 1)
  }
  if (spec.offset !== undefined) {
    sql += spec.limit === undefined ? ' LIMIT -1 OFFSET ?' : ' OFFSET ?'
    params.push(spec.offset)
  }
  return { sql, params }
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
export function runContentQuery<P extends QueryProjection>(
  db: Database.Database,
  spec: ContentQuery<P>,
): QueryPage<P> {
  const { sql, params } = buildContentQuery(spec)
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>
  const hasMore = spec.limit !== undefined && rows.length > spec.limit
  const page = hasMore ? rows.slice(0, spec.limit) : rows
  const items = page.map((row) => {
    const item = rowItem(spec.projection, row) as QueryItem<P> & { snippet?: string | undefined }
    if (typeof row.snippet === 'string') item.snippet = collapseWhitespace(row.snippet)
    return item
  })
  return { items, hasMore }
}
