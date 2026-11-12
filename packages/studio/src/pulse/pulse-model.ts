/**
 * Pulse's figures, derived from what the API returns — never estimated. Each
 * function is pure: the screen loads the sources, these count them.
 */

import type { CollectionInfo, ContentSummaryItem, PageSeoSummary } from '../lib/api.js'
import { type DocumentStatus, documentStatus } from '../lib/document-status.js'
import {
  hasText,
  hasValidStructuredData,
  type MetaCoverage,
  metaCoverage,
} from '../lib/findability.js'
import { LAYOUT_COLLECTION } from '../lib/paths.js'

/** One document in one locale, as Pulse reads it: its latest state */
export interface PulseDocument {
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
  metaDescription: MetaCoverage
}

export function toPulseDocument({ meta, fields }: ContentSummaryItem): PulseDocument {
  const title = fields['title']
  return {
    collection: meta.collection,
    slug: meta.slug,
    locale: meta.locale,
    title: hasText(title) ? String(title) : meta.slug,
    status: documentStatus(meta),
    version: meta.version,
    liveVersion: meta.liveVersion,
    updatedAt: meta.createdAt,
    metaDescription: metaCoverage(fields),
  }
}

/** What a figure is counted over: the site's pages in its default locale */
export interface PulseScope {
  /** Collections whose documents render as pages */
  pageCollections: ReadonlySet<string>
  defaultLocale: string
}

export function pulseScope(
  collections: readonly CollectionInfo[],
  defaultLocale: string,
): PulseScope {
  return {
    pageCollections: new Set(collections.filter((c) => c.pages).map((c) => c.name)),
    defaultLocale,
  }
}

/** The documents that render as pages, in the default locale */
export function sitePages(documents: readonly PulseDocument[], scope: PulseScope): PulseDocument[] {
  return documents.filter(
    (doc) => scope.pageCollections.has(doc.collection) && doc.locale === scope.defaultLocale,
  )
}

/** Pages with a live version, and how many of those have unpublished changes */
export interface LiveFigure {
  pages: number
  live: number
  ahead: number
}

export function liveFigure(pages: readonly PulseDocument[]): LiveFigure {
  return {
    pages: pages.length,
    live: pages.filter((page) => page.status !== 'draft').length,
    ahead: pages.filter((page) => page.status === 'ahead').length,
  }
}

/** How the pages' meta descriptions are covered */
export interface CoverageFigure {
  pages: number
  covered: number
  fallback: number
  missing: number
}

export function coverageFigure(pages: readonly PulseDocument[]): CoverageFigure {
  const count = (coverage: MetaCoverage): number =>
    pages.filter((page) => page.metaDescription === coverage).length
  return {
    pages: pages.length,
    covered: count('covered'),
    fallback: count('fallback'),
    missing: count('missing'),
  }
}

/** Live pages whose structured data no reader finds an error in, and the types they state most */
export interface StructuredDataFigure {
  pages: number
  valid: number
  mainTypes: string[]
}

/** How many main types the figure names */
const MAIN_TYPES = 3

export function structuredDataFigure(pages: readonly PageSeoSummary[]): StructuredDataFigure {
  const valid = pages.filter(hasValidStructuredData)
  const pagesPerType = new Map<string, number>()
  for (const page of valid) {
    for (const type of new Set(page.features.map((feature) => feature.type))) {
      pagesPerType.set(type, (pagesPerType.get(type) ?? 0) + 1)
    }
  }
  const mainTypes = [...pagesPerType.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, MAIN_TYPES)
    .map(([type]) => type)
  return { pages: pages.length, valid: valid.length, mainTypes }
}

/** A collection's documents in the default locale, by status */
export interface CollectionCounts {
  collection: CollectionInfo
  live: number
  ahead: number
  draft: number
}

/** Every collection but the Layout's globals, with its documents counted by status */
export function collectionCounts(
  collections: readonly CollectionInfo[],
  documents: readonly PulseDocument[],
  defaultLocale: string,
): CollectionCounts[] {
  return collections
    .filter((collection) => collection.name !== LAYOUT_COLLECTION)
    .map((collection) => {
      const docs = documents.filter(
        (doc) => doc.collection === collection.name && doc.locale === defaultLocale,
      )
      const count = (status: DocumentStatus): number =>
        docs.filter((doc) => doc.status === status).length
      return { collection, live: count('live'), ahead: count('ahead'), draft: count('draft') }
    })
}
