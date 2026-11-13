import { canQuery, type QueryProjection } from '@krantho/persistence'
import type { ApiContext, ApiResponse } from '../types.js'
import {
  applyListLimit,
  parseLocaleParam,
  parsePositiveInt,
  parseStatusParam,
} from '../validators.js'

/** The projection a `view` query parameter names: `summary`, `meta`, else the whole document */
function projectionOf(view: string | undefined): QueryProjection | undefined {
  if (view === undefined) return 'full'
  if (view === 'summary' || view === 'meta') return view
  return undefined
}

/**
 * One page of the current versions of `collections`, read as one adapter `query`, answered as
 * `{ items, hasMore }`. Shared by `GET /api/content/:collection` and `GET /api/content`.
 */
export async function listPage(
  query: Record<string, string | undefined>,
  ctx: ApiContext,
  collections: readonly string[],
): Promise<ApiResponse> {
  const projection = projectionOf(query.view)
  if (!projection) {
    return { status: 400, body: { error: "view must be 'summary' or 'meta' when given" } }
  }
  const { adapter } = ctx
  if (!canQuery(adapter)) {
    return { status: 501, body: { error: 'Adapter does not support query' } }
  }

  const page = await adapter.query({
    state: 'current',
    collections,
    projection,
    status: parseStatusParam(query.status),
    sort: query.sort,
    limit: applyListLimit(parsePositiveInt(query.limit), ctx.config.content.list.maxLimit),
    offset: parsePositiveInt(query.offset),
    locale: parseLocaleParam(query.locale),
  })
  return { status: 200, body: { items: page.items, hasMore: page.hasMore } }
}
