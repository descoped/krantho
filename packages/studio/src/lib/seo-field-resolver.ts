/**
 * Admin-side wrapper around the canonical SEO field resolver. The shared
 * logic lives in @krantho/seo-shared (zero-dep package).
 */
import { buildSeoFieldMap, resolveSeoField, type SeoFieldConcept } from '@krantho/seo-shared'

/**
 * Resolve multiple SEO concepts from a single fields object in one pass.
 *
 * Builds the field map once and looks up each requested concept against it.
 * Use this when a component or function needs more than one concept from the
 * same fields.
 */
export function resolveSeoFields<K extends SeoFieldConcept>(
  fields: Record<string, unknown>,
  concepts: readonly K[],
): Record<K, string> {
  const fieldMap = buildSeoFieldMap(Object.keys(fields))
  const result = {} as Record<K, string>
  for (const concept of concepts) {
    result[concept] = resolveSeoField(fieldMap, concept, fields)
  }
  return result
}
