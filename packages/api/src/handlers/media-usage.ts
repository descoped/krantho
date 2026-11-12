import { mediaReferences } from '../media-references.js'
import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED, requireParam } from '../validators.js'

/** The most files one batched usage request may ask about */
const MAX_USAGE_IDS = 200

/** GET /api/media/:id/usage — the documents that use one media file */
export const mediaUsage: ApiHandler = async (req, ctx) => {
  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const item = await ctx.mediaStorage.get(id)
  if (!item) {
    return { status: 404, body: { error: 'Media item not found' } }
  }

  const usage = (await mediaReferences(ctx, [id])).get(id) ?? []
  return { status: 200, body: { id, usage, total: usage.length } }
}

/**
 * GET /api/media/usage?ids=a,b,c — the documents that use each of several
 * media files, reading every collection once: `{ usage: { [id]: [...] } }`
 */
export const mediaUsageBatch: ApiHandler = async (req, ctx) => {
  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const ids = [...new Set((req.query['ids'] ?? '').split(',').filter(Boolean))]
  if (ids.length === 0) return { status: 400, body: { error: '"ids" names the media files' } }
  if (ids.length > MAX_USAGE_IDS) {
    return { status: 400, body: { error: `Ask about ${MAX_USAGE_IDS} files or fewer at once` } }
  }

  const found = await mediaReferences(ctx, ids)
  return { status: 200, body: { usage: Object.fromEntries(found) } }
}
