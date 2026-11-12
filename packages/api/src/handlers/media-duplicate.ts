import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED, requireParam } from '../validators.js'

/** POST /api/media/:id/duplicate — create a copy with new ID */
export const mediaDuplicate: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const item = await ctx.mediaStorage.duplicate(id)
  if (!item) {
    return { status: 404, body: { error: 'Media item not found' } }
  }

  return { status: 201, body: item }
}
