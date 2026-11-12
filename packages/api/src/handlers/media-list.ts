import type { ApiHandler } from '../types.js'
import {
  applyListLimit,
  hasMediaStorage,
  MEDIA_NOT_CONFIGURED,
  parsePositiveInt,
} from '../validators.js'

/** GET /api/media — list media with pagination and search */
export const mediaList: ApiHandler = async (req, ctx) => {
  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const limit = applyListLimit(
    parsePositiveInt(req.query['limit']),
    ctx.config.content.list.maxLimit,
  )
  const offset = parsePositiveInt(req.query['offset'])
  const search = req.query['search']
  const folder = req.query['folder']
  const tag = req.query['tag']

  const result = await ctx.mediaStorage.list({ limit, offset, search, folder, tag })

  return { status: 200, body: { items: result.items, total: result.total } }
}
