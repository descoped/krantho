import { announceChanges } from '../content-change.js'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED } from '../validators.js'

/** DELETE /api/media/bulk — bulk delete media items */
export const mediaBulkDelete: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const body = req.body as { ids?: string[] } | undefined
  if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return { status: 400, body: { error: 'ids array is required' } }
  }

  const result = await ctx.mediaStorage.bulkDelete(body.ids)
  await announceChanges(
    ctx,
    result.deleted.map((id) => ({ kind: 'media', id }) as const),
  )
  return { status: 200, body: result }
}
