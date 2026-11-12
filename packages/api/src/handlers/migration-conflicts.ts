import type { ConflictResolution, IContentMigrationAdapter } from '@krantho/persistence'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { requireParam } from '../validators.js'

/** Type guard for content migration adapter */
function getContentMigration(ctx: {
  contentMigrationAdapter?: IContentMigrationAdapter | undefined
}): IContentMigrationAdapter | null {
  return ctx.contentMigrationAdapter ?? null
}

/** GET /api/migrations/conflicts — list unresolved conflicts; needs an editor */
export const migrationConflicts: ApiHandler = async (_req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied
  const adapter = getContentMigration(ctx as { contentMigrationAdapter?: IContentMigrationAdapter })
  if (!adapter) {
    return { status: 501, body: { error: 'Content migration not configured' } }
  }

  const conflicts = await adapter.listConflicts()
  return { status: 200, body: { conflicts, total: conflicts.length } }
}

/**
 * POST /api/migrations/conflicts/:id/resolve — resolve a conflict.
 *
 * - `keep_db`: marks the conflict resolved, DB content stays as-is.
 * - `use_repo`: marks the conflict resolved as a flag. The repo content
 *   will be applied on the next deployment when the manifest version is
 *   bumped and the migration runner imports the file.
 */
export const resolveConflict: ApiHandler = async (req, ctx) => {
  // Deciding which version stands overrides a deployment, as a restore does: an admin's call
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied
  const adapter = getContentMigration(ctx as { contentMigrationAdapter?: IContentMigrationAdapter })
  if (!adapter) {
    return { status: 501, body: { error: 'Content migration not configured' } }
  }

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const idStr = idResult.value

  const id = parseInt(idStr, 10)
  if (Number.isNaN(id)) {
    return { status: 400, body: { error: 'Invalid conflict ID' } }
  }

  const body = req.body as { resolution?: string } | undefined
  const resolution = body?.resolution
  if (resolution !== 'keep_db' && resolution !== 'use_repo') {
    return { status: 400, body: { error: 'Resolution must be "keep_db" or "use_repo"' } }
  }

  const resolved = await adapter.resolveConflict(id, resolution as ConflictResolution)
  if (!resolved) {
    return { status: 404, body: { error: `Conflict ${id} not found or already resolved` } }
  }

  return { status: 200, body: { resolved: true, id, resolution } }
}
