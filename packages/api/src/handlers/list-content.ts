import type { ApiHandler } from '../types.js'
import { listPage } from './list-query.js'

/**
 * GET /api/content — the same list across collections: `?collections=a,b` (every configured
 * collection when absent), `view`, `status`, `locale`, `sort`, `limit` and `offset`. Answers
 * `{ items, hasMore }`; an unknown collection is a 400.
 */
export const listContent: ApiHandler = async (req, ctx) => {
  const names = (req.query.collections ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
  const unknown = names.filter((name) => !ctx.contentConfig.collections.has(name))
  if (unknown.length > 0) {
    return {
      status: 400,
      body: { error: `Unknown collection: ${unknown.join(', ')}` },
    }
  }
  const collections = names.length > 0 ? names : [...ctx.contentConfig.collections.keys()]
  return listPage(req.query, ctx, collections)
}
