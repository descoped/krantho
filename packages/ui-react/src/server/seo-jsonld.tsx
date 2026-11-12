import type { PageStructure } from '@krantho/core'
import { serializeJsonLd } from '@krantho/seo-shared'
import { cache } from 'react'
import { getServerLoader } from './content-loader.js'

/** One composition per page render; React's cache matches arguments by identity, so the structure travels as JSON */
const composeJsonLd = cache(
  async (
    collection: string,
    slug: string,
    locale: string | undefined,
    structure: string | undefined,
  ): Promise<Record<string, unknown> | null> => {
    const shape = structure ? (JSON.parse(structure) as PageStructure) : undefined
    try {
      return (await getServerLoader().jsonLd?.({ collection, slug, locale }, shape)) ?? null
    } catch (error) {
      console.error(`[krantho] JSON-LD for ${collection}/${slug} could not be composed:`, error)
      return null
    }
  },
)

/**
 * Resolve the complete JSON-LD graph for a page, composed from its published
 * version: site-level (ProfessionalService, WebSite, Person) + collection-level
 * (Article, Service) + document-level overrides — all in a single @graph, with
 * the page node and what the page's structure states (its trail, its place in
 * a sequence, its kind). Null when the document has no published version, or
 * the loader serves no SEO.
 */
export function resolveJsonLd(
  collection: string,
  slug: string,
  locale?: string | undefined,
  structure?: PageStructure | undefined,
): Promise<Record<string, unknown> | null> {
  return composeJsonLd(collection, slug, locale, structure ? JSON.stringify(structure) : undefined)
}

/**
 * Render the complete JSON-LD structured data for a page.
 *
 * One component, one @graph — contains all entities from the full
 * SEO hierarchy (site → collection → document). Place in each page, and pass
 * the structure the page renders — the trail of its breadcrumb, its place in a
 * sequence, its kind — so the structured data states what the page shows.
 *
 * The layout does NOT render JSON-LD. Each page owns its complete graph.
 */
export async function SeoJsonLd({
  collection,
  slug,
  locale,
  structure,
}: {
  collection: string
  slug: string
  locale?: string | undefined
  structure?: PageStructure | undefined
}): Promise<React.ReactElement | null> {
  const graph = await resolveJsonLd(collection, slug, locale, structure)
  if (!graph) return null

  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes `<`, so the JSON cannot end the script tag
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }}
    />
  )
}
