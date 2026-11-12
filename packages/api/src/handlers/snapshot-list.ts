import type { ApiHandler } from '../types.js'

/** GET /api/checkpoints — list all checkpoints */
export const snapshotList: ApiHandler = async (_req, ctx) => {
  if (!ctx.checkpointAdapter) {
    return { status: 501, body: { error: 'Checkpoint system not configured' } }
  }

  const checkpoints = await ctx.checkpointAdapter.listCheckpoints()
  return { status: 200, body: { checkpoints } }
}
