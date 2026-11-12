import { BASE, request } from './api-client.js'
import type {
  MediaCrop,
  MediaFolder,
  MediaHotspot,
  MediaInfo,
  MediaItem,
  MediaListResult,
  MediaReference,
  MediaUsage,
  ReplacedMedia,
} from './api-types.js'

/** Fetch media items with pagination and search */
export async function fetchMedia(query?: {
  limit?: number | undefined
  offset?: number | undefined
  search?: string | undefined
  folder?: string | undefined
  tag?: string | undefined
}): Promise<MediaListResult> {
  const params = new URLSearchParams()
  if (query?.limit !== undefined) params.set('limit', String(query.limit))
  if (query?.offset !== undefined) params.set('offset', String(query.offset))
  if (query?.search) params.set('search', query.search)
  if (query?.folder) params.set('folder', query.folder)
  if (query?.tag) params.set('tag', query.tag)
  const qs = params.toString()
  return request<MediaListResult>(`/media${qs ? `?${qs}` : ''}`)
}

/** Fetch a single media item */
export async function fetchMediaItem(id: string): Promise<MediaItem> {
  return request<MediaItem>(`/media/${id}`)
}

/**
 * POST a multipart upload and return the stored item. A host that rejects the
 * request before krantho sees it (a platform body-size limit, a proxy) answers
 * without JSON, so those failures are named from the status alone.
 */
async function postUpload<T extends MediaItem>(path: string, formData: FormData): Promise<T> {
  // Don't set Content-Type — the browser sets it with the multipart boundary
  const response = await fetch(`${BASE}${path}`, { method: 'POST', body: formData })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(
      response.status === 413
        ? 'File too large for this host'
        : `Upload failed: ${response.status}`,
    )
  }
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : null
    throw new Error(typeof error === 'string' ? error : `Upload failed: ${response.status}`)
  }
  return body as T
}

/** Upload a media file */
export async function uploadMedia(file: File, altText?: string): Promise<MediaItem> {
  const formData = new FormData()
  formData.append('file', file)
  if (altText) formData.append('alt', altText)
  return postUpload<MediaItem>('/media/upload', formData)
}

/** Update media metadata (alt text, folder, tags, crop, filename) */
export async function updateMedia(
  id: string,
  updates: {
    altText?: string
    folder?: string | null
    tags?: string[]
    crop?: MediaCrop | null
    hotspot?: MediaHotspot | null
    filename?: string
  },
): Promise<MediaItem> {
  return request<MediaItem>(`/media/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

/** Delete a media item */
export async function deleteMedia(id: string): Promise<{
  message: string
  warning?: string
  references?: Array<{ collection: string; slug: string }>
}> {
  return request(`/media/${id}`, { method: 'DELETE' })
}

/** Bulk delete media items */
export async function bulkDeleteMedia(ids: string[]): Promise<{
  deleted: string[]
  skipped: Array<{ id: string; reason: string }>
}> {
  return request('/media/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

/** Fetch the media folder tree */
export async function fetchMediaFolders(): Promise<MediaFolder[]> {
  const data = await request<{ folders: MediaFolder[] }>('/media/folders')
  return data.folders
}

/** Create a media folder */
export async function createMediaFolder(
  name: string,
  parentId?: string | null,
): Promise<MediaFolder> {
  return request<MediaFolder>('/media/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId: parentId ?? null }),
  })
}

/** Rename a media folder */
export async function renameMediaFolder(id: string, name: string): Promise<MediaFolder> {
  return request<MediaFolder>(`/media/folders/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

/** Delete a media folder (must be empty) */
export async function deleteMediaFolder(id: string): Promise<void> {
  await request<{ id: string }>(`/media/folders/${id}`, {
    method: 'DELETE',
  })
}

/** Move a media item to a folder (null = root) */
export async function moveMediaToFolder(
  mediaId: string,
  folderId: string | null,
): Promise<MediaItem> {
  return request<MediaItem>(`/media/${mediaId}/move`, {
    method: 'PUT',
    body: JSON.stringify({ folderId }),
  })
}

/** Fetch distinct media tags */
export async function fetchMediaTags(): Promise<string[]> {
  const data = await request<{ tags: string[] }>('/media/tags')
  return data.tags
}

/** The document fields that reference a media item by its id */
export async function fetchMediaUsage(id: string): Promise<MediaUsage> {
  return request<MediaUsage>(`/media/${id}/usage`)
}

/** The document fields that reference each of several media items, read in one request */
export async function fetchMediaUsages(
  ids: readonly string[],
): Promise<Record<string, MediaReference[]>> {
  const query = ids.map(encodeURIComponent).join(',')
  return (await request<{ usage: Record<string, MediaReference[]> }>(`/media/usage?ids=${query}`))
    .usage
}

/** Replace a media file, keeping the id; the url changes */
export async function replaceMedia(id: string, file: File): Promise<ReplacedMedia> {
  const formData = new FormData()
  formData.append('file', file)
  return postUpload<ReplacedMedia>(`/media/${id}/replace`, formData)
}

/** Duplicate a media item */
export async function duplicateMedia(id: string): Promise<MediaItem> {
  return request<MediaItem>(`/media/${id}/duplicate`, { method: 'POST' })
}

/** Fetch media storage info */
export async function fetchMediaInfo(): Promise<MediaInfo> {
  return request<MediaInfo>('/media/info')
}
