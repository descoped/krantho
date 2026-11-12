import type { MediaSection } from '@krantho/config'

/** Cache limits, as the configuration tree declares them */
export type ImageCacheSettings = MediaSection['image']['cache']

/** Cached image variant */
export interface CachedVariant {
  bytes: Buffer
  contentType: string
  etag: string
}

interface CacheEntry {
  value: CachedVariant
  sizeBytes: number
  lastAccess: number
}

/**
 * In-memory LRU cache with memory-aware eviction for image variants.
 *
 * Eviction triggers:
 * - Entry count exceeds maxEntries
 * - Total memory exceeds maxMemoryBytes
 * - Entry idle time exceeds TTI
 *
 * When evicting, removes the least-recently-accessed entry first.
 *
 * Keys follow the pattern `{mediaId}/{preset}/{format}`.
 * Supports prefix-based invalidation for clearing all variants of a source image.
 */
export class ImageCache {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly maxEntries: number
  private readonly maxMemoryBytes: number
  private readonly ttiMs: number
  private totalBytes = 0
  private cleanupTimer: ReturnType<typeof setInterval> | undefined

  constructor(settings: ImageCacheSettings) {
    this.maxEntries = settings.maxEntries
    this.maxMemoryBytes = settings.maxMb * 1024 * 1024
    this.ttiMs = settings.ttiSec * 1000

    // Periodic cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => this.evictExpired(), 5 * 60 * 1000)
    if (this.cleanupTimer.unref) this.cleanupTimer.unref()
  }

  /** Get a cached variant. Returns undefined on miss or expired entry. */
  get(key: string): CachedVariant | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    const now = Date.now()
    if (now - entry.lastAccess > this.ttiMs) {
      this.removeEntry(key, entry)
      return undefined
    }

    entry.lastAccess = now
    return entry.value
  }

  /** Store a variant in the cache. Evicts entries if at capacity (count or memory). */
  set(key: string, value: CachedVariant): void {
    const sizeBytes = value.bytes.byteLength

    // Remove existing entry if updating
    const existing = this.cache.get(key)
    if (existing) {
      this.totalBytes -= existing.sizeBytes
    }

    // Evict until within limits
    while (
      this.cache.size >= this.maxEntries ||
      (this.totalBytes + sizeBytes > this.maxMemoryBytes && this.cache.size > 0)
    ) {
      this.evictLeastRecentlyUsed()
    }

    this.cache.set(key, { value, sizeBytes, lastAccess: Date.now() })
    this.totalBytes += sizeBytes
  }

  /** Invalidate all cached variants for a media item (prefix match). */
  invalidateSource(mediaId: string): void {
    const prefix = `${mediaId}/`
    for (const [key, entry] of this.cache) {
      if (key.startsWith(prefix)) {
        this.totalBytes -= entry.sizeBytes
        this.cache.delete(key)
      }
    }
  }

  /** Current number of cached entries */
  get size(): number {
    return this.cache.size
  }

  /** Total memory used by cached image bytes */
  get memoryBytes(): number {
    return this.totalBytes
  }

  /** Stop the cleanup timer (for tests / shutdown) */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  private removeEntry(key: string, entry: CacheEntry): void {
    this.totalBytes -= entry.sizeBytes
    this.cache.delete(key)
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | undefined
    let oldestEntry: CacheEntry | undefined
    let oldestTime = Number.POSITIVE_INFINITY

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess
        oldestKey = key
        oldestEntry = entry
      }
    }

    if (oldestKey && oldestEntry) {
      this.removeEntry(oldestKey, oldestEntry)
    }
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (now - entry.lastAccess > this.ttiMs) {
        this.removeEntry(key, entry)
      }
    }
  }
}
