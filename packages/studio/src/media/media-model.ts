import type { MediaFolder, MediaItem, MediaReference } from '../lib/api-types.js'

/** The type a dragged tile carries: the media item's id */
export const MEDIA_DRAG_TYPE = 'application/krantho-media-id'

/** How many files one page of the grid shows */
export const PAGE_SIZE = 24

export type SortOption = 'newest' | 'oldest' | 'largest' | 'smallest' | 'name'

export const SORT_OPTIONS: readonly SortOption[] = [
  'newest',
  'oldest',
  'largest',
  'smallest',
  'name',
]

export const SORT_LABELS: Readonly<Record<SortOption, string>> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  largest: 'Largest first',
  smallest: 'Smallest first',
  name: 'Name A–Z',
}

/** The page's files in the chosen order; the API pages them newest first */
export function sortItems(items: readonly MediaItem[], sort: SortOption): MediaItem[] {
  const sorted = [...items]
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'oldest':
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    case 'largest':
      return sorted.sort((a, b) => b.size - a.size)
    case 'smallest':
      return sorted.sort((a, b) => a.size - b.size)
    case 'name':
      return sorted.sort((a, b) => a.filename.localeCompare(b.filename))
  }
}

export function isImage(item: Pick<MediaItem, 'mimeType'>): boolean {
  return item.mimeType.startsWith('image/')
}

/** The kind badge: the file format in words, `SVG` for `image/svg+xml` */
export function kindLabel(mimeType: string): string {
  const subtype = mimeType.split('/')[1]
  if (!subtype) return 'FILE'
  return subtype.split('+')[0]?.toUpperCase() ?? 'FILE'
}

/** "1200 × 630", or null when the API stored no dimensions (a vector image) */
export function dimensionsText(item: Pick<MediaItem, 'width' | 'height'>): string | null {
  if (item.width === null || item.height === null) return null
  return `${item.width} × ${item.height}`
}

export function filesText(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

export function documentsText(count: number): string {
  return count === 1 ? '1 document' : `${count} documents`
}

/** A document that references a media item */
export interface ReferencingDocument {
  collection: string
  slug: string
  /** The fields (or `body`) that hold the id */
  fields: string[]
}

/**
 * The documents behind the API's usage list. It lists every field that holds
 * the id, so a document using the file twice is one document.
 */
export function referencingDocuments(usage: readonly MediaReference[]): ReferencingDocument[] {
  const documents = new Map<string, ReferencingDocument>()
  for (const { collection, slug, field } of usage) {
    const key = `${collection}/${slug}`
    const known = documents.get(key)
    if (known) known.fields.push(field)
    else documents.set(key, { collection, slug, fields: [field] })
  }
  return [...documents.values()]
}

/** What a media item's references are known to be */
export type References =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; documents: ReferencingDocument[] }

/** The tile's and the drawer's line: a count from the API, or why there is none */
export function referenceText(references: References | undefined): string {
  if (!references || references.state === 'loading') return 'Reading references…'
  if (references.state === 'failed') return 'References could not be read'
  const count = references.documents.length
  return count === 0 ? 'Not referenced' : `Referenced by ${documentsText(count)}`
}

/** The number of referencing documents, or null when it is not known */
export function referenceCount(references: References | undefined): number | null {
  return references?.state === 'ready' ? references.documents.length : null
}

/**
 * What a rename changes: the name is metadata, shown only in Studio. The file
 * and its URL stay as they are, so pages keep the same image — whether a
 * document holds the id or the store URL.
 */
export const RENAME_EFFECT =
  'A rename changes only the name shown in Studio: the file and its URL stay the same, so their pages keep the same image.'

/** The rename warning, with the documents the API found using the file — or null when unknown */
export function renameWarning(count: number | null): string {
  if (count === null) {
    return `This file's references are not known, so documents may use it. ${RENAME_EFFECT}`
  }
  const verb = count === 1 ? 'uses' : 'use'
  return `${documentsText(count)} ${verb} this file. ${RENAME_EFFECT}`
}

/** What a viewer may do in Media, as the API allows it */
export interface MediaPermissions {
  /** Upload, rename, alt text, tags, folders, replace, duplicate, crop, delete one file */
  canEdit: boolean
  /** Delete several files at once, or a folder */
  canAdminister: boolean
}

export const READ_ONLY_REASON = 'Your role can view media but not change it.'
export const ADMIN_REASON = 'Deleting several files at once, or a folder, needs the admin role.'

export function mediaPermissions(hasRole: (role: 'admin' | 'editor') => boolean): MediaPermissions {
  return { canEdit: hasRole('editor'), canAdminister: hasRole('admin') }
}

/** A folder in the list, indented under its parent */
export interface FolderRow {
  folder: MediaFolder
  depth: number
  /** The folders above it, nearest last: collapsing any of them hides it */
  ancestors: string[]
  hasChildren: boolean
}

/** Each folder's children; a folder whose parent is unknown is a top-level one */
function childrenOf(folders: readonly MediaFolder[]): Map<string | null, MediaFolder[]> {
  const ids = new Set(folders.map((folder) => folder.id))
  const children = new Map<string | null, MediaFolder[]>()
  for (const folder of folders) {
    const parent = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null
    children.set(parent, [...(children.get(parent) ?? []), folder])
  }
  return children
}

/**
 * The folder tree as a list, each folder after its parent and indented under
 * it; the folders inside a collapsed one are left out
 */
export function folderRows(
  folders: readonly MediaFolder[],
  collapsed: ReadonlySet<string> = new Set(),
): FolderRow[] {
  const children = childrenOf(folders)
  const rows: FolderRow[] = []
  const visit = (parent: string | null, ancestors: string[]): void => {
    for (const folder of children.get(parent) ?? []) {
      const hasChildren = (children.get(folder.id)?.length ?? 0) > 0
      rows.push({ folder, depth: ancestors.length, ancestors, hasChildren })
      if (!collapsed.has(folder.id)) visit(folder.id, [...ancestors, folder.id])
    }
  }
  visit(null, [])
  return rows
}
