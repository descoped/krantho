/**
 * What the Site screens read. The collections, the site configuration, the
 * locales and the documents are required; the SEO findings (`seo`) and the
 * locale versions (when the site has more than one locale) are optional
 * sources — off without them, failed when they could not be read, and said so
 * on screen.
 */

import {
  type CollectionInfo,
  type ContentSummaryItem,
  fetchAllDocuments,
  fetchCollections,
  fetchSiteConfig,
  fetchSiteFindings,
  fetchTranslationStatus,
  type PageSeoSummary,
  type SiteConfigResponse,
} from '../lib/api.js'
import { isEnabled, type RuntimeCapabilities } from '../lib/capabilities.js'
import { hasSeveralLocales, loadLocales, type SiteLocales } from '../lib/locales.js'
import { LAYOUT_COLLECTION } from '../lib/paths.js'
import { optionalSource, type Source } from '../lib/source.js'
import { type RowContext, type SiteRow, type TranslationCoverage, toSiteRow } from './site-model.js'

/** The sources every collection's rows are read against */
interface SharedSources {
  site: SiteConfigResponse
  /** The site's locales, as set in Setup › Locales */
  locales: SiteLocales
  collections: CollectionInfo[]
  findings: Source<readonly PageSeoSummary[]>
  translations: Source<TranslationCoverage>
}

async function loadShared(caps: RuntimeCapabilities): Promise<SharedSources> {
  const [site, collections, locales] = await Promise.all([
    fetchSiteConfig(),
    fetchCollections(),
    loadLocales(),
  ])
  const [findings, translations] = await Promise.all([
    optionalSource(isEnabled(caps, 'seo'), async () => (await fetchSiteFindings()).pages),
    optionalSource(hasSeveralLocales(locales), fetchTranslationStatus),
  ])
  return { site, locales, collections, findings, translations }
}

function rowsOf(items: readonly ContentSummaryItem[], context: RowContext): SiteRow[] {
  return items.map((item) => toSiteRow(item, context))
}

function contextFor(collection: CollectionInfo, shared: SharedSources): RowContext {
  return {
    collection,
    defaultLocale: shared.locales.defaultLocale,
    findings: shared.findings,
    translations: shared.translations,
  }
}

/** One collection's section of the overview */
export interface OverviewSection {
  collection: CollectionInfo
  rows: SiteRow[]
}

export interface SiteOverviewData {
  site: SiteConfigResponse
  locales: SiteLocales
  sections: OverviewSection[]
  /** The globals; null when the site has none */
  layout: SiteRow[] | null
  localization: boolean
}

/** Every collection's documents in the default locale, with their findability and locales */
export async function loadSiteOverview(caps: RuntimeCapabilities): Promise<SiteOverviewData> {
  const shared = await loadShared(caps)
  const locale = shared.locales.defaultLocale
  const documents = await fetchAllDocuments({ locale })
  const sections: OverviewSection[] = []
  let layout: SiteRow[] | null = null
  for (const collection of shared.collections) {
    const own = documents.filter((item) => item.meta.collection === collection.name)
    const rows = rowsOf(own, contextFor(collection, shared))
    if (collection.name === LAYOUT_COLLECTION) layout = rows
    else sections.push({ collection, rows })
  }
  const localization = shared.translations.state !== 'off'
  return { site: shared.site, locales: shared.locales, sections, layout, localization }
}

export interface CollectionViewData {
  site: SiteConfigResponse
  locales: SiteLocales
  /** Null when the site has no such collection, or it is the Layout's globals */
  collection: CollectionInfo | null
  locale: string
  rows: SiteRow[]
  localization: boolean
}

/** A collection's whole list in one locale, with its findability and locales */
export async function loadCollectionView(
  caps: RuntimeCapabilities,
  name: string,
  requestedLocale: string | null,
): Promise<CollectionViewData> {
  const shared = await loadShared(caps)
  const { supportedLocales, defaultLocale } = shared.locales
  const locale =
    requestedLocale && supportedLocales.includes(requestedLocale) ? requestedLocale : defaultLocale
  const localization = shared.translations.state !== 'off'
  const collection =
    shared.collections.find((c) => c.name === name && c.name !== LAYOUT_COLLECTION) ?? null
  const base = { site: shared.site, locales: shared.locales, collection, locale, localization }
  if (!collection) return { ...base, rows: [] }
  const items = await fetchAllDocuments({ collections: [collection.name], locale })
  return { ...base, rows: rowsOf(items, contextFor(collection, shared)) }
}
