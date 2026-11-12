import { resolvePersistence } from '@krantho/config'
import type { IPageCacheStore } from '@krantho/server'
import { openPageCacheStore } from '@krantho/server'
import type {
  CacheHandler,
  CacheHandlerContext,
  CacheHandlerValue,
} from 'next/dist/server/lib/incremental-cache'
import type {
  GetIncrementalFetchCacheContext,
  GetIncrementalResponseCacheContext,
  IncrementalCacheValue,
  SetIncrementalFetchCacheContext,
  SetIncrementalResponseCacheContext,
} from 'next/dist/server/response-cache/types'
import { FETCH_KIND, fromStoredValue, responseTags, toStoredValue } from './cache-value.js'

/**
 * `lastModified` of an entry whose tags were marked stale. Next reads it as
 * `isStale: -1` and renders the page again before it responds, so a visitor
 * never gets a page older than its tags. A fetch entry's age then exceeds any
 * revalidate period, so Next re-fetches it. Next does not read `cacheState` from
 * a custom handler.
 */
const STALE_LAST_MODIFIED = -1

let opening: Promise<IPageCacheStore> | undefined

/**
 * The store is opened once per process. Next loads this module by path with no
 * access to `krantho.config.ts`, so the database comes from the environment.
 * A failed open is not kept: the next call tries again.
 */
function pageCacheStore(): Promise<IPageCacheStore> {
  opening ??= openPageCacheStore(resolvePersistence(process.env)).catch((error: unknown) => {
    opening = undefined
    throw error
  })
  return opening
}

/**
 * Next.js's cache — rendered pages, route responses and data cache entries —
 * kept in the site's own database, so every instance of a multi-instance site
 * serves and invalidates one cache.
 *
 * An entry is not served when one of its tags was expired after it was
 * written, and is served stale while Next re-renders it when a tag was only
 * marked stale. The tags are a fetch entry's own and implicit tags, and the
 * `x-next-cache-tags` header of a page or route.
 *
 * Enable it in `next.config.ts` with `cacheHandler:
 * require.resolve('@krantho/server-next/cache-handler')` and
 * `cacheMaxMemorySize: 0`, so no instance keeps a private copy.
 */
class KranthoCacheHandler implements CacheHandler {
  private readonly revalidatedTags: readonly string[]

  constructor(context: CacheHandlerContext) {
    this.revalidatedTags = context.revalidatedTags
  }

  async get(
    key: string,
    context: GetIncrementalFetchCacheContext | GetIncrementalResponseCacheContext,
  ): Promise<CacheHandlerValue | null> {
    const store = await pageCacheStore()
    const entry = await store.get(key)
    if (!entry) return null
    const value = fromStoredValue(entry.value)
    const tags = [...new Set([...entry.tags, ...requestTags(context), ...responseTags(value)])]
    // In minimal mode Next passes the tags revalidated during this request
    if (context.kind === FETCH_KIND && tags.some((tag) => this.revalidatedTags.includes(tag))) {
      return null
    }
    const state =
      tags.length > 0 ? await store.tagsRevalidatedSince(tags, entry.lastModified) : 'fresh'
    if (state === 'expired') return null
    return { lastModified: state === 'stale' ? STALE_LAST_MODIFIED : entry.lastModified, value }
  }

  async set(
    key: string,
    data: IncrementalCacheValue | null,
    context: SetIncrementalFetchCacheContext | SetIncrementalResponseCacheContext,
  ): Promise<void> {
    const store = await pageCacheStore()
    const tags = context.fetchCache ? (context.tags ?? []) : responseTags(data)
    await store.set(key, toStoredValue(data), tags)
  }

  /**
   * No durations, or an expiry of zero, expires the tags now. Any later expiry
   * — the `'max'` profile, a `cacheLife` profile — marks them stale now: the
   * next read serves the entry and re-renders it.
   */
  async revalidateTag(tags: string | string[], durations?: { expire?: number }): Promise<void> {
    const list = typeof tags === 'string' ? [tags] : tags
    if (list.length === 0) return
    const expire =
      durations === undefined || (durations.expire !== undefined && durations.expire <= 0)
    const store = await pageCacheStore()
    await store.markTags(list, { expire })
  }

  /** Nothing is kept per request */
  resetRequestCache(): void {}
}

/** A fetch entry's tags and the implicit tags of the page reading it */
function requestTags(
  context: GetIncrementalFetchCacheContext | GetIncrementalResponseCacheContext,
): string[] {
  if (context.kind !== FETCH_KIND) return []
  return [...(context.tags ?? []), ...(context.softTags ?? [])]
}

// Next loads a cache handler by path and constructs the module's default export,
// so this entry point is the one module with a default export.
export default KranthoCacheHandler
