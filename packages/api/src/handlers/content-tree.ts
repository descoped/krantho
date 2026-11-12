import { canQuery } from '@krantho/persistence'
import { groupByCollection } from '../group-by-collection.js'
import type { ApiHandler } from '../types.js'
import { parseLocaleParam } from '../validators.js'

/**
 * GET /api/content-tree — the current version of every document of every collection, by
 * collection in the order they are defined (`?locale=`, every locale when absent): which
 * documents there are, in what state. Studio's site tree reads it. It carries no content —
 * no body, rendered HTML or fields — so it weighs a few hundred bytes a document and can be
 * read often; `GET /api/content/:collection` carries all of it. One adapter `query` serves
 * every collection.
 */
export const listContentTree: ApiHandler = async (req, ctx) => {
  if (!canQuery(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support query' } }
  }
  const names = [...ctx.contentConfig.collections.keys()]
  const { items } = await ctx.adapter.query({
    state: 'current',
    projection: 'meta',
    collections: names,
    sort: 'slug',
    locale: parseLocaleParam(req.query['locale']),
  })
  const documents = groupByCollection(items, names, (meta) => meta.collection)
  const collections = names.map((name) => ({ name, documents: documents.get(name) ?? [] }))

  return { status: 200, body: { collections } }
}
