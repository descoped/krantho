import {
  canQuery,
  hasRuntimeSchema,
  type RepositoryDocument,
  repositoryDocument,
} from '@krantho/persistence'
import { documentChecksum } from '@krantho/schema'
import { requireRole } from '../permissions.js'
import type { ApiHandler, ApiResponse } from '../types.js'

/**
 * GET /api/export/bundle — full-site export as JSON bundle.
 *
 * Returns all collections, media metadata, and schemas as a single JSON response.
 * The client (Studio or CLI) can convert this to a tar.gz/zip with .md files.
 *
 * Content is an array of portable documents per collection, with locale-qualified
 * checksums and runtime definitions for review. Media file bytes and history
 * archives are not included. State selects current drafts or published snapshots.
 */
export const exportBundle: ApiHandler = async (req, ctx): Promise<ApiResponse> => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const state = req.query['state'] ?? 'current'
  if (state !== 'current' && state !== 'published')
    return { status: 400, body: { error: 'State must be current or published' } }
  if (!canQuery(ctx.adapter))
    return { status: 501, body: { error: 'Adapter does not support query' } }

  const now = new Date().toISOString()
  const content: Record<string, RepositoryDocument[]> = {}
  const checksums: Record<string, string> = {}
  const schemas: Record<string, unknown> = {}
  const warnings: Array<{ collection: string; slug: string; field: string; message: string }> = []

  // Export all collections
  for (const [, collectionDef] of ctx.contentConfig.collections) {
    try {
      const { items } = await ctx.adapter.query({
        state,
        projection: 'full',
        collections: [collectionDef.name],
      })
      content[collectionDef.name] = items.map((item) => {
        const checksum = documentChecksum(item)
        checksums[`${collectionDef.name}/${item.meta.locale}/${item.meta.slug}`] = checksum
        return repositoryDocument(item, checksum)
      })

      // Export runtime schema if available
      if (hasRuntimeSchema(ctx.adapter)) {
        const schema = await ctx.adapter.getRuntimeSchema(collectionDef.name)
        if (schema) {
          schemas[collectionDef.name] = schema
        }
      }
    } catch (err: unknown) {
      return {
        status: 500,
        body: {
          error: `Failed to export collection "${collectionDef.name}": ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      }
    }
  }

  // Export media metadata with download URLs for each item.
  // Actual file bytes are not included in the JSON bundle — the client
  // downloads them separately using the provided URLs.
  const MEDIA_EXPORT_LIMIT = 10000
  let media: { items: unknown[]; total: number } = { items: [], total: 0 }
  if (ctx.mediaStorage) {
    try {
      media = await ctx.mediaStorage.list({ limit: MEDIA_EXPORT_LIMIT })
      if (media.total > MEDIA_EXPORT_LIMIT) {
        warnings.push({
          collection: '_media',
          slug: '_all',
          field: '_count',
          message: `Media export truncated: ${media.total} items, only ${MEDIA_EXPORT_LIMIT} exported`,
        })
      }
    } catch {
      // Media export is non-critical — continue with empty media
    }
  }

  // Compute manifest version (increment from current DB version)
  let manifestVersion = 1
  if (ctx.contentMigrationAdapter) {
    const dbVersion = await ctx.contentMigrationAdapter.getContentManifestVersion()
    manifestVersion = (dbVersion ?? 0) + 1
  }

  return {
    status: 200,
    body: {
      version: manifestVersion,
      state,
      timestamp: now,
      content,
      media: { items: media.items },
      schemas,
      checksums,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
  }
}
