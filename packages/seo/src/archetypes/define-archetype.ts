import { getVocabularyType, lifecycleOf } from '../vocabulary/index.js'
import type { Archetype, ArchetypeConfig } from './types.js'

/** Default frontmatter key → Schema.org property mappings */
const DEFAULT_MAPPINGS: Record<string, string> = {
  title: 'name',
  description: 'description',
  author: 'author',
  date: 'datePublished',
  image: 'image',
  excerpt: 'description',
}

/**
 * Define a Schema.org archetype for a page type.
 *
 * An archetype declares which Schema.org types a page includes. The graph
 * composition engine builds each with its registered definition, or as a
 * node of the values resolved for it, and links them with `@id` references.
 *
 * Schema types are validated against the pinned Schema.org vocabulary at
 * definition time: an unknown type (almost always a typo) or one Schema.org
 * has superseded or retired throws. Archetype presets are module-level
 * constants, so this runs at import time — by design, to surface the
 * breakage immediately rather than producing non-conformant JSON-LD.
 *
 * @example
 * ```ts
 * const servicePage = defineArchetype({
 *   schemas: ['LocalBusiness', 'BreadcrumbList', 'FAQPage', 'Service'],
 * })
 * ```
 */
export function defineArchetype(config: ArchetypeConfig): Archetype {
  if (config.schemas.length === 0) {
    throw new Error('Archetype must include at least one schema type')
  }

  const unknown = config.schemas.filter((s) => getVocabularyType(s) === undefined)
  if (unknown.length > 0) {
    throw new Error(`defineArchetype: unknown Schema.org type(s) [${unknown.join(', ')}].`)
  }
  const outdated = config.schemas.filter((s) => {
    const status = lifecycleOf(s)?.status
    return status === 'superseded' || status === 'retired'
  })
  if (outdated.length > 0) {
    throw new Error(
      `defineArchetype: superseded or retired Schema.org type(s) [${outdated.join(', ')}].`,
    )
  }

  return {
    schemas: config.schemas,
    mappings: { ...DEFAULT_MAPPINGS, ...config.mappings },
  }
}
