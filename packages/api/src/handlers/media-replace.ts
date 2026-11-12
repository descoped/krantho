import type { MediaItem } from '@krantho/persistence'
import { announceChange } from '../content-change.js'
import { updateMediaReferences } from '../media-reference-updater.js'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED, requireParam } from '../validators.js'

/**
 * POST /api/media/:id/replace — replace the file, keep the id.
 *
 * The file gets a new url and the old object is deleted, so content that
 * holds the old url (an `og-image`, a body link) is rewritten to the new one.
 */
export const mediaReplace: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const file = req.files?.[0]
  if (!file) {
    return { status: 400, body: { error: 'No file uploaded' } }
  }

  const before = await ctx.mediaStorage.get(id)
  if (!before) return { status: 404, body: { error: 'Media item not found' } }

  let item: MediaItem | null
  try {
    item = await ctx.mediaStorage.replace(id, file.data, file.filename, file.mimeType)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Replace failed'
    return { status: 400, body: { error: message } }
  }
  if (!item) return { status: 404, body: { error: 'Media item not found' } }

  ctx.imageCache?.invalidateSource(id)
  await announceChange(ctx, { kind: 'media', id })

  const { updated, failed } = await updateMediaReferences(
    before.url,
    item.url,
    ctx.adapter,
    ctx.contentConfig,
  )
  // Documents across collections now point at the new url
  if (updated > 0) await announceChange(ctx, { kind: 'site' })
  if (failed.length > 0) {
    const pages = failed.map((page) => `${page.collection}/${page.slug} (${page.locale})`)
    const error = `The file was replaced and ${updated} page(s) use it, but ${failed.length} still point at the old file: ${pages.join(', ')}`
    return { status: 500, body: { error, item, _referencesUpdated: updated, failed } }
  }
  if (updated === 0) return { status: 200, body: item }
  return { status: 200, body: { ...item, _referencesUpdated: updated } }
}
