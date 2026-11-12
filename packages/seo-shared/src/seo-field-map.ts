/**
 * SEO field map — resolves SEO concepts to actual CMS field names.
 *
 * Given the CMS field names from a collection schema, determines which
 * CMS field serves each SEO concept (description, title, author, etc.).
 * The CMS schema is the source of truth — SEO adapts to it.
 *
 * This module is the canonical implementation. It lives in @krantho/seo-shared
 * (a zero-dependency package) so it can be consumed by any package that needs
 * field discovery without forcing a dependency on @krantho/seo (which is
 * optional). @krantho/seo re-exports from here for backwards compatibility.
 */

/** All SEO concepts that can be mapped to CMS fields */
export interface SeoFieldMap {
  /** CMS field that serves as the page title */
  title: string | null
  /** CMS field that serves as the SEO description (meta-description > description) */
  description: string | null
  /** CMS field for the author */
  author: string | null
  /** CMS field for the publication date */
  datePublished: string | null
  /** CMS field for the primary image */
  image: string | null
  /** CMS field for canonical URL override */
  canonicalUrl: string | null
  /** CMS field for robots index directive */
  robotsIndex: string | null
  /** CMS field for robots follow directive */
  robotsFollow: string | null
  /** CMS field for OG title override */
  ogTitle: string | null
  /** CMS field for OG description override */
  ogDescription: string | null
  /** CMS field for OG image override */
  ogImage: string | null
  /** CMS field for OG type override */
  ogType: string | null
}

/** Type alias for an SEO concept name */
export type SeoFieldConcept = keyof SeoFieldMap

/**
 * Well-known SEO field candidates in priority order (highest first).
 *
 * When extending this list, add the most specific name first. The first
 * candidate found in the CMS schema wins.
 *
 * Note on `image` vs `ogImage` overlap: both list `og-image` first by design.
 * If a CMS schema has only an `og-image` field, both the canonical page image
 * (used for JSON-LD) and the social-share image (used for og:image meta tags)
 * should resolve to it. Authors who want different values can add a separate
 * `image` or `hero-image` field — `image` will then prefer that and `ogImage`
 * will continue to use `og-image`.
 */
export const SEO_FIELD_CANDIDATES: Record<SeoFieldConcept, readonly string[]> = {
  title: ['title', 'name'],
  description: ['meta-description', 'description', 'ingress', 'excerpt'],
  author: ['author'],
  datePublished: ['published-date', 'date'],
  image: ['og-image', 'image', 'hero-image'],
  canonicalUrl: ['canonical-url'],
  robotsIndex: ['robots-index'],
  robotsFollow: ['robots-follow'],
  ogTitle: ['og-title'],
  ogDescription: ['og-description'],
  ogImage: ['og-image', 'image'],
  ogType: ['og-type'],
}

/**
 * Build an SEO field map from the CMS fields actually present in a collection.
 *
 * The CMS schema is the source of truth. This function discovers which
 * fields exist and maps them to SEO concepts. If a field doesn't exist
 * in the schema, the SEO concept maps to null.
 */
export function buildSeoFieldMap(cmsFieldNames: readonly string[]): SeoFieldMap {
  const fieldSet = new Set(cmsFieldNames)

  function resolve(candidates: readonly string[]): string | null {
    return candidates.find((f) => fieldSet.has(f)) ?? null
  }

  return {
    title: resolve(SEO_FIELD_CANDIDATES.title),
    description: resolve(SEO_FIELD_CANDIDATES.description),
    author: resolve(SEO_FIELD_CANDIDATES.author),
    datePublished: resolve(SEO_FIELD_CANDIDATES.datePublished),
    image: resolve(SEO_FIELD_CANDIDATES.image),
    canonicalUrl: resolve(SEO_FIELD_CANDIDATES.canonicalUrl),
    robotsIndex: resolve(SEO_FIELD_CANDIDATES.robotsIndex),
    robotsFollow: resolve(SEO_FIELD_CANDIDATES.robotsFollow),
    ogTitle: resolve(SEO_FIELD_CANDIDATES.ogTitle),
    ogDescription: resolve(SEO_FIELD_CANDIDATES.ogDescription),
    ogImage: resolve(SEO_FIELD_CANDIDATES.ogImage),
    ogType: resolve(SEO_FIELD_CANDIDATES.ogType),
  }
}

/**
 * Resolve an SEO concept's value from CMS content fields.
 *
 * Uses the field map to find the right CMS field, then reads the value.
 * Returns empty string if no field is mapped or value is missing.
 */
export function resolveSeoField(
  fieldMap: SeoFieldMap,
  concept: SeoFieldConcept,
  fields: Record<string, unknown>,
): string {
  const cmsField = fieldMap[concept]
  if (!cmsField) return ''
  const value = fields[cmsField]
  return typeof value === 'string' && value.length > 0 ? value : ''
}
