/**
 * Default auto-mappings from CMS field names to Schema.org properties.
 *
 * When a CMS field name matches a known pattern, the system automatically
 * maps it to the corresponding Schema.org property without manual configuration.
 *
 * These are applied at the collection level and can be overridden per document.
 *
 * SEO field discovery (SeoFieldMap, buildSeoFieldMap, resolveSeoField) is now
 * canonical in @krantho/seo-shared. We re-export those here for backwards
 * compatibility with existing @krantho/seo consumers.
 */

export {
  buildSeoFieldMap,
  resolveSeoField,
  SEO_FIELD_CANDIDATES,
  type SeoFieldConcept,
  type SeoFieldMap,
} from '@krantho/seo-shared'

/** A mapping from CMS field name to Schema.org property */
export interface AutoMapping {
  /** CMS field name (exact match) */
  cmsField: string
  /** Schema.org property name */
  schemaProperty: string
  /** Priority — higher wins when multiple fields map to the same property */
  priority: number
}

/**
 * Default auto-mappings sorted by priority (highest first).
 *
 * When multiple CMS fields could map to the same Schema.org property,
 * the highest priority mapping wins. For example, `meta-description`
 * (priority 10) overrides `description` (priority 5) for the Schema.org
 * `description` property.
 */
export const DEFAULT_AUTO_MAPPINGS: readonly AutoMapping[] = [
  // Title / Name / Headline
  { cmsField: 'title', schemaProperty: 'name', priority: 5 },
  { cmsField: 'title', schemaProperty: 'headline', priority: 5 },

  // Description
  { cmsField: 'meta-description', schemaProperty: 'description', priority: 10 },
  { cmsField: 'description', schemaProperty: 'description', priority: 5 },
  { cmsField: 'ingress', schemaProperty: 'description', priority: 3 },
  { cmsField: 'excerpt', schemaProperty: 'description', priority: 2 },

  // Dates
  { cmsField: 'date', schemaProperty: 'datePublished', priority: 5 },
  { cmsField: 'published-date', schemaProperty: 'datePublished', priority: 8 },
  { cmsField: 'modified-date', schemaProperty: 'dateModified', priority: 5 },

  // People
  { cmsField: 'author', schemaProperty: 'author', priority: 5 },

  // Media
  { cmsField: 'image', schemaProperty: 'image', priority: 5 },
  { cmsField: 'og-image', schemaProperty: 'image', priority: 8 },
  { cmsField: 'hero-image', schemaProperty: 'image', priority: 3 },
]

/**
 * Resolve auto-mappings for a set of CMS fields against a Schema.org type's properties.
 *
 * Returns a map of Schema.org property → CMS field name for all properties
 * that can be auto-filled from the given CMS fields.
 */
export function resolveAutoMappings(
  cmsFields: readonly string[],
  schemaProperties: readonly string[],
): Map<string, string> {
  const result = new Map<string, string>()
  const cmsFieldSet = new Set(cmsFields)

  // Sort by priority descending — highest priority wins
  const sorted = [...DEFAULT_AUTO_MAPPINGS].sort((a, b) => b.priority - a.priority)

  for (const mapping of sorted) {
    if (!cmsFieldSet.has(mapping.cmsField)) continue
    if (!schemaProperties.includes(mapping.schemaProperty)) continue
    if (result.has(mapping.schemaProperty)) continue // higher priority already set
    result.set(mapping.schemaProperty, mapping.cmsField)
  }

  return result
}
