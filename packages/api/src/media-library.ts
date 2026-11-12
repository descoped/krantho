import { randomUUID } from 'node:crypto'
import type { MediaSection } from '@krantho/config'
import type {
  BulkDeleteResult,
  IFileStore,
  IMediaMetadataAdapter,
  IMediaStorage,
  MediaItem,
  MediaListOptions,
  MediaRecord,
  MediaRecordChanges,
  MediaStats,
  MediaUpdateData,
  NewMediaRecord,
} from '@krantho/persistence'
import { detectDimensions } from './image-dimensions.js'

/** The media settings the library enforces */
export type MediaLibrarySettings = Pick<MediaSection, 'maxFileSize' | 'allowedMimeTypes'>

/** An externally uploaded file, as `register` accepts it */
type RegisteredFile = Parameters<IMediaStorage['register']>[0]

/**
 * The media library: metadata in the configured persistence, bytes in the
 * configured file store. Owns the rules — MIME and size limits, immutable
 * object keys, dimension detection — and keeps the two in step: a file
 * written for a failed insert is removed, and a superseded file is deleted
 * once the metadata no longer points at it.
 */
export class MediaLibrary implements IMediaStorage {
  private readonly allowedMimeTypes: ReadonlySet<string>

  constructor(
    private readonly metadata: IMediaMetadataAdapter,
    private readonly files: IFileStore,
    private readonly settings: MediaLibrarySettings,
  ) {
    this.allowedMimeTypes = new Set(settings.allowedMimeTypes)
  }

  async upload(file: Uint8Array, filename: string, mimeType: string): Promise<MediaItem> {
    this.assertAccepted(file, mimeType)
    const stored = await this.files.put(newKey(filename), file, mimeType)
    const dimensions = detectDimensions(file)
    const record = await this.insertOrDiscard(stored.key, {
      id: randomUUID(),
      filename,
      storageKey: stored.key,
      url: stored.url,
      altText: '',
      mimeType,
      size: file.byteLength,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      folder: null,
      tags: [],
      crop: null,
      hotspot: null,
    })
    return toMediaItem(record)
  }

  async register(item: RegisteredFile): Promise<MediaItem> {
    const record = await this.metadata.insert({
      id: randomUUID(),
      filename: item.filename,
      storageKey: null,
      url: item.url,
      altText: item.altText ?? '',
      mimeType: item.mimeType,
      size: item.size,
      width: item.width,
      height: item.height,
      folder: null,
      tags: [],
      crop: null,
      hotspot: null,
    })
    return toMediaItem(record)
  }

  async list(options?: MediaListOptions): Promise<{ items: MediaItem[]; total: number }> {
    const { items, total } = await this.metadata.list(options)
    return { items: items.map(toMediaItem), total }
  }

  async get(id: string): Promise<MediaItem | null> {
    const record = await this.metadata.get(id)
    return record ? toMediaItem(record) : null
  }

  /** Metadata only: a rename changes the display name, never the key or url */
  async update(id: string, updates: MediaUpdateData): Promise<MediaItem | null> {
    const record = await this.metadata.appendVersion(id, metadataChanges(updates))
    return record ? toMediaItem(record) : null
  }

  async delete(id: string): Promise<void> {
    const superseded = await this.metadata.markDeleted(id)
    if (superseded?.storageKey) await this.files.delete(superseded.storageKey)
  }

  async bulkDelete(ids: string[]): Promise<BulkDeleteResult> {
    const deleted: string[] = []
    const skipped: Array<{ id: string; reason: string }> = []
    for (const id of ids) {
      try {
        await this.delete(id)
        deleted.push(id)
      } catch (err) {
        skipped.push({ id, reason: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
    return { deleted, skipped }
  }

  async bulkUpdateAltText(ids: string[], altText: string): Promise<number> {
    let count = 0
    for (const id of ids) {
      if (await this.update(id, { altText })) count++
    }
    return count
  }

  /** Write the new file under a new key, point the record at it, then drop the old file */
  async replace(
    id: string,
    file: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<MediaItem | null> {
    const existing = await this.metadata.get(id)
    if (!existing) return null
    this.assertAccepted(file, mimeType)

    const stored = await this.files.put(newKey(filename), file, mimeType)
    const dimensions = detectDimensions(file)
    const record = await this.appendOrDiscard(stored.key, id, {
      filename,
      storageKey: stored.key,
      url: stored.url,
      mimeType,
      size: file.byteLength,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      crop: null,
      hotspot: null,
    })
    if (!record) return null
    if (existing.storageKey) await this.files.delete(existing.storageKey)
    return toMediaItem(record)
  }

  async duplicate(id: string): Promise<MediaItem | null> {
    const existing = await this.metadata.get(id)
    if (!existing) return null

    const { createdAt: _createdAt, ...copy } = existing
    const newRecord = { ...copy, id: randomUUID() }
    if (!existing.storageKey) return toMediaItem(await this.metadata.insert(newRecord))

    const stored = await this.files.copy(
      existing.storageKey,
      newKey(existing.filename),
      existing.mimeType,
    )
    const record = await this.insertOrDiscard(stored.key, {
      ...newRecord,
      storageKey: stored.key,
      url: stored.url,
    })
    return toMediaItem(record)
  }

  async listTags(): Promise<string[]> {
    return this.metadata.listTags()
  }

  async stats(): Promise<MediaStats> {
    return this.metadata.stats()
  }

  /** Stored bytes from the file store; a registered item is fetched from its url */
  async readOriginal(id: string): Promise<Uint8Array | null> {
    const record = await this.metadata.get(id)
    if (!record) return null
    if (record.storageKey) return this.files.get(record.storageKey)

    const response = await fetch(record.url)
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  }

  private assertAccepted(file: Uint8Array, mimeType: string): void {
    if (!this.allowedMimeTypes.has(mimeType)) {
      throw new Error(`Unsupported file type: ${mimeType}`)
    }
    if (file.byteLength > this.settings.maxFileSize) {
      throw new Error(`File too large: ${file.byteLength} bytes (max ${this.settings.maxFileSize})`)
    }
  }

  /** Insert a record whose file was just written; the file goes when the insert fails */
  private async insertOrDiscard(key: string, record: NewMediaRecord): Promise<MediaRecord> {
    try {
      return await this.metadata.insert(record)
    } catch (err) {
      await this.files.delete(key)
      throw err
    }
  }

  /** Append a version pointing at a just-written file; the file goes unless it is now current */
  private async appendOrDiscard(
    key: string,
    id: string,
    changes: MediaRecordChanges,
  ): Promise<MediaRecord | null> {
    let record: MediaRecord | null = null
    try {
      record = await this.metadata.appendVersion(id, changes)
      return record
    } finally {
      if (!record) await this.files.delete(key)
    }
  }
}

/** The public shape of a record: everything but the object key */
function toMediaItem(record: MediaRecord): MediaItem {
  const { storageKey: _storageKey, ...item } = record
  return item
}

/** Only the fields an update names; the rest of the record carries over */
function metadataChanges(updates: MediaUpdateData): MediaRecordChanges {
  const changes: MediaRecordChanges = {}
  if (updates.altText !== undefined) changes.altText = updates.altText
  if (updates.folder !== undefined) changes.folder = updates.folder
  if (updates.tags !== undefined) changes.tags = updates.tags
  if (updates.crop !== undefined) changes.crop = updates.crop
  if (updates.hotspot !== undefined) changes.hotspot = updates.hotspot
  if (updates.filename !== undefined) changes.filename = updates.filename
  return changes
}

/** A fresh, never-reused, flat object key */
function newKey(filename: string): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${slugifyFilename(filename)}`
}

/** Lowercase name and extension, every other run of characters a hyphen */
function slugifyFilename(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  const name = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
  const ext = dotIndex > 0 ? filename.slice(dotIndex + 1) : ''
  const slug = slugify(name) || 'file'
  const extension = slugify(ext)
  return extension ? `${slug}.${extension}` : slug
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
