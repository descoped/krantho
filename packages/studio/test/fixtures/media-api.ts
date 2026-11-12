import type { MediaFolder, MediaItem, MediaReference } from '../../src/lib/api-types.js'
import { installApi, json, type Route } from './site-api.js'

// ---------------------------------------------------------------------------
// A fake media API, answering as packages/api's media handlers do:
// GET /api/media → { items, total } (folder, search, tag, limit, offset)
// GET /api/media/info → { totalItems, totalSize, folderCounts, storageLabel, storagePath }
// GET /api/media/tags → { tags }; GET /api/media/folders → { folders }
// GET /api/media/:id/usage → { id, usage: [{ collection, slug, field }], total }
// GET /api/media/usage?ids= → { usage: { [id]: [...] } }; 500 when any id has no usage
// PUT /api/media/:id → the item; POST …/replace → the item (+ _referencesUpdated)
// POST …/duplicate → 201 the copy; DELETE /api/media/:id → { message }
// DELETE /api/media/bulk → { deleted, skipped }; POST /api/media/folders → 201 the folder
// ---------------------------------------------------------------------------

export const MEDIA_FEATURES = {
  seo: 'enabled',
  localization: 'enabled',
  media: 'local',
  mediaFolders: 'enabled',
}

export function mediaFile(id: string, patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    filename: `${id}.jpg`,
    url: `/uploads/1-${id}.jpg`,
    altText: '',
    mimeType: 'image/jpeg',
    size: 2048,
    width: 1200,
    height: 630,
    folder: null,
    tags: [],
    crop: null,
    hotspot: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...patch,
  }
}

export const FOLDERS: MediaFolder[] = [
  { id: 'f-brand', name: 'Brand', parentId: null, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'f-logos', name: 'Logos', parentId: 'f-brand', createdAt: '2026-09-02T10:00:00.000Z' },
]

/** fjord: used by two documents (one twice); logo: in Logos, unused; plan: an SVG with no dimensions */
export const FILES: MediaItem[] = [
  mediaFile('fjord', { altText: 'A fjord at dawn', tags: ['landscape'] }),
  mediaFile('logo', {
    filename: 'logo.png',
    mimeType: 'image/png',
    folder: 'f-logos',
    createdAt: '2026-09-30T10:00:00.000Z',
  }),
  mediaFile('plan', {
    filename: 'plan.svg',
    mimeType: 'image/svg+xml',
    width: null,
    height: null,
    createdAt: '2026-09-29T10:00:00.000Z',
  }),
]

export const USAGE: Readonly<Record<string, MediaReference[]>> = {
  fjord: [
    { collection: 'pages', slug: 'about', field: 'hero' },
    { collection: 'pages', slug: 'about', field: 'body' },
    { collection: 'services', slug: 'design', field: 'og-image' },
  ],
  logo: [],
  plan: [],
}

function listMedia(url: URL, files: readonly MediaItem[]): Response {
  const folder = url.searchParams.get('folder')
  const search = url.searchParams.get('search')
  const tag = url.searchParams.get('tag')
  const matching = files
    .filter((file) => !folder || file.folder === folder)
    // SQLite's LIKE, which the API's search uses, ignores ASCII case
    .filter((file) => !search || file.filename.toLowerCase().includes(search.toLowerCase()))
    .filter((file) => !tag || file.tags.includes(tag))
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const limit = Number(url.searchParams.get('limit') ?? matching.length)
  return json({ items: matching.slice(offset, offset + limit), total: matching.length })
}

function fileRoutes(
  file: MediaItem,
  usage: Readonly<Record<string, MediaReference[]>>,
): Record<string, Route> {
  const path = `/api/media/${file.id}`
  const references = usage[file.id]
  return {
    [`GET ${path}`]: () => json(file),
    [`GET ${path}/usage`]: () =>
      references
        ? json({ id: file.id, usage: references, total: references.length })
        : json({ error: 'Broken' }, 500),
    [`PUT ${path}`]: (sent) => json({ ...file, ...(sent as Partial<MediaItem>) }),
    [`POST ${path}/replace`]: () =>
      json({ ...file, filename: 'new.jpg', url: '/uploads/2-new.jpg', _referencesUpdated: 1 }),
    [`POST ${path}/duplicate`]: () =>
      json(mediaFile(`${file.id}-copy`, { filename: file.filename }), 201),
    [`DELETE ${path}`]: () => json({ message: 'Deleted' }),
  }
}

/** How many files each folder holds, as the API's media figures count them */
function folderCounts(files: readonly MediaItem[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const { folder } of files) if (folder) counts[folder] = (counts[folder] ?? 0) + 1
  return counts
}

/** The batched usage read: one answer for every id, or a failure when any cannot be read */
function usages(url: URL, usage: Readonly<Record<string, MediaReference[]>>): Response {
  const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
  if (ids.some((id) => !usage[id])) return json({ error: 'Broken' }, 500)
  return json({ usage: Object.fromEntries(ids.map((id) => [id, usage[id]])) })
}

export interface MediaApiOptions {
  files?: readonly MediaItem[] | undefined
  usage?: Readonly<Record<string, MediaReference[]>> | undefined
  role?: 'admin' | 'editor' | 'viewer' | undefined
  routes?: Readonly<Record<string, Route>> | undefined
}

/** The Site fake plus the media routes; returns the calls it saw */
export function installMediaApi(options: MediaApiOptions = {}): ReturnType<typeof installApi> {
  const files = options.files ?? FILES
  const usage = options.usage ?? USAGE
  const routes: Record<string, Route> = {
    'GET /api/media': (_body, url) => listMedia(url, files),
    'GET /api/media/info': () =>
      json({
        totalItems: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
        folderCounts: folderCounts(files),
        storageLabel: 'Local disk',
        storagePath: '/srv/site/public/uploads',
      }),
    'GET /api/media/tags': () => json({ tags: ['landscape'] }),
    'GET /api/media/usage': (_body, url) => usages(url, usage),
    'GET /api/media/folders': () => json({ folders: FOLDERS }),
    'POST /api/media/folders': (sent) =>
      json(
        { id: 'f-new', parentId: null, createdAt: '2026-10-03T10:00:00.000Z', ...(sent as object) },
        201,
      ),
    'DELETE /api/media/bulk': (sent) =>
      json({ deleted: (sent as { ids: string[] }).ids, skipped: [] }),
    'POST /api/media/upload': () => json(mediaFile('upload'), 201),
    ...Object.fromEntries(files.flatMap((file) => Object.entries(fileRoutes(file, usage)))),
    ...options.routes,
  }
  return installApi({ features: MEDIA_FEATURES, role: options.role, routes })
}
