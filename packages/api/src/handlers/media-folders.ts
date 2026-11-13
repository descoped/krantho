import { requireRole } from '../permissions.js'
import type { ApiHandler, ApiResponse } from '../types.js'
import {
  hasMediaStorage,
  MEDIA_NOT_CONFIGURED,
  requireParam,
  validateRequestBody,
} from '../validators.js'

const FOLDERS_NOT_CONFIGURED: ApiResponse = {
  status: 501,
  body: { error: 'Media folder storage not configured' },
}

/** GET /api/media/folders — list folder tree */
export const mediaFolders: ApiHandler = async (_req, ctx) => {
  if (!ctx.mediaFolderStorage) return FOLDERS_NOT_CONFIGURED

  const folders = await ctx.mediaFolderStorage.listFolders()
  return { status: 200, body: { folders } }
}

/** POST /api/media/folders — create folder */
export const mediaFolderCreate: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!ctx.mediaFolderStorage) return FOLDERS_NOT_CONFIGURED

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  const payload = bodyCheck.body as Record<string, unknown>
  const name = payload.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { status: 400, body: { error: 'Folder name is required' } }
  }

  const parentId = typeof payload.parentId === 'string' ? payload.parentId : null

  try {
    const folder = await ctx.mediaFolderStorage.createFolder(name, parentId)
    return { status: 201, body: folder }
  } catch (err: unknown) {
    return {
      status: 400,
      body: { error: err instanceof Error ? err.message : 'Failed to create folder' },
    }
  }
}

/** PUT /api/media/folders/:id — rename folder */
export const mediaFolderRename: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!ctx.mediaFolderStorage) return FOLDERS_NOT_CONFIGURED

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  const payload = bodyCheck.body as Record<string, unknown>
  const name = payload.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { status: 400, body: { error: 'Folder name is required' } }
  }

  const folder = await ctx.mediaFolderStorage.renameFolder(id, name)
  if (!folder) {
    return { status: 404, body: { error: 'Folder not found' } }
  }

  return { status: 200, body: folder }
}

/** DELETE /api/media/folders/:id — delete empty folder */
export const mediaFolderDelete: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.mediaFolderStorage) return FOLDERS_NOT_CONFIGURED

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  try {
    await ctx.mediaFolderStorage.deleteFolder(id)
    return { status: 200, body: { id, message: 'Deleted' } }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete folder'
    if (message.includes('not found')) {
      return { status: 404, body: { error: message } }
    }
    return { status: 409, body: { error: message } }
  }
}

/** PUT /api/media/:id/move — move media item to a folder */
export const mediaMove: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  if (!hasMediaStorage(ctx)) return MEDIA_NOT_CONFIGURED

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  const payload = bodyCheck.body as Record<string, unknown>
  const folderId = typeof payload.folderId === 'string' ? payload.folderId : null

  // Validate folder exists (if moving to a folder, not root)
  if (folderId && ctx.mediaFolderStorage) {
    const folders = await ctx.mediaFolderStorage.listFolders()
    const exists = folders.some((f) => f.id === folderId)
    if (!exists) {
      return { status: 404, body: { error: 'Target folder not found' } }
    }
  }

  const item = await ctx.mediaStorage.update(id, { folder: folderId })
  if (!item) {
    return { status: 404, body: { error: 'Media item not found' } }
  }

  return { status: 200, body: item }
}
