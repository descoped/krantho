import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED } from '../validators.js'

/** POST /api/media/register — register an externally-uploaded file */
export const mediaRegister: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') {
    return { status: 400, body: { error: 'Request body is required' } }
  }

  const filename = body.filename
  const url = body.url
  const mimeType = body.mimeType
  const size = body.size

  if (typeof filename !== 'string' || !filename) {
    return { status: 400, body: { error: 'Missing required field: filename' } }
  }
  if (typeof url !== 'string' || !url) {
    return { status: 400, body: { error: 'Missing required field: url' } }
  }
  if (!isAbsoluteHttpUrl(url)) {
    return { status: 400, body: { error: 'url must be an absolute http(s) URL' } }
  }
  if (typeof mimeType !== 'string' || !mimeType) {
    return { status: 400, body: { error: 'Missing required field: mimeType' } }
  }
  if (typeof size !== 'number') {
    return { status: 400, body: { error: 'Missing required field: size' } }
  }

  const width = typeof body.width === 'number' ? body.width : null
  const height = typeof body.height === 'number' ? body.height : null
  const altText = typeof body.altText === 'string' ? body.altText : undefined

  const item = await ctx.mediaStorage.register({
    filename,
    url,
    mimeType,
    size,
    width,
    height,
    altText,
  })

  return { status: 201, body: item }
}

/** A registered file lives elsewhere: only an absolute http(s) URL can be fetched */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
