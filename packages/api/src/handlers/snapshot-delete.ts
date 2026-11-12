import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { parseCheckpointVersion } from '../validators.js'

/** DELETE /api/checkpoints/:version — delete a checkpoint */
export const snapshotDelete: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.checkpointAdapter) {
    return { status: 501, body: { error: 'Checkpoint system not configured' } }
  }

  const parsed = parseCheckpointVersion(req.params)
  if (!parsed.isValid) return parsed.response
  const { version } = parsed

  const deleted = await ctx.checkpointAdapter.deleteCheckpoint(version)
  if (!deleted) {
    return { status: 404, body: { error: `Checkpoint version ${version} not found` } }
  }

  return { status: 200, body: { deleted: true, version } }
}
