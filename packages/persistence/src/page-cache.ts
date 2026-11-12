/**
 * The shared page cache store — rendered pages and fetch results kept in the
 * site's own database, so every instance of a multi-instance site reads and
 * invalidates one cache.
 *
 * Timestamps are epoch milliseconds from the store's clock: the store stamps an
 * entry's `lastModified` on `set` and a tag's mark on `markTags` from the same
 * clock (the database server's clock on Postgres), so instances with skewed
 * clocks still compare one entry against one mark consistently.
 */

/**
 * A value the page cache stores: JSON data whose leaves may be binary.
 *
 * Binary leaves (`Uint8Array`, including Node `Buffer`) are stored base64-encoded
 * inside an object `{ "__kranthoBytes": "<base64>" }` and come back as
 * `Uint8Array`; that key is reserved. Object members that are `undefined` are
 * dropped, as in JSON. Maps, Dates and class instances are not values — the
 * caller converts them before `set`.
 */
export type PageCacheValue =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | readonly PageCacheValue[]
  | { readonly [key: string]: PageCacheValue | undefined }

/** One cached entry as the store returns it */
export interface PageCacheEntry {
  /** The value handed to `set`, binary leaves restored as `Uint8Array` */
  value: PageCacheValue
  /** The entry's tags as of its last `set` (deduplicated, in first-seen order) */
  tags: string[]
  /** When the entry was last written, epoch milliseconds on the store's clock */
  lastModified: number
}

/**
 * What marks on a set of tags mean for an entry written at a given time.
 * `expired` — a tag was expired at or after that time: the entry must not be served.
 * `stale` — a tag was marked stale (and none expired) at or after that time: the
 * entry may be served while it is refreshed. `fresh` — no mark since.
 */
export type PageCacheTagState = 'fresh' | 'stale' | 'expired'

/** How `markTags` marks its tags */
export interface PageCacheMarkOptions {
  /**
   * `true` expires the tags now (entries written up to now are not served) and
   * marks them stale; `false` only marks them stale now. A mark never moves a
   * tag's timestamps backwards, and a stale mark never clears an earlier expiry.
   */
  expire: boolean
}

/**
 * Shared page cache persistence: entries by key, and the latest stale and expire
 * mark per tag. Every write is safe under concurrent instances — `set` is an
 * upsert and `markTags` is idempotent and monotonic.
 */
export interface IPageCacheStore {
  /** Read an entry by key, or null when none is stored */
  get(key: string): Promise<PageCacheEntry | null>
  /**
   * Write an entry (upsert). Replaces the value and the tags of an existing entry
   * — tags are never appended — and stamps `lastModified` with the store's clock.
   */
  set(key: string, value: PageCacheValue, tags: readonly string[]): Promise<void>
  /**
   * Whether any of `tags` was expired or marked stale at or after `since` (epoch
   * milliseconds, normally an entry's `lastModified`). Tags never marked are fresh.
   */
  tagsRevalidatedSince(tags: readonly string[], since: number): Promise<PageCacheTagState>
  /** Mark tags stale, or expired, as of now on the store's clock */
  markTags(tags: readonly string[], options: PageCacheMarkOptions): Promise<void>
  /** How many entries (pages and data) carry any of `tags` */
  countTagged(tags: readonly string[]): Promise<number>
}

const BYTES_KEY = '__kranthoBytes'
const BASE64_CHUNK = 0x8000

/** Unique tags in first-seen order */
export function uniquePageCacheTags(tags: readonly string[]): string[] {
  return [...new Set(tags)]
}

/** Serialise a page cache value to text, binary leaves as base64 (see `PageCacheValue`) */
export function encodePageCacheValue(value: PageCacheValue): string {
  return JSON.stringify(toJsonValue(value))
}

/** Parse text written by `encodePageCacheValue`, restoring binary leaves as `Uint8Array` */
export function decodePageCacheValue(text: string): PageCacheValue {
  return JSON.parse(text, (_key, value: unknown) => {
    if (!isBytesMarker(value)) return value
    return base64ToBytes(value[BYTES_KEY])
  }) as PageCacheValue
}

/** Replace binary leaves with base64 markers (before JSON.stringify, which would call `Buffer#toJSON`) */
function toJsonValue(value: PageCacheValue | undefined): unknown {
  if (value instanceof Uint8Array) return { [BYTES_KEY]: bytesToBase64(value) }
  if (Array.isArray(value)) return value.map((item: PageCacheValue) => toJsonValue(item))
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, member] of Object.entries(value)) {
    if (member !== undefined) out[key] = toJsonValue(member)
  }
  return out
}

function isBytesMarker(value: unknown): value is { [BYTES_KEY]: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  const encoded = (value as Record<string, unknown>)[BYTES_KEY]
  return keys.length === 1 && keys[0] === BYTES_KEY && typeof encoded === 'string'
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
