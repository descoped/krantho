/**
 * The Site screens' rows, derived from what the API returns — pure, so the
 * screens load the sources and these shape, filter, sort and count them.
 */

import { documentPath } from '@krantho/core/cache-tags'
import type {
  CollectionInfo,
  CollectionTranslationStatus,
  ContentSummaryItem,
  PageSeoSummary,
} from '../lib/api.js'
import { type DocumentStatus, documentStatus } from '../lib/document-status.js'
import {
  hasText,
  hasValidStructuredData,
  type MetaCoverage,
  metaCoverage,
} from '../lib/findability.js'
import type { Source } from '../lib/source.js'

/**
 * The live page's structured data, as `GET /api/seo/findings` reports it:
 * valid or with errors; not checked while the document is not live, or in a
 * locale other than the default (the findings cover the default locale's live
 * pages); off when `seo` is off; unavailable when the findings could not be read.
 */
export type GraphState = 'valid' | 'errors' | 'not-live' | 'default-locale-only' | 'off' | 'failed'

/** The locales a document has a version in, from `GET /api/translations/status` */
export type LocaleVersions =
  | { state: 'ok'; present: readonly string[]; missing: readonly string[] }
  | { state: 'off' }
  | { state: 'failed' }

/** One document in one locale, as the Site screens show it */
export interface SiteRow {
  collection: string
  slug: string
  locale: string
  /** The `title` field, or the slug when it has none */
  title: string
  status: DocumentStatus
  version: number
  liveVersion: number | null
  /** When the current version was saved */
  updatedAt: string
  /** The URL path the page renders at; null when the collection has no pages */
  path: string | null
  /** The meta description; null when the collection has no pages */
  meta: MetaCoverage | null
  graph: GraphState | null
  locales: LocaleVersions
}

/** Translation coverage, as the status endpoint reports it */
export interface TranslationCoverage {
  supportedLocales: readonly string[]
  collections: readonly CollectionTranslationStatus[]
}

/** What a collection's rows are read against */
export interface RowContext {
  collection: CollectionInfo
  defaultLocale: string
  findings: Source<readonly PageSeoSummary[]>
  translations: Source<TranslationCoverage>
}

function graphState(item: ContentSummaryItem, context: RowContext): GraphState | null {
  if (!context.collection.pages) return null
  const { findings, defaultLocale } = context
  if (findings.state !== 'ok') return findings.state
  if (item.meta.locale !== defaultLocale) return 'default-locale-only'
  const page = findings.value.find(
    (summary) => summary.collection === item.meta.collection && summary.slug === item.meta.slug,
  )
  if (!page) return 'not-live'
  return hasValidStructuredData(page) ? 'valid' : 'errors'
}

/**
 * The locales a document has a version in. The row was read in its own locale,
 * so that one is always present — even when the status omits the slug.
 */
function localeVersions(meta: ContentSummaryItem['meta'], context: RowContext): LocaleVersions {
  const { translations, collection } = context
  if (translations.state !== 'ok') return translations
  const entry = translations.value.collections
    .find((status) => status.collection === collection.name)
    ?.items.find((item) => item.slug === meta.slug)
  const present = new Set([...(entry?.locales ?? []), meta.locale])
  const supported = translations.value.supportedLocales
  return {
    state: 'ok',
    present: supported.filter((locale) => present.has(locale)),
    missing: supported.filter((locale) => !present.has(locale)),
  }
}

export function toSiteRow(item: ContentSummaryItem, context: RowContext): SiteRow {
  const { meta, fields } = item
  const title = fields.title
  const pages = context.collection.pages
  return {
    collection: meta.collection,
    slug: meta.slug,
    locale: meta.locale,
    title: hasText(title) ? String(title) : meta.slug,
    status: documentStatus(meta),
    version: meta.version,
    liveVersion: meta.liveVersion,
    updatedAt: meta.createdAt,
    path: pages ? documentPath(context.collection, meta.slug) : null,
    meta: pages ? metaCoverage(fields) : null,
    graph: graphState(item, context),
    locales: localeVersions(meta, context),
  }
}

/** The status filter: one §2 status, or every document */
export type StatusFilter = DocumentStatus | 'all'

/** The sort: the most recently saved first, or by slug */
export type SortOrder = 'updated' | 'slug'

export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'live', 'ahead', 'draft']
export const SORT_ORDERS: readonly SortOrder[] = ['updated', 'slug']

export function isStatusFilter(value: string | null): value is StatusFilter {
  return STATUS_FILTERS.some((filter) => filter === value)
}

export function isSortOrder(value: string | null): value is SortOrder {
  return SORT_ORDERS.some((order) => order === value)
}

function compareRows(order: SortOrder): (a: SiteRow, b: SiteRow) => number {
  if (order === 'slug') return (a, b) => a.slug.localeCompare(b.slug)
  return (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug)
}

/** The rows a filter shows, in the chosen order */
export function shownRows(
  rows: readonly SiteRow[],
  filter: StatusFilter,
  order: SortOrder,
): SiteRow[] {
  return rows.filter((row) => filter === 'all' || row.status === filter).sort(compareRows(order))
}

/** A collection's documents counted by status */
export interface StatusCounts {
  total: number
  live: number
  ahead: number
  draft: number
}

export function statusCounts(rows: readonly SiteRow[]): StatusCounts {
  const count = (status: DocumentStatus): number =>
    rows.filter((row) => row.status === status).length
  return { total: rows.length, live: count('live'), ahead: count('ahead'), draft: count('draft') }
}

/** The shown-count: "3 of 12" */
export function shownCount(shown: number, total: number): string {
  return `${shown} of ${total}`
}

/** A page's address on the site: the site's base URL and the page's path */
export function pageUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

/** Select every shown row, or clear the selection when every shown row is already selected */
export function toggleAllShown(
  selected: ReadonlySet<string>,
  shown: readonly string[],
): Set<string> {
  const every = shown.length > 0 && shown.every((key) => selected.has(key))
  return every ? new Set() : new Set(shown)
}

/** The selected rows that are shown — a filter never acts on rows it hides */
export function selectedShown(selected: ReadonlySet<string>, shown: readonly string[]): string[] {
  return shown.filter((key) => selected.has(key))
}
