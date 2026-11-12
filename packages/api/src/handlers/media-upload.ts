import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED } from '../validators.js'

/** POST /api/media/upload — upload a file */
export const mediaUpload: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  if (!req.files || req.files.length === 0) {
    return { status: 400, body: { error: 'No file provided' } }
  }

  const file = req.files[0]
  if (!file) {
    return { status: 400, body: { error: 'No file provided' } }
  }

  try {
    const item = await ctx.mediaStorage.upload(file.data, file.filename, file.mimeType)
    return { status: 201, body: item }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return { status: 400, body: { error: message } }
  }
}
