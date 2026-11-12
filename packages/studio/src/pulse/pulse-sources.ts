/**
 * What Pulse reads, and from where. The collections, the site configuration,
 * the locales and the documents are required; every other source is optional — off when
 * the site's capabilities or the viewer's role leave it out, failed when the
 * request did not succeed. Pulse shows an optional source's rows and figures
 * only when it was read.
 */

import {
  type CollectionInfo,
  type CollectionTranslationStatus,
  type ContentLock,
  fetchAllDocuments,
  fetchCollections,
  fetchLocks,
  fetchSiteConfig,
  fetchSiteFindings,
  fetchTranslationStatus,
  fetchWebhookDeliveries,
  type PageSeoSummary,
  type SiteConfigResponse,
} from '../lib/api.js'
import { isEnabled, type RuntimeCapabilities } from '../lib/capabilities.js'
import { hasSeveralLocales, loadLocales, type SiteLocales } from '../lib/locales.js'
import { optionalSource, type Source } from '../lib/source.js'
import type { FailedDeliveries } from './pulse-attention.js'
import { type PulseDocument, toPulseDocument } from './pulse-model.js'

export interface PulseData {
  site: SiteConfigResponse
  /** The site's locales, as set in Setup › Locales */
  locales: SiteLocales
  collections: CollectionInfo[]
  /** Every document of every collection, in every supported locale */
  documents: PulseDocument[]
  /** Every edit lock; the screen keeps those someone else holds */
  locks: Source<ContentLock[]>
  /** The live pages' SEO, when `seo` is on */
  findings: Source<PageSeoSummary[]>
  /** Failed webhook deliveries, when `webhookDeliveries` is on */
  deliveries: Source<FailedDeliveries>
  /** Locale coverage, when the site has more than one locale */
  translations: Source<CollectionTranslationStatus[]>
}

async function loadDocuments(locales: readonly string[]): Promise<PulseDocument[]> {
  const documents = await fetchAllDocuments()
  return documents.filter((item) => locales.includes(item.meta.locale)).map(toPulseDocument)
}

async function failedDeliveries(): Promise<FailedDeliveries> {
  const { deliveries, total } = await fetchWebhookDeliveries({ status: 'failed', limit: 1 })
  return { total, latest: deliveries[0] ?? null }
}

/** Everything Pulse shows, read in parallel; rejects only when a required source fails */
export async function loadPulse(caps: RuntimeCapabilities): Promise<PulseData> {
  const [site, collections, locales] = await Promise.all([
    fetchSiteConfig(),
    fetchCollections(),
    loadLocales(),
  ])
  const [documents, locks, findings, deliveries, translations] = await Promise.all([
    loadDocuments(locales.supportedLocales),
    optionalSource(true, fetchLocks),
    optionalSource(isEnabled(caps, 'seo'), async () => (await fetchSiteFindings()).pages),
    optionalSource(isEnabled(caps, 'webhookDeliveries'), failedDeliveries),
    optionalSource(
      hasSeveralLocales(locales),
      async () => (await fetchTranslationStatus()).collections,
    ),
  ])
  return { site, locales, collections, documents, locks, findings, deliveries, translations }
}
