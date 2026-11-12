import type { KranthoConfig } from '@krantho/config'
import type { PageStructure } from '@krantho/core'
import type { DocumentMeta } from '@krantho/persistence'
import type { SeoConfigData } from '@krantho/seo-shared'
import {
  buildSeoFieldMap,
  documentSeoConfig,
  documentSeoProperties,
  resolveSeoField,
} from '@krantho/seo-shared'
import type { SeoConfigReader } from './seo-config-snapshot.js'
import { loadSeoModule } from './seo-loader.js'
import { isSeoModuleMissing, loadSeo } from './seo-subsystem.js'

/** What composing a page's JSON-LD reads */
export interface PageJsonLdInput {
  collection: string
  slug: string
  /** Where the document renders (`documentPath()`); null when its collection has no pages */
  path: string | null
  /** The document fields the graph describes */
  fields: Record<string, unknown>
  /** Version metadata for system-derived properties (dates, author) */
  documentMeta?: DocumentMeta | undefined
  metadata?: Record<string, Record<string, unknown>> | undefined
  /** The site's configuration: its identity, SEO definitions and readers */
  config: KranthoConfig
  /** SEO configuration store; without one, the code-defined archetype applies */
  seoConfigs?: SeoConfigReader | undefined
  /** The structure the page's template renders: its trail, its place in a sequence, its kind */
  structure?: PageStructure | undefined
}

/** The SEO configuration a page composes from: the site, its collection, its URL pattern and the document */
export interface PageSeoConfig {
  site: SeoConfigData | null
  effective: SeoConfigData
}

const ROUTE_PREFIX = 'route:'

/** A URL pattern as a regular expression: `**` stands for any rest of the path, `*` for one segment */
function routePattern(pattern: string): RegExp {
  const source = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((literal) => literal.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]+'),
    )
    .join('.*')
  return new RegExp(`^${source}$`)
}

/** Whether a route configuration's URL pattern (`/blog/*`, `/docs/**`) matches a page path */
export function routeMatches(pattern: string, path: string): boolean {
  return routePattern(pattern).test(path)
}

/** The configuration of the most specific URL pattern matching the path: the one with the most literal characters */
async function routeConfig(
  seoConfigs: SeoConfigReader,
  path: string | null,
): Promise<SeoConfigData | null> {
  if (path === null) return null
  const literal = (id: string): number => id.replaceAll('*', '').length
  const matching = (await seoConfigs.listConfigs('route'))
    .filter((stored) => routeMatches(stored.id.slice(ROUTE_PREFIX.length), path))
    .sort((a, b) => literal(b.id) - literal(a.id))
  return matching[0]?.config ?? null
}

/**
 * The SEO configuration a page composes from: the stored site scope, and the
 * collection, URL-pattern and document scopes resolved into one — or, when
 * nothing is configured for the page, the code-defined article archetype with
 * no site entities. The page's graph and the editor's resolved values both
 * start here. Rejects when `@krantho/seo` is not installed.
 */
export async function pageSeoConfig(
  input: Pick<PageJsonLdInput, 'collection' | 'slug' | 'path' | 'seoConfigs' | 'metadata'>,
): Promise<PageSeoConfig> {
  const { resolveEffectiveConfig, blogPostArchetype } = await loadSeoModule()
  const [siteRes, colRes, routeRes] = input.seoConfigs
    ? await Promise.all([
        input.seoConfigs.getConfig('site'),
        input.seoConfigs.getConfig(`collection:${input.collection}`),
        routeConfig(input.seoConfigs, input.path),
      ])
    : [null, null, null]
  const site = siteRes?.config ?? null
  const document = documentSeoConfig(input.metadata ?? {})
  const scopes = [site, colRes?.config, routeRes, document]
  if (scopes.every((scope) => (scope?.entities.length ?? 0) === 0)) {
    const entities = blogPostArchetype.schemas.map((type) => ({ '@type': type, properties: {} }))
    return { site: null, effective: { entities } }
  }
  return {
    site,
    effective: resolveEffectiveConfig({
      collection: colRes?.config ?? null,
      route: routeRes,
      document,
    }),
  }
}

/**
 * Compose a page's JSON-LD graph from its SEO configuration (see
 * `pageSeoConfig`) and the site's identity; a minimal `WebPage` when
 * `@krantho/seo` is not installed. The SEO preview endpoint and
 * server-rendered pages share it.
 *
 * Every URL in the graph is the document's page, so a document whose
 * collection renders no pages gets an empty `@graph`: it has no page for
 * Schema.org entities to describe.
 */
export async function composePageJsonLd(input: PageJsonLdInput): Promise<Record<string, unknown>> {
  const { slug, path, fields, config } = input
  if (path === null) return { '@context': 'https://schema.org', '@graph': [] }

  try {
    const seo = await loadSeo(config)
    const page = await pageSeoConfig(input)
    return {
      ...seo.compose({
        config: page.effective,
        fields: { ...fields, ...documentSeoProperties(input.metadata ?? {}) },
        path,
        siteLevel: page.site,
        ...(input.documentMeta ? { documentMeta: input.documentMeta } : {}),
        structure: input.structure,
      }),
    }
  } catch (err: unknown) {
    if (!isSeoModuleMissing(err)) throw err
  }

  // @krantho/seo not available — minimal JSON-LD using the canonical field resolver.
  const fieldMap = buildSeoFieldMap(Object.keys(fields))
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: resolveSeoField(fieldMap, 'title', fields) || slug,
    description: resolveSeoField(fieldMap, 'description', fields),
    url: `${config.site.baseUrl}${path}`,
  }
}
