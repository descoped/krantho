import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'

/** POST /api/checkpoints — create a manual checkpoint */
export const snapshotCreate: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!ctx.checkpointAdapter) {
    return { status: 501, body: { error: 'Checkpoint system not configured' } }
  }

  const body = req.body as { name?: string } | undefined
  const name = typeof body?.name === 'string' ? body.name : undefined

  const checkpoint = await ctx.checkpointAdapter.createCheckpoint(name, 'manual')
  return { status: 201, body: checkpoint }
}
