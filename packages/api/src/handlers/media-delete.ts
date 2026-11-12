import { announceChange } from '../content-change.js'
import { mediaReferences } from '../media-references.js'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED, requireParam } from '../validators.js'

/** DELETE /api/media/:id — delete a media item (warns if referenced) */
export const mediaDelete: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  // Report where the file was used: those documents now point at a file that is gone
  const references = (await mediaReferences(ctx, [id])).get(id) ?? []

  await ctx.mediaStorage.delete(id)
  await announceChange(ctx, { kind: 'media', id })

  const result: Record<string, unknown> = { message: 'Deleted' }
  if (references.length > 0) {
    result['warning'] = 'Media was referenced by content items'
    result['references'] = references
  }

  return { status: 200, body: result }
}
