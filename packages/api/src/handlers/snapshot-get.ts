import type { ApiHandler } from '../types.js'
import { parseCheckpointVersion } from '../validators.js'

/** GET /api/checkpoints/:version — get checkpoint details */
export const snapshotGet: ApiHandler = async (req, ctx) => {
  if (!ctx.checkpointAdapter) {
    return { status: 501, body: { error: 'Checkpoint system not configured' } }
  }

  const parsed = parseCheckpointVersion(req.params)
  if (!parsed.isValid) return parsed.response
  const { version } = parsed

  const checkpoint = await ctx.checkpointAdapter.getCheckpoint(version)
  if (!checkpoint) {
    return { status: 404, body: { error: `Checkpoint version ${version} not found` } }
  }

  return { status: 200, body: checkpoint }
}
