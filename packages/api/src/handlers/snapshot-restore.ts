import { announceChange } from '../content-change.js'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { parseCheckpointVersion } from '../validators.js'

/** POST /api/checkpoints/:version/restore — restore from a checkpoint */
export const snapshotRestore: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.checkpointAdapter) {
    return { status: 501, body: { error: 'Checkpoint system not configured' } }
  }

  const parsed = parseCheckpointVersion(req.params)
  if (!parsed.isValid) return parsed.response
  const { version } = parsed

  try {
    const restored = await ctx.checkpointAdapter.restoreCheckpoint(version)
    await announceChange(ctx, { kind: 'site' })
    return { status: 200, body: { restored, message: `Restored from checkpoint v${version}` } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Restore failed'
    const isNotFound = message.includes('not found')
    return { status: isNotFound ? 404 : 500, body: { error: message } }
  }
}
