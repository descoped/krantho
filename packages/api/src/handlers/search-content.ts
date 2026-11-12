import { canQuery } from '@krantho/persistence'
import type { ApiHandler } from '../types.js'
import { parseLocaleParam, parsePositiveInt } from '../validators.js'

/**
 * GET /api/content/search?q=term&limit=N&offset=N&locale=xx — search every collection
 *
 * One `query` matches the text in the slug, the fields and the body, and answers a page of
 * `{ meta, fields, snippet }` with `hasMore`: never the body, HTML or sections.
 */
export const searchContent: ApiHandler = async (req, ctx) => {
  const search = ctx.config.content.search
  const text = req.query['q']?.trim()
  if (!text || text.length < search.minQueryLength) {
    return {
      status: 400,
      body: { error: `Search query must be at least ${search.minQueryLength} characters` },
    }
  }

  const requestedLimit = parsePositiveInt(req.query['limit']) ?? search.defaultLimit
  const limit = Math.min(requestedLimit, search.maxLimit)

  if (!canQuery(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support query' } }
  }

  const page = await ctx.adapter.query({
    state: 'current',
    collections: [...ctx.contentConfig.collections.keys()],
    projection: 'summary',
    match: { text, in: ['slug', 'fields', 'body'] },
    locale: parseLocaleParam(req.query['locale']),
    limit,
    offset: parsePositiveInt(req.query['offset']),
  })
  return {
    status: 200,
    body: {
      items: page.items.map(({ meta, fields, snippet }) => ({ meta, fields, snippet })),
      hasMore: page.hasMore,
    },
  }
}
