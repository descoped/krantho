import type { ApiHandler } from '../types.js'

/** GET /api/migrations/status — full migration and content version status */
export const migrationStatus: ApiHandler = async (_req, ctx) => {
  let repoContentVersion: number | null = null
  let dbContentVersion: number | null = null
  let unresolvedConflicts = 0

  if (ctx.contentMigrationAdapter) {
    dbContentVersion = await ctx.contentMigrationAdapter.getContentManifestVersion()
    const conflicts = await ctx.contentMigrationAdapter.listConflicts()
    unresolvedConflicts = conflicts.length
  }

  // Try to read repo manifest for the version
  try {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const raw = await readFile(join(ctx.config.paths.contentDir, 'manifest.json'), 'utf-8')
    const manifest = JSON.parse(raw) as { version: number }
    repoContentVersion = manifest.version
  } catch {
    // No manifest file — that's fine
  }

  return {
    status: 200,
    body: {
      schemaVersion: ctx.schemaVersion ?? 0,
      checkpointEnabled: ctx.checkpointAdapter !== undefined,
      contentMigrationEnabled: ctx.contentMigrationAdapter !== undefined,
      repoContentVersion,
      dbContentVersion,
      unresolvedConflicts,
    },
  }
}
