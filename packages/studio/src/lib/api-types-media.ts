/** Crop region as percentages */
export interface MediaCrop {
  x: number
  y: number
  width: number
  height: number
}

/** Hotspot center + ellipse for adaptive aspect-ratio cropping (0-100%) */
export interface MediaHotspot {
  x: number
  y: number
  width: number
  height: number
}

/** Media item from the API */
export interface MediaItem {
  id: string
  filename: string
  url: string
  altText: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  folder: string | null
  tags: string[]
  crop: MediaCrop | null
  hotspot: MediaHotspot | null
  createdAt: string
}

/** What `POST /api/media/:id/replace` answers: the item, keeping its id */
export interface ReplacedMedia extends MediaItem {
  /** Documents whose copy of the old file's store URL was rewritten to the new one */
  _referencesUpdated?: number | undefined
}

/** A document field (or `body`) that holds a media item's id, from `GET /api/media/:id/usage` */
export interface MediaReference {
  collection: string
  slug: string
  field: string
}

/** `GET /api/media/:id/usage`: every field that references the item; `total` counts fields */
export interface MediaUsage {
  id: string
  usage: MediaReference[]
  total: number
}

export interface MediaListResult {
  items: MediaItem[]
  total: number
}

/** Media folder from the API */
export interface MediaFolder {
  id: string
  name: string
  parentId: string | null
  createdAt: string
}

/** Media storage info */
export interface MediaInfo {
  totalItems: number
  totalSize: number
  /** How many files each folder holds, by folder id; a folder with none is absent */
  folderCounts: Record<string, number>
  storageLabel: string
  storagePath: string | null
}
