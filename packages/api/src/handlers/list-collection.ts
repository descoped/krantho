import type { ApiHandler } from '../types.js'
import { validateCollectionParam } from '../validators.js'
import { listPage } from './list-query.js'

/**
 * GET /api/content/:collection — filtered, sorted, paged list answering `{ items, hasMore }`.
 * `view=summary` lists each document's meta and fields without its body, HTML or sections;
 * `view=meta` lists the meta alone: what a screen that shows rows needs, at a fraction of the size.
 */
export const listCollection: ApiHandler = async (req, ctx) => {
  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response
  return listPage(req.query, ctx, [validated.collection])
}
