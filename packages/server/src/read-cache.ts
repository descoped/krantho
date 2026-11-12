/** The content cache settings (`content.cache` in the configuration tree) */
export interface ReadCacheSettings {
  enabled: boolean
  ttlMs: number
  maxEntries: number
}

/** A keyed cache of reads, each kept for a time-to-live */
export interface ReadCache {
  read<T>(key: string, load: () => Promise<T>): Promise<T>
}

/**
 * Cache reads per key for `ttlMs`, keeping at most `maxEntries` (oldest first
 * out). Concurrent reads of one key share a single load; a failed load is not
 * kept. Disabled, every read loads.
 */
export function createReadCache(settings: ReadCacheSettings): ReadCache {
  const entries = new Map<string, { value: Promise<unknown>; storedAt: number }>()

  return {
    read<T>(key: string, load: () => Promise<T>): Promise<T> {
      if (!settings.enabled) return load()

      const entry = entries.get(key)
      if (entry && Date.now() - entry.storedAt < settings.ttlMs) {
        return entry.value as Promise<T>
      }

      const value = load()
      entries.delete(key)
      entries.set(key, { value, storedAt: Date.now() })
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key)
      })
      while (entries.size > settings.maxEntries) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
      return value
    },
  }
}
