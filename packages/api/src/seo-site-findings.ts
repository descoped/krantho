import { documentPath, rendersPages } from '@krantho/core'
import { type ContentSummary, canQuery } from '@krantho/persistence'
import { documentSeoProperties } from '@krantho/seo-shared'
import type { SeoFinding } from './assistant/protocol.js'
import { groupByCollection } from './group-by-collection.js'
import { composePageJsonLd } from './seo-compose.js'
import { type SeoConfigReader, seoConfigSnapshot } from './seo-config-snapshot.js'
import { loadSeo } from './seo-subsystem.js'
import { metaFindings, structuredFindings } from './seo-validation.js'
import type { ApiContext } from './types.js'

type Seo = Awaited<ReturnType<typeof loadSeo>>

/** How many findings of each severity one reader (or the page checks) has */
export interface FindingCounts {
  errors: number
  warnings: number
  info: number
}

/** One published page's SEO: findings counted per reader, and the search features it can appear in */
export interface PageSeoSummary {
  collection: string
  slug: string
  path: string
  /** Keyed by reader id, `schema.org` for the vocabulary, `page` for the title and meta description */
  readers: Record<string, FindingCounts>
  features: ReturnType<Seo['features']>
}

/** Findings counted by the reader they come from */
function countByReader(findings: readonly SeoFinding[]): Record<string, FindingCounts> {
  const counts: Record<string, FindingCounts> = {}
  for (const finding of findings) {
    const reader = finding.reader ?? 'page'
    counts[reader] ??= { errors: 0, warnings: 0, info: 0 }
    const bucket = counts[reader]
    if (finding.severity === 'error') bucket.errors++
    else if (finding.severity === 'warning') bucket.warnings++
    else bucket.info++
  }
  return counts
}

/** One live page: its graph composed once, validated once */
async function pageSummary(
  ctx: ApiContext,
  seo: Seo,
  seoConfigs: SeoConfigReader | undefined,
  collection: string,
  path: string,
  doc: ContentSummary,
): Promise<PageSeoSummary> {
  const properties = documentSeoProperties(doc.metadata)
  const graph = await composePageJsonLd({
    collection,
    slug: doc.meta.slug,
    path,
    fields: { ...doc.fields, ...documentSeoProperties(doc.metadata) },
    metadata: doc.metadata,
    documentMeta: doc.meta,
    config: ctx.config,
    seoConfigs,
  })
  const findings = [
    ...metaFindings(ctx, {
      ...doc.fields,
      ...properties,
      title: properties.headline ?? properties.name ?? doc.fields.title,
      'meta-description':
        properties.description ?? doc.fields['meta-description'] ?? doc.fields.description,
    }),
    ...structuredFindings(seo, graph),
  ]
  return {
    collection,
    slug: doc.meta.slug,
    path,
    readers: countByReader(findings),
    features: seo.features(graph),
  }
}

/**
 * The SEO of every published page of the site in its default locale — what
 * search engines read: each page's findings per reader and the search
 * features its entities can appear in. Rejects when `@krantho/seo` is not
 * installed.
 */
export async function siteSeoSummary(ctx: ApiContext): Promise<PageSeoSummary[]> {
  const seo = await loadSeo(ctx.config)
  if (!canQuery(ctx.adapter)) return []
  const seoConfigs = await seoConfigSnapshot(ctx.seoConfigAdapter)
  const rendered = [...ctx.contentConfig.collections].filter(([, collection]) =>
    rendersPages(collection),
  )
  if (rendered.length === 0) return []
  const names = rendered.map(([name]) => name)
  const { items } = await ctx.adapter.query({
    state: 'published',
    projection: 'summary',
    collections: names,
    locale: ctx.config.site.defaultLocale,
  })
  const live = groupByCollection(items, names, (doc) => doc.meta.collection)
  const pages: PageSeoSummary[] = []
  for (const [name, collection] of rendered) {
    for (const doc of live.get(name) ?? []) {
      const path = documentPath(collection, doc.meta.slug)
      if (path !== null) pages.push(await pageSummary(ctx, seo, seoConfigs, name, path, doc))
    }
  }
  return pages
}
