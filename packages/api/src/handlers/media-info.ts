import type { ApiHandler } from '../types.js'
import { hasMediaStorage, MEDIA_NOT_CONFIGURED } from '../validators.js'

/** GET /api/media/info — the store, and the library's exact figures: files, bytes and each folder's count */
export const mediaInfo: ApiHandler = async (_req, ctx) => {
  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const stats = await ctx.mediaStorage.stats()

  return {
    status: 200,
    body: {
      totalItems: stats.totalItems,
      totalSize: stats.totalSize,
      folderCounts: stats.byFolder,
      storageLabel: ctx.mediaStorageLabel ?? 'Local filesystem',
      storagePath: ctx.mediaStoragePath ?? null,
    },
  }
}
