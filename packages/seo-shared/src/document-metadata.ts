import type { SeoConfigData } from './seo-config-types.js'

/** Optional document-owned graph data. The CMS stores this ordinary portable contract. */
export const DOCUMENT_SEO_METADATA_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          '@type': { type: 'string' },
          '@id': { type: 'string' },
          role: { type: 'string' },
          properties: { type: 'object', additionalProperties: {} },
        },
        required: ['@type', 'properties'],
      },
    },
    fieldMappings: { type: 'object', additionalProperties: { type: 'string' } },
    structure: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string' },
        trail: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { name: { type: 'string' }, url: { type: 'string' } },
            required: ['name'],
          },
        },
      },
    },
  },
  required: ['entities'],
}

/** Scope policy is dynamic context; the document's own overrides come from its revision. */
export function documentSeoConfig(
  metadata: Readonly<Record<string, Record<string, unknown>>>,
): SeoConfigData | null {
  const group = metadata['seo']
  if (!group || !Array.isArray(group['entities'])) return null
  return group as unknown as SeoConfigData
}

export function documentSeoProperties(
  metadata: Readonly<Record<string, Record<string, unknown>>>,
): Record<string, unknown> {
  const graph = documentSeoConfig(metadata)?.entities[0]?.properties ?? {}
  const sharing = metadata['sharing'] ?? {}
  const editorial = metadata['editorial'] ?? {}
  const publication = metadata['publication'] ?? {}
  return {
    ...graph,
    ...(sharing['title'] !== undefined ? { headline: sharing['title'] } : {}),
    ...(sharing['description'] !== undefined ? { description: sharing['description'] } : {}),
    ...(sharing['image'] !== undefined ? { image: sharing['image'] } : {}),
    ...(sharing['canonicalUrl'] !== undefined ? { url: sharing['canonicalUrl'] } : {}),
    ...(editorial['byline'] !== undefined ? { author: editorial['byline'] } : {}),
    ...(publication['date'] !== undefined ? { datePublished: publication['date'] } : {}),
  }
}
