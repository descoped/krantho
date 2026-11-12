import {
  type CatalogType,
  type CollectionInfo,
  fetchCollections,
  fetchSeoCatalog,
  fetchSeoConfigs,
  fetchSiteConfig,
  fetchSiteFindings,
  type PageSeoSummary,
  type SeoConfig,
  type SeoReader,
  type SiteConfigResponse,
} from '../lib/api.js'
import { optionalSource, type Source } from '../lib/source.js'

/**
 * What every Structure tab reads: the site's configuration and collections,
 * every stored SEO configuration (the four scopes), the Schema.org catalog,
 * and the findings of every live page. The optional sources say when they
 * could not be read; a figure without its source is never shown as zero.
 */

/** The SEO of every live page in the site's default locale (`GET /api/seo/findings`) */
export interface SiteFindings {
  pages: PageSeoSummary[]
  readers: SeoReader[]
}

/** The Schema.org catalog: its types and the labels of its categories */
export interface Catalog {
  types: CatalogType[]
  categories: Record<string, string>
}

export interface StructureBase {
  site: SiteConfigResponse
  collections: CollectionInfo[]
  /** The stored SEO configuration of every scope */
  configs: Source<SeoConfig[]>
  catalog: Source<Catalog>
}

export async function loadStructureBase(): Promise<StructureBase> {
  const [site, collections, configs, catalog] = await Promise.all([
    fetchSiteConfig(),
    fetchCollections(),
    optionalSource(true, fetchSeoConfigs),
    optionalSource(true, fetchSeoCatalog),
  ])
  return { site, collections, configs, catalog }
}

export function loadSiteFindings(): Promise<SiteFindings> {
  return fetchSiteFindings()
}

/** The stored configuration of one scope (`site`, `collection:pages`, …); null when unset */
export function configOf(configs: readonly SeoConfig[], id: string): SeoConfig | null {
  return configs.find((config) => config.id === id) ?? null
}

/** The stored configurations of one scope kind, in their stored order */
export function configsOf(
  configs: readonly SeoConfig[],
  scope: SeoConfig['scope'],
): readonly SeoConfig[] {
  return configs.filter((config) => config.scope === scope)
}

/** The types a catalog marks as the site's: what every page emits, set in Site entities */
export function siteLevelTypes(catalog: Source<Catalog>): ReadonlySet<string> {
  if (catalog.state !== 'ok') return new Set()
  return new Set(catalog.value.types.filter((type) => type.siteLevel).map((type) => type.type))
}

/** The types only a site entity has (never a page's own): a feature about one is fixed in Site entities */
export function siteOnlyTypes(catalog: Source<Catalog>): ReadonlySet<string> {
  if (catalog.state !== 'ok') return new Set()
  const types = catalog.value.types.filter((type) => type.siteLevel && !type.documentLevel)
  return new Set(types.map((type) => type.type))
}
