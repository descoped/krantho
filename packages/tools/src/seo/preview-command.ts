import type { ContentDocument } from '@krantho/persistence'
import { documentSeoConfig, documentSeoProperties } from '@krantho/seo-shared'
/**
 * `seo preview <collection>/<slug>` — the graph a document's stored SEO
 * settings compose to, with no content fields: the effective types, which
 * scope they come from, and the composed JSON-LD.
 */

import type { StoredSeoConfigs } from './validate-command'

export interface PreviewResult {
  target: string
  effectiveTypes: string[]
  source: 'document' | 'collection' | 'site' | 'fallback'
  composed: unknown
}

/** Compose the preview of one document from the stored settings of its scopes */
export async function previewOf(
  configs: StoredSeoConfigs,
  collection: string,
  slug: string,
  content: ContentDocument | null,
): Promise<PreviewResult> {
  const { resolveEffectiveConfig, composeFromConfig } = await import('@krantho/seo')
  const [site, col] = await Promise.all([
    configs.getConfig('site'),
    configs.getConfig(`collection:${collection}`),
  ])
  const doc = documentSeoConfig(content?.metadata ?? {})
  const effective = resolveEffectiveConfig({
    site: site?.config ?? null,
    collection: col?.config ?? null,
    document: doc,
  })
  const composed = composeFromConfig({
    config: effective,
    fields: { ...content?.fields, ...documentSeoProperties(content?.metadata ?? {}) },
    siteConfig: { domain: '', name: '', language: '', baseUrl: '' },
    path: `/${collection}/${slug}`,
    siteLevel: site?.config ?? null,
  })
  return {
    target: `${collection}/${slug}`,
    effectiveTypes: effective.entities.map((e) => e['@type']),
    source: doc ? 'document' : col ? 'collection' : site ? 'site' : 'fallback',
    composed,
  }
}
