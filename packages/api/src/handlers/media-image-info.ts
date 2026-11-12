import { imageRevision, resolveVariant, variantCacheKey } from '../image-url.js'
import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED, requireParam } from '../validators.js'

/** GET /api/media/:id/image/info — variant metadata from cache (no image bytes) */
export const mediaImageInfo: ApiHandler = async (req, ctx) => {
  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED
  if (!ctx.imageCache) {
    return { status: 501, body: { error: 'Image optimizer not configured' } }
  }

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response

  const item = await ctx.mediaStorage.get(idResult.value)
  if (!item) return { status: 404, body: { error: 'Media item not found' } }

  const variant = resolveVariant(item, req.query, req.headers)
  const cached = ctx.imageCache.get(variantCacheKey(item.id, variant, imageRevision(item)))
  if (!cached) {
    return { status: 404, body: { error: 'Variant not cached — request the image first' } }
  }

  return {
    status: 200,
    body: {
      preset: variant.preset,
      format: variant.format,
      contentType: cached.contentType,
      bytes: cached.bytes.byteLength,
      etag: cached.etag,
    },
  }
}
