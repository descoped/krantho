import type {
  IFileStore,
  IMediaMetadataAdapter,
  MediaListOptions,
  MediaRecord,
  MediaRecordChanges,
  MediaStats,
  NewMediaRecord,
  StoredFile,
} from '@krantho/persistence'

/** In-memory metadata adapter: current records only, a version counter per id */
export class MemoryMediaMetadata implements IMediaMetadataAdapter {
  readonly records = new Map<string, MediaRecord>()
  readonly versions = new Map<string, number>()
  failInsert = false

  async insert(record: NewMediaRecord): Promise<MediaRecord> {
    if (this.failInsert) throw new Error('insert failed')
    const stored: MediaRecord = { ...record, createdAt: new Date().toISOString() }
    this.records.set(record.id, stored)
    this.versions.set(record.id, 1)
    return stored
  }

  async get(id: string): Promise<MediaRecord | null> {
    return this.records.get(id) ?? null
  }

  async list(
    options?: MediaListOptions | undefined,
  ): Promise<{ items: MediaRecord[]; total: number }> {
    const items = [...this.records.values()].filter(
      (r) => !options?.search || r.filename.includes(options.search),
    )
    return { items, total: items.length }
  }

  async appendVersion(id: string, changes: MediaRecordChanges): Promise<MediaRecord | null> {
    const current = this.records.get(id)
    if (!current) return null
    const next: MediaRecord = { ...current, ...changes }
    this.records.set(id, next)
    this.versions.set(id, (this.versions.get(id) ?? 0) + 1)
    return next
  }

  async markDeleted(id: string): Promise<MediaRecord | null> {
    const current = this.records.get(id)
    if (!current) return null
    this.records.delete(id)
    return current
  }

  async listTags(): Promise<string[]> {
    return [...new Set([...this.records.values()].flatMap((r) => r.tags))].sort()
  }

  async stats(): Promise<MediaStats> {
    const records = [...this.records.values()]
    const byFolder: Record<string, number> = {}
    for (const { folder } of records) if (folder) byFolder[folder] = (byFolder[folder] ?? 0) + 1
    const totalSize = records.reduce((sum, record) => sum + record.size, 0)
    return { totalItems: records.length, totalSize, byFolder }
  }
}

/** In-memory file store; urls look like a CDN's */
export class MemoryFileStore implements IFileStore {
  readonly label = 'Memory'
  readonly location = null
  readonly objects = new Map<string, Uint8Array>()

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<StoredFile> {
    this.objects.set(key, bytes)
    return this.stored(key)
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key) ?? null
  }

  async copy(fromKey: string, toKey: string, _contentType: string): Promise<StoredFile> {
    const bytes = this.objects.get(fromKey)
    if (!bytes) throw new Error(`No object ${fromKey}`)
    this.objects.set(toKey, bytes)
    return this.stored(toKey)
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key)
  }

  private stored(key: string): StoredFile {
    return { key, url: `https://cdn.test/${key}` }
  }
}

/** A minimal PNG header: signature plus IHDR with the given size */
export function pngHeader(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24)
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  buf.set([0x00, 0x00, 0x00, 0x0d], 8)
  buf.set([0x49, 0x48, 0x44, 0x52], 12)
  const view = new DataView(buf.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return buf
}
