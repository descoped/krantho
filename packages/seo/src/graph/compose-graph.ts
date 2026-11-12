import type { PageStructure } from '@krantho/core'
import type { Archetype } from '../archetypes/types.js'
import { composeFromConfig } from './compose-from-config.js'
import type { JsonLdGraph, SeoGraphConfig } from './types.js'

/** Options for graph composition */
export interface ComposeGraphOptions {
  /** The archetype defining which schemas to render */
  archetype: Archetype
  /** Page fields (resolved by resolvePageContent) */
  fields: Record<string, unknown>
  /** Site configuration */
  config: SeoGraphConfig
  /** Current page path, e.g., '/about' or '/blog/my-post' */
  path: string
  /** The structure the page renders: its trail, its place in a sequence, its kind */
  structure?: PageStructure | undefined
  /** Optional FAQ pairs for FAQPage schema */
  faq?: ReadonlyArray<{ question: string; answer: string }> | undefined
}

/**
 * Compose a JSON-LD @graph block from an archetype and page data: each of the
 * archetype's types is built as configured with no settings of its own, so
 * values come from the page's content, the page itself and the site's
 * identity — the same composition as `composeFromConfig`.
 *
 * @example
 * ```ts
 * const graph = composeGraph({
 *   archetype: homePageArchetype,
 *   fields: content.hero.fields,
 *   config: siteConfig,
 *   path: '/',
 * })
 * // Returns { "@context": "https://schema.org", "@graph": [...] }
 * ```
 */
export function composeGraph(options: ComposeGraphOptions): JsonLdGraph {
  const entities = options.archetype.schemas.map((type) => ({ '@type': type, properties: {} }))
  return composeFromConfig({
    config: { entities },
    fields: options.fields,
    siteConfig: options.config,
    path: options.path,
    structure: options.structure,
    faq: options.faq,
  })
}
