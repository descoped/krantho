import type { OutgoingHttpHeaders } from 'node:http'
import type { PageCacheValue } from '@krantho/server'
import type {
  CachedAppPageValue,
  CachedRouteKind,
  IncrementalCachedAppPageValue,
  IncrementalCacheKind,
  IncrementalCacheValue,
} from 'next/dist/server/response-cache/types'

/**
 * Next's cache kinds, restated. Next declares them as ambient `const enum`s,
 * which isolated modules cannot read as values; the strings are the enums' own.
 */
const CACHED_KIND = {
  APP_PAGE: 'APP_PAGE' as CachedRouteKind.APP_PAGE,
  APP_ROUTE: 'APP_ROUTE' as CachedRouteKind.APP_ROUTE,
  PAGES: 'PAGES' as CachedRouteKind.PAGES,
  FETCH: 'FETCH' as CachedRouteKind.FETCH,
  REDIRECT: 'REDIRECT' as CachedRouteKind.REDIRECT,
  IMAGE: 'IMAGE' as CachedRouteKind.IMAGE,
} as const

export const FETCH_KIND = 'FETCH' as IncrementalCacheKind.FETCH

/** The response header Next records a rendered page's or route's cache tags in */
const CACHE_TAGS_HEADER = 'x-next-cache-tags'

type StoredRecord = { readonly [key: string]: PageCacheValue | undefined }

/**
 * Convert a value Next caches into one the page cache store keeps.
 *
 * Binary fields (`rscData`, a route's `body`, an image's `buffer`) are Buffers,
 * which the store keeps as bytes. A page's `segmentData` Map becomes a list of
 * `[segmentPath, bytes]` pairs. `pageData` and redirect `props` are JSON, as
 * Next itself writes them to disk.
 */
export function toStoredValue(value: IncrementalCacheValue | null): PageCacheValue {
  if (value === null) return null
  switch (value.kind) {
    case CACHED_KIND.APP_PAGE:
      return {
        kind: value.kind,
        html: value.html,
        rscData: value.rscData,
        headers: value.headers,
        postponed: value.postponed,
        status: value.status,
        segmentData: value.segmentData ? [...value.segmentData] : undefined,
      }
    case CACHED_KIND.PAGES:
      return { ...value, pageData: value.pageData as PageCacheValue }
    case CACHED_KIND.REDIRECT:
      return { ...value, props: value.props as PageCacheValue }
    case CACHED_KIND.APP_ROUTE:
    case CACHED_KIND.IMAGE:
    case CACHED_KIND.FETCH:
      return { ...value }
  }
}

/**
 * Restore a stored value into the shape Next reads: bytes back to Buffers and
 * a page's segment pairs back to a Map.
 */
export function fromStoredValue(stored: PageCacheValue): IncrementalCacheValue | null {
  if (!isRecord(stored)) return null
  switch (stored.kind) {
    case CACHED_KIND.APP_PAGE:
      return toAppPage(stored)
    case CACHED_KIND.APP_ROUTE:
      return restore({ ...stored, body: toBuffer(stored.body) })
    case CACHED_KIND.IMAGE:
      return restore({ ...stored, buffer: toBuffer(stored.buffer) })
    default:
      return restore(stored)
  }
}

/**
 * The tags Next stamped on a rendered page or route, from its
 * `x-next-cache-tags` header — Next's implicit path tags included.
 */
export function responseTags(value: IncrementalCacheValue | null): string[] {
  if (
    value?.kind !== CACHED_KIND.APP_PAGE &&
    value?.kind !== CACHED_KIND.APP_ROUTE &&
    value?.kind !== CACHED_KIND.PAGES
  ) {
    return []
  }
  const header = value.headers?.[CACHE_TAGS_HEADER]
  if (typeof header !== 'string') return []
  return header.split(',').filter((tag) => tag.length > 0)
}

function toAppPage(stored: StoredRecord): IncrementalCachedAppPageValue {
  return {
    kind: CACHED_KIND.APP_PAGE,
    html: stored.html as string,
    rscData: stored.rscData === undefined ? undefined : toBuffer(stored.rscData),
    headers: stored.headers as OutgoingHttpHeaders | undefined,
    postponed: stored.postponed as string | undefined,
    status: stored.status as number | undefined,
    segmentData: toSegmentData(stored.segmentData),
  }
}

function toSegmentData(stored: PageCacheValue | undefined): CachedAppPageValue['segmentData'] {
  if (!Array.isArray(stored)) return undefined
  const segments = new Map<string, Buffer>()
  for (const pair of stored as readonly (readonly [string, PageCacheValue])[]) {
    segments.set(pair[0], toBuffer(pair[1]))
  }
  return segments
}

/** The store hands bytes back as `Uint8Array`; Next reads Buffers */
function toBuffer(bytes: PageCacheValue | undefined): Buffer {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('A cached binary field did not come back from the page cache store as bytes')
  }
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/**
 * A stored record is the value Next handed to `set`, binary fields restored;
 * the store validated nothing of its shape, Next wrote it.
 */
function restore(record: StoredRecord): IncrementalCacheValue {
  return record as unknown as IncrementalCacheValue
}

function isRecord(value: PageCacheValue): value is StoredRecord {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array)
  )
}
