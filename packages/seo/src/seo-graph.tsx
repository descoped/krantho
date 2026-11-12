import type { PageStructure } from '@krantho/core'
import { serializeJsonLd } from '@krantho/seo-shared'
import type { Archetype } from './archetypes/types.js'
import { composeGraph } from './graph/compose-graph.js'
import type { SeoGraphConfig } from './graph/types.js'

export interface SEOGraphProps {
  /** The archetype defining which schemas to render */
  archetype: Archetype
  /** Page fields (already resolved by resolvePageContent) */
  fields: Record<string, unknown>
  /** Site configuration from krantho.config.ts */
  config: SeoGraphConfig
  /** Current page path, e.g., '/about' */
  path: string
  /** The structure the page renders: its trail, its place in a sequence, its kind */
  structure?: PageStructure | undefined
  /** Optional FAQ pairs */
  faq?: ReadonlyArray<{ question: string; answer: string }> | undefined
}

/**
 * Renders a composed `@graph` JSON-LD block from an archetype and page data.
 *
 * Replaces manual composition of individual schema components
 * (BusinessStructuredData, BreadcrumbJsonLd, FAQSchema) with a single
 * declarative component.
 *
 * @example
 * ```tsx
 * <SEOGraph
 *   archetype={homePageArchetype}
 *   fields={content.hero.fields}
 *   config={siteConfig}
 *   path="/"
 * />
 * ```
 */
export function SEOGraph(props: SEOGraphProps): React.JSX.Element {
  const graph = composeGraph({
    archetype: props.archetype,
    fields: props.fields,
    config: props.config,
    path: props.path,
    structure: props.structure,
    faq: props.faq,
  })

  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes `<`, so the JSON cannot end the script tag
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }}
    />
  )
}
