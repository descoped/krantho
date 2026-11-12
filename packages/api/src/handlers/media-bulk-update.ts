import { announceChanges } from '../content-change.js'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED } from '../validators.js'

/** PUT /api/media/bulk — bulk update alt text */
export const mediaBulkUpdate: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const body = req.body as { ids?: string[]; altText?: string } | undefined
  if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return { status: 400, body: { error: 'ids array is required' } }
  }
  if (typeof body.altText !== 'string') {
    return { status: 400, body: { error: 'altText string is required' } }
  }

  const updated = await ctx.mediaStorage.bulkUpdateAltText(body.ids, body.altText)
  // The storage reports only a count, so every requested asset is announced
  if (updated > 0) {
    await announceChanges(
      ctx,
      body.ids.map((id) => ({ kind: 'media', id }) as const),
    )
  }
  return { status: 200, body: { updated } }
}
