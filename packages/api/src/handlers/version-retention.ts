import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { validateRequestBody } from '../validators.js'

/** GET /api/versions/stats — version count statistics */
export const versionStats: ApiHandler = async (_req, ctx) => {
  if (!ctx.retentionAdapter) {
    return { status: 501, body: { error: 'Version retention not available' } }
  }

  const stats = await ctx.retentionAdapter.countVersions()
  return { status: 200, body: stats }
}

/** POST /api/versions/purge — purge old versions */
export const versionPurge: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.retentionAdapter) {
    return { status: 501, body: { error: 'Version retention not available' } }
  }

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  const payload = bodyCheck.body as Record<string, unknown>
  const keepVersions =
    typeof payload['keepVersions'] === 'number'
      ? payload['keepVersions']
      : ctx.config.content.versions.keep

  if (keepVersions < 1) {
    return { status: 400, body: { error: 'keepVersions must be at least 1' } }
  }

  const results = await ctx.retentionAdapter.purgeVersions(keepVersions)
  const totalPurged = results.reduce((sum, r) => sum + r.purged, 0)

  return {
    status: 200,
    body: {
      keepVersions,
      totalPurged,
      items: results,
    },
  }
}
