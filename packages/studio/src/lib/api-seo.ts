import type { SeoFinding } from './api-assistant.js'
import { ApiError, BASE, localeQuery, request, requestText } from './api-client.js'
import type {
  CatalogDetailResponse,
  CatalogType,
  EnrichJobResponse,
  EnrichStatusResponse,
  ResolvedEntity,
  SeoConfig,
  SeoConfigData,
} from './api-types.js'
import { isNotFound } from './fetch.js'

/** A single URL entry in the sitemap (matches @krantho/api `SitemapUrl`) */
export interface SitemapUrl {
  loc: string
  lastmod?: string | undefined
  changefreq: string
  priority: string
}

/** The JSON-LD a document's current version composes to; the site's default locale when `locale` is absent */
export async function fetchSeoPreview(
  collection: string,
  slug: string,
  locale?: string | undefined,
): Promise<unknown> {
  return request<unknown>(`/seo/preview/${collection}/${slug}${localeQuery(locale)}`)
}

/**
 * Each entity of a document's structured data, with every property's value and
 * where it comes from; the site's default locale when `locale` is absent
 */
export async function fetchSeoResolved(
  collection: string,
  slug: string,
  locale?: string | undefined,
): Promise<{ entities: ResolvedEntity[] }> {
  return request<{ entities: ResolvedEntity[] }>(
    `/seo/resolved/${collection}/${slug}${localeQuery(locale)}`,
  )
}

/** The readers a site's findings are reported for */
export interface SeoReader {
  id: string
  name: string
}

/**
 * A document's SEO findings: title and meta description, and its structured
 * data per reader; the site's default locale when `locale` is absent
 */
export async function fetchSeoFindings(
  collection: string,
  slug: string,
  locale?: string | undefined,
): Promise<{ findings: SeoFinding[]; readers: SeoReader[] }> {
  return request<{ findings: SeoFinding[]; readers: SeoReader[] }>(
    `/seo/findings/${collection}/${slug}${localeQuery(locale)}`,
  )
}

/** How many findings of each severity one reader reported */
export interface FindingCounts {
  errors: number
  warnings: number
  info: number
}

/** A search feature a page's structured data can appear in, for one reader (never a retired one) */
export interface PageSearchFeature {
  reader: string
  feature: string
  /** The Schema.org type of the entity */
  type: string
  /** The `@id` of the entity it is about, when it has one */
  nodeId?: string | undefined
  /** Shown when the properties are present (`active`), or only under the rule's conditions */
  status: 'active' | 'restricted'
  eligible: boolean
  /** Properties (or `a | b` choices) the feature needs that the entity lacks */
  missing: string[]
  conditions: string[]
  /** The documentation the reader's rule comes from */
  source: string
}

/** One live page's SEO, as `GET /api/seo/findings` reports it */
export interface PageSeoSummary {
  collection: string
  slug: string
  path: string
  /** Findings per reader: a reader id, `schema.org` for the vocabulary, `page` for the title and meta description */
  readers: Record<string, FindingCounts>
  features: PageSearchFeature[]
}

/** The SEO of every live page in the site's default locale */
export async function fetchSiteFindings(): Promise<{
  pages: PageSeoSummary[]
  readers: SeoReader[]
}> {
  return request<{ pages: PageSeoSummary[]; readers: SeoReader[] }>('/seo/findings')
}

/** Fetch sitemap as a structured JSON list (admin-only preview endpoint) */
export async function fetchSitemapJson(): Promise<{ urls: SitemapUrl[] }> {
  return request<{ urls: SitemapUrl[] }>('/seo/sitemap.json')
}

/** Fetch the current robots.txt body (generated or override) as raw text */
export async function fetchRobotsText(): Promise<string> {
  return requestText('/seo/robots.txt')
}

/** Where krantho's llms.txt comes from: a saved snapshot, or built from the live pages */
export type LlmsTxtOrigin = 'snapshot' | 'generated'

/** The llms.txt krantho's API serves, and where it comes from (`x-krantho-llms-origin`) */
export async function fetchLlmsTxt(): Promise<{ text: string; origin: LlmsTxtOrigin | null }> {
  const response = await fetch(`${BASE}/seo/llms.txt`)
  if (!response.ok) throw new ApiError(`Request failed: ${response.status}`, response.status, {})
  const header = response.headers.get('x-krantho-llms-origin')
  const origin = header === 'snapshot' || header === 'generated' ? header : null
  return { text: await response.text(), origin }
}

/** Whether the site's SEO settings hold a robots.txt override (their `robotsTxt`) */
export function hasRobotsOverride(config: SeoConfigData | null | undefined): boolean {
  return typeof config?.robotsTxt === 'string' && config.robotsTxt.length > 0
}

/** The site's SEO settings as stored; null when there are none. A failed read throws. */
async function storedSiteConfig(): Promise<SeoConfigData | null> {
  const existing = await fetchSeoConfig('site').catch((err: unknown) => {
    if (isNotFound(err)) return { config: null as SeoConfig | null }
    throw err
  })
  return existing.config?.config ?? null
}

/**
 * Save a robots.txt override: the site's SEO settings' `robotsTxt`, beside
 * its entities, served verbatim by the robots handler until cleared. The
 * stored settings are read first and kept as they are; with none yet, the
 * override is saved with no entities.
 */
export async function saveRobotsOverride(override: string): Promise<SeoConfig> {
  const current = (await storedSiteConfig()) ?? { entities: [] }
  return (await saveSeoConfig('site', { ...current, robotsTxt: override })).config
}

/**
 * Remove the robots.txt override, reverting to the generated default.
 *
 * Returns `true` if an override was actually removed, `false` if there was
 * nothing to reset (no site config at all, or no `robotsTxt`).
 */
export async function resetRobotsOverride(): Promise<boolean> {
  const current = await storedSiteConfig()
  if (!current || !hasRobotsOverride(current)) return false
  const { robotsTxt: _removed, ...remaining } = current
  await saveSeoConfig('site', remaining)
  return true
}

export async function triggerEnrichment(options: {
  type?: string | undefined
  scope?: string | undefined
  collection?: string | undefined
  slug?: string | undefined
  force?: boolean | undefined
}): Promise<EnrichJobResponse> {
  return request<EnrichJobResponse>('/seo/enrich', {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function fetchEnrichmentStatus(jobId?: string): Promise<EnrichStatusResponse> {
  const qs = jobId ? `?jobId=${jobId}` : ''
  return request<EnrichStatusResponse>(`/seo/enrich/status${qs}`)
}

export async function fetchSeoCatalog(): Promise<{
  types: CatalogType[]
  categories: Record<string, string>
}> {
  return request('/seo/catalog')
}

export async function fetchCatalogType(type: string): Promise<CatalogDetailResponse> {
  return request(`/seo/catalog?type=${encodeURIComponent(type)}`)
}

/** Build the SEO config URL — use query param for IDs with slashes */
function seoConfigUrl(id: string): string {
  if (id.includes('/')) {
    return `/seo/config?id=${encodeURIComponent(id)}`
  }
  return `/seo/config/${id}`
}

export async function fetchSeoConfig(id: string): Promise<{ config: SeoConfig | null }> {
  return request(seoConfigUrl(id))
}

/** Every stored SEO configuration: the site's, each collection's, URL pattern's and document's */
export async function fetchSeoConfigs(): Promise<SeoConfig[]> {
  return (await request<{ configs: SeoConfig[] }>('/seo/config')).configs
}

export async function saveSeoConfig(
  id: string,
  data: SeoConfigData,
): Promise<{ config: SeoConfig }> {
  // Always use base path for PUT — ID is in the body, avoids slash issues in path
  return request('/seo/config', {
    method: 'PUT',
    body: JSON.stringify({ config: data, id }),
  })
}

/** Collection impact analysis response */
export interface CollectionImpactResponse {
  archetype: string
  totalDocuments: number
  affectedDocuments: Array<{
    slug: string
    title: string
    orphanedProperties: Array<{ entityType: string; property: string; value: unknown }>
    missingRequired: Array<{ entityType: string; property: string }>
  }>
  summary: {
    documentsWithOrphans: number
    documentsWithMissingRequired: number
    totalOrphanedProperties: number
    totalMissingRequired: number
  }
}

/** Fetch impact analysis for changing a collection's archetype */
export async function fetchCollectionImpact(
  collectionName: string,
  archetypeTypes: string,
): Promise<CollectionImpactResponse> {
  return request(
    `/seo/collection/${encodeURIComponent(collectionName)}/impact?archetype=${encodeURIComponent(archetypeTypes)}`,
  )
}
