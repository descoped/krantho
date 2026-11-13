import type { MediaUpdateData } from '@krantho/persistence'
import { announceChange } from '../content-change.js'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import {
  hasMediaStorage,
  MEDIA_NOT_CONFIGURED,
  requireParam,
  validateCrop,
  validateHotspot,
} from '../validators.js'

/** PUT /api/media/:id — update media metadata */
export const mediaUpdate: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') {
    return { status: 400, body: { error: 'Request body is required' } }
  }

  const updates: MediaUpdateData = {}

  if (typeof body.altText === 'string') updates.altText = body.altText
  if (typeof body.folder === 'string' || body.folder === null)
    updates.folder = body.folder as string | null
  if (Array.isArray(body.tags)) {
    const tags = body.tags.filter((t): t is string => typeof t === 'string')
    updates.tags = tags
  }
  if (body.crop !== undefined) {
    if (body.crop === null) {
      updates.crop = null
    } else {
      const cropResult = validateCrop(body.crop)
      if (!cropResult.isValid) {
        return { status: 400, body: { error: cropResult.error } }
      }
      updates.crop = cropResult.crop
    }
  }
  if (body.hotspot !== undefined) {
    if (body.hotspot === null) {
      updates.hotspot = null
    } else {
      const hotspotResult = validateHotspot(body.hotspot)
      if (!hotspotResult.isValid) {
        return { status: 400, body: { error: hotspotResult.error } }
      }
      updates.hotspot = hotspotResult.hotspot
    }
  }
  if (typeof body.filename === 'string') updates.filename = body.filename

  const item = await ctx.mediaStorage.update(id, updates)
  if (!item) {
    return { status: 404, body: { error: 'Media item not found' } }
  }

  if (updates.crop !== undefined || updates.hotspot !== undefined) {
    ctx.imageCache?.invalidateSource(id)
  }
  await announceChange(ctx, { kind: 'media', id })

  return { status: 200, body: item }
}
