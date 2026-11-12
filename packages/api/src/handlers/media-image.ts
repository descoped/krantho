import type { MediaItem } from '@krantho/persistence'
import { computeEtag } from '../image-optimizer.js'
import type { ImageFormat } from '../image-presets.js'
import type { ImageVariant } from '../image-url.js'
import { imageRevision, resolveVariant, variantCacheKey, variantUrl } from '../image-url.js'
import type { ApiContext, ApiHandler, ApiRequest, ApiResponse } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED, requireParam } from '../validators.js'

/** A versioned URL never changes content, so any cache may keep it for a year */
const IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable'

const ORIGINAL_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: 'Original file not found' },
}

/** The context a variant is rendered in: storage, optimizer and cache all present */
type ImageContext = ApiContext & {
  mediaStorage: NonNullable<ApiContext['mediaStorage']>
  imageOptimizer: NonNullable<ApiContext['imageOptimizer']>
  imageCache: NonNullable<ApiContext['imageCache']>
}

/**
 * GET|HEAD /api/media/:id/image — an image variant.
 *
 * Without `rev` (the stable URL content embeds) it answers an uncached 302 to
 * the versioned URL of the current revision, negotiating the format there. With
 * the current `rev` and an explicit `fmt` it serves the bytes as immutable; a
 * stale revision redirects to the current one.
 */
export const mediaImage: ApiHandler = async (req, ctx) => {
  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED
  if (!ctx.imageOptimizer || !ctx.imageCache) {
    return { status: 501, body: { error: 'Image optimizer not configured' } }
  }

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response

  const item = await ctx.mediaStorage.get(idResult.value)
  if (!item) return { status: 404, body: { error: 'Media item not found' } }

  const variant = resolveVariant(item, req.query, req.headers)
  const rev = imageRevision(item)
  if (req.query['rev'] !== rev || req.query['fmt'] !== variant.format) {
    return redirectToVariant(item.id, variant, rev)
  }

  const imageCtx: ImageContext = {
    ...ctx,
    imageOptimizer: ctx.imageOptimizer,
    imageCache: ctx.imageCache,
  }
  if (variant.format === 'original') return serveSvg(req, imageCtx, item)
  return serveVariant(req, imageCtx, item, { ...variant, format: variant.format }, rev)
}

/** 302 to the versioned URL; never cached, and its target depends on Accept */
function redirectToVariant(id: string, variant: ImageVariant, rev: string): ApiResponse {
  return {
    status: 302,
    body: null,
    headers: {
      location: variantUrl(id, variant, rev),
      'cache-control': 'no-cache',
      vary: 'Accept',
    },
  }
}

/** A raster variant at the current revision, from the cache or rendered now */
async function serveVariant(
  req: ApiRequest,
  ctx: ImageContext,
  item: MediaItem,
  variant: ImageVariant & { format: ImageFormat },
  rev: string,
): Promise<ApiResponse> {
  const cacheKey = variantCacheKey(item.id, variant, rev)
  const cached = ctx.imageCache.get(cacheKey)
  if (cached) return bytesResponse(req, cached.bytes, cached.contentType, cached.etag)

  const original = await readOriginal(ctx, item.id)
  if (!original.ok) return original.response

  try {
    const rendered = await ctx.imageOptimizer.generateVariant(
      original.bytes,
      variant.preset,
      variant.format,
      {
        crop: item.crop ?? undefined,
        hotspot: item.hotspot ?? undefined,
        aspectRatio: variant.aspect,
      },
    )
    const etag = computeEtag(rendered.bytes)
    ctx.imageCache.set(cacheKey, { bytes: rendered.bytes, contentType: rendered.contentType, etag })
    return bytesResponse(req, rendered.bytes, rendered.contentType, etag)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Image processing failed'
    return { status: 500, body: { error: message } }
  }
}

/** An SVG as stored: it scales by itself, so there is nothing to render */
async function serveSvg(req: ApiRequest, ctx: ImageContext, item: MediaItem): Promise<ApiResponse> {
  const original = await readOriginal(ctx, item.id)
  if (!original.ok) return original.response
  return bytesResponse(req, original.bytes, 'image/svg+xml', computeEtag(original.bytes))
}

type OriginalResult = { ok: true; bytes: Uint8Array } | { ok: false; response: ApiResponse }

async function readOriginal(ctx: ImageContext, id: string): Promise<OriginalResult> {
  try {
    const bytes = await ctx.mediaStorage.readOriginal(id)
    return bytes ? { ok: true, bytes } : { ok: false, response: ORIGINAL_NOT_FOUND }
  } catch {
    return {
      ok: false,
      response: { status: 500, body: { error: 'Failed to load original image' } },
    }
  }
}

/** 200 with immutable caching and an ETag, or 304 when the client already has it */
function bytesResponse(
  req: ApiRequest,
  bytes: Uint8Array,
  contentType: string,
  etag: string,
): ApiResponse {
  const quoted = `"${etag}"`
  if (req.headers?.['if-none-match'] === quoted) {
    return { status: 304, body: null, headers: { etag: quoted, 'cache-control': IMMUTABLE } }
  }
  return {
    status: 200,
    body: req.method === 'HEAD' ? null : bytes,
    headers: {
      'content-type': contentType,
      'content-length': String(bytes.byteLength),
      'cache-control': IMMUTABLE,
      etag: quoted,
    },
  }
}
