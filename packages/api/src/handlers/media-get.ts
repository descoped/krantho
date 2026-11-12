import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED, requireParam } from '../validators.js'

/** GET /api/media/:id — get a single media item */
export const mediaGet: ApiHandler = async (req, ctx) => {
  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const item = await ctx.mediaStorage.get(id)
  if (!item) {
    return { status: 404, body: { error: 'Media item not found' } }
  }

  return { status: 200, body: item }
}
