import { type PublishedContent, resolvePageContent } from '@krantho/core'
import type { ApiHandler } from '../types.js'

/**
 * GET /api/page?route=/path — resolve definePage composition.
 *
 * Matches the route against registered page definitions and resolves
 * all content references (slug, sections, collection) in parallel.
 */
export const resolvePageRoute: ApiHandler = async (req, ctx) => {
  const route = req.query['route']
  if (!route) {
    return { status: 400, body: { error: 'Missing "route" query parameter' } }
  }

  if (!ctx.pages || ctx.pages.length === 0) {
    return {
      status: 501,
      body: { error: 'No page definitions registered. Pass pages to server config.' },
    }
  }

  // Find matching page definition
  const page = ctx.pages.find((p) => matchRoute(p.route, route))
  if (!page) {
    return { status: 404, body: { error: `No page definition matches route "${route}"` } }
  }

  // Extract dynamic params from route (e.g., /blog/:slug → { slug: 'my-post' })
  const params = extractParams(page.route, route)

  const getPublished = ctx.adapter.getPublished?.bind(ctx.adapter)
  const query = ctx.adapter.query?.bind(ctx.adapter)
  if (!getPublished || !query)
    return { status: 501, body: { error: 'Page composition requires published document reads' } }
  const published = (
    document: Awaited<ReturnType<typeof getPublished>>,
  ): PublishedContent | null =>
    document
      ? {
          collection: document.meta.collection,
          slug: document.meta.slug,
          locale: document.meta.locale,
          fields: document.fields,
          metadata: document.metadata,
          body: document.body,
          publishedAt: new Date(document.meta.createdAt),
        }
      : null
  const resolved = await resolvePageContent(
    page,
    {
      loader: {
        getPublished: async (ref) =>
          published(await getPublished(ref.collection, ref.slug, ref.locale)),
        listPublished: async (collection, locale) => {
          const { items } = await query({
            state: 'published',
            projection: 'full',
            collections: [collection],
            locale,
          })
          return items.map((doc) => published(doc) as PublishedContent)
        },
        listPublishedSummaries: async (collection, locale) => {
          const { items } = await query({
            state: 'published',
            projection: 'summary',
            collections: [collection],
            locale,
          })
          return items.map((doc) => ({
            collection: doc.meta.collection,
            slug: doc.meta.slug,
            locale: doc.meta.locale,
            fields: doc.fields,
            metadata: doc.metadata,
            publishedAt: new Date(doc.meta.createdAt),
          }))
        },
        isPreview: async () => false,
      },
    },
    params,
  )

  return { status: 200, body: { route, page: page.route, content: resolved } }
}

/** Check if a route pattern matches a request path */
function matchRoute(pattern: string, path: string): boolean {
  const patternParts = pattern.split('/')
  const pathParts = path.split('/')

  if (patternParts.length !== pathParts.length) return false

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    if (!pp) continue
    if (pp.startsWith(':')) continue // dynamic param — matches anything
    if (pp !== pathParts[i]) return false
  }

  return true
}

/** Extract dynamic params from a matched route */
function extractParams(pattern: string, path: string): Record<string, string> {
  const params: Record<string, string> = {}
  const patternParts = pattern.split('/')
  const pathParts = path.split('/')

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    const value = pathParts[i]
    if (pp && pp.startsWith(':') && value) {
      params[pp.slice(1)] = value
    }
  }

  return params
}
