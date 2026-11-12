import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED } from '../validators.js'

/** GET /api/media/tags — list distinct tags */
export const mediaTags: ApiHandler = async (_req, ctx) => {
  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const tags = await ctx.mediaStorage.listTags()
  return { status: 200, body: { tags } }
}
