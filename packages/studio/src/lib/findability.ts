/**
 * How findable a document is, from what the API returns: its meta description
 * (its own, the `description` it falls back to, or none) and whether the live
 * page's structured data passes every reader. Pulse counts these; the Site
 * screens show them per document.
 */

import type { PageSeoSummary } from './api-seo.js'

/** Whether a page has its own meta description, falls back to `description`, or has neither */
export type MetaCoverage = 'covered' | 'fallback' | 'missing'

/** Whether a field holds text that is more than whitespace */
export function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** The meta description search results show, and the field it comes from; none when neither is set */
export interface EffectiveMeta {
  text: string
  source: 'meta-description' | 'description' | 'metadata' | null
}

/** A page's effective meta description: its own `meta-description`, else `description`, else none */
export function effectiveMetaDescription(fields: Readonly<Record<string, unknown>>): {
  text: string
  source: 'meta-description' | 'description' | null
} {
  const own = fields['meta-description']
  if (hasText(own)) return { text: own, source: 'meta-description' }
  const { description } = fields
  if (hasText(description)) return { text: description, source: 'description' }
  return { text: '', source: null }
}

/** A page's meta description: its own `meta-description`, else `description`, else none */
export function metaCoverage(fields: Readonly<Record<string, unknown>>): MetaCoverage {
  const { source } = effectiveMetaDescription(fields)
  if (source === 'meta-description') return 'covered'
  return source === 'description' ? 'fallback' : 'missing'
}

/** A page's structured data is valid when no reader — the page's own title and meta checks aside — reports an error */
export function hasValidStructuredData(page: PageSeoSummary): boolean {
  return Object.entries(page.readers).every(
    ([reader, counts]) => reader === 'page' || counts.errors === 0,
  )
}
