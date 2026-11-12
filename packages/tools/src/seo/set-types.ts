import type { SeoConfigData } from '@krantho/seo-shared'

/**
 * A scope's configuration with its entity types set: the entities become the
 * types named, and everything kept beside them — field mappings, the page
 * structure, the site's robots.txt override — stays as it was
 */
export function withTypes(
  existing: SeoConfigData | undefined,
  types: readonly string[],
): SeoConfigData {
  return { ...existing, entities: types.map((type) => ({ '@type': type, properties: {} })) }
}
