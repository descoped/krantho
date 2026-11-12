import type { ContentChange } from './content-change.js'

/**
 * The cache tag vocabulary: what a page read registers, and what a change
 * invalidates. A cached page carries the tags of every read that rendered it,
 * so invalidating a tag refreshes exactly the pages that read it.
 *
 * Tags fit the strictest limits across cache targets: printable ASCII with no
 * comma or space, lowercase (some CDNs match tags case-insensitively), at most
 * 120 bytes (a longer tag is shortened with a hash).
 */

/** Carried by every read: a site-wide change refreshes every page */
export const SITE_TAG = 'k:site'

/** How an invalidated page is refreshed */
export type InvalidationMode =
  /** The next request renders it fresh: for the document an editor just changed */
  | 'expire'
  /** The next request is served the old page while it re-renders: for broad changes */
  | 'stale'

/** Tags to invalidate, and how */
export interface CacheInvalidation {
  tags: readonly string[]
  mode: InvalidationMode
}

const MAX_TAG_LENGTH = 120
const DOCUMENT_TAG_PREFIX = 'k:d:'

/** One document, in every locale */
export function documentTag(collection: string, slug: string): string {
  return tag(`${DOCUMENT_TAG_PREFIX}${part(collection)}:${part(slug)}`)
}

/** A collection's membership: its lists, and every page that lists it */
export function collectionTag(collection: string): string {
  return tag(`k:c:${part(collection)}`)
}

/** One SEO configuration (`site`, `collection:<name>`, `route:<pattern>`); every configuration without one */
export function seoTag(configId?: string): string {
  return configId === undefined ? 'k:seo' : tag(`k:seo:${part(configId)}`)
}

/** The tags a document read registers */
export function documentReadTags(collection: string, slug: string): string[] {
  return [SITE_TAG, documentTag(collection, slug)]
}

/** The tags a collection list read registers */
export function listReadTags(collection: string): string[] {
  return [SITE_TAG, collectionTag(collection)]
}

/** The tags an SEO configuration read registers */
export function seoReadTags(configId: string): string[] {
  const tags = [SITE_TAG, seoTag(), seoTag(configId)]
  if (configId.startsWith('doc:')) {
    const identity = configId.slice(4)
    const separator = identity.indexOf('/')
    if (separator > 0 && separator < identity.length - 1) {
      tags.push(documentTag(identity.slice(0, separator), identity.slice(separator + 1)))
    }
  }
  return tags
}

/**
 * The collection tag a document tag belongs to, or null for any other tag (or a
 * document tag whose collection was cut by shortening)
 */
export function collectionTagOf(documentTagValue: string): string | null {
  if (!documentTagValue.startsWith(DOCUMENT_TAG_PREFIX)) return null
  const end = documentTagValue.indexOf(':', DOCUMENT_TAG_PREFIX.length)
  if (end === -1) return null
  // The segment is already `part()`-encoded: the same one `collectionTag` builds
  return tag(`k:c:${documentTagValue.slice(DOCUMENT_TAG_PREFIX.length, end)}`)
}

/** The tag every page's JSON-LD carries for the URL-pattern configurations: which patterns match is known only when the page composes */
const ROUTE_CONFIGS_TAG = 'route'

/**
 * The tags a page's JSON-LD reads: the document, which holds its own SEO in its
 * versioned metadata, and the site, collection and URL-pattern configurations
 * it is composed from
 */
export function jsonLdTags(collection: string, slug: string): string[] {
  return [
    SITE_TAG,
    documentTag(collection, slug),
    seoTag(),
    seoTag('site'),
    seoTag(`collection:${collection}`),
    seoTag(ROUTE_CONFIGS_TAG),
  ]
}

/**
 * Where a collection's documents render as pages: a pattern holding `:slug`
 * (`/deploy/:slug`), a fixed path every document of the collection renders at
 * (a singleton such as a landing page, `/`), or `false` for a collection whose
 * documents have no page of their own.
 */
export type CollectionPath = string | false

/** What `documentPath()` reads of a collection: its name, and the `path` it declares */
export interface PageCollection {
  readonly name: string
  readonly path?: CollectionPath | undefined
}

const SLUG_PARAM = ':slug'

/**
 * A collection by name from a site's collections — or, for a name the site does
 * not define, a collection with no declared `path`, which the default rule places.
 */
export function pageCollection(
  collections: Readonly<Record<string, PageCollection>>,
  name: string,
): PageCollection {
  return collections[name] ?? { name }
}

/**
 * Whether a collection's documents render as pages. Without a declared `path`,
 * every collection does except `globals`.
 */
export function rendersPages(collection: PageCollection): boolean {
  if (collection.path !== undefined) return collection.path !== false
  return collection.name !== 'globals'
}

/**
 * The URL path a document is rendered at, or null when its collection has no
 * pages. A collection's `path` decides: `:slug` is replaced by the slug, and the
 * slug `index` renders at the pattern without its `/:slug` segment
 * (`/docs/:slug` → `/docs`); a path without `:slug` is where every document of
 * the collection renders. Without a `path`, `pages` render at the site root
 * (`home` is `/`), `globals` have no page, and other collections render under
 * their name.
 */
export function documentPath(collection: PageCollection, slug: string): string | null {
  if (!rendersPages(collection)) return null
  const { name, path } = collection
  if (typeof path === 'string') return fillPath(path, slug)
  if (name === 'pages') return slug === 'home' ? '/' : `/${slug}`
  return `/${name}/${slug}`
}

/**
 * Where a collection's pages live, for labelling the collection: null when it
 * has no pages; a declared `path` without its `/:slug` segment (an empty
 * remainder is `/`); without a `path`, `/` for `pages` and `/<name>` for any
 * other collection.
 */
export function collectionBasePath(collection: PageCollection): string | null {
  if (!rendersPages(collection)) return null
  const { name, path } = collection
  if (typeof path === 'string') return path.replace(`/${SLUG_PARAM}`, '') || '/'
  return name === 'pages' ? '/' : `/${name}`
}

function fillPath(pattern: string, slug: string): string {
  if (!pattern.includes(SLUG_PARAM)) return pattern
  const segment = `/${SLUG_PARAM}`
  if (slug === 'index' && pattern.includes(segment)) return pattern.replace(segment, '') || '/'
  return pattern.replaceAll(SLUG_PARAM, slug)
}

/** What a change invalidates. A draft save and a media change leave rendered pages as they are. */
export function invalidationsFor(change: ContentChange): CacheInvalidation[] {
  switch (change.kind) {
    case 'document':
      if (!change.live) return []
      return [
        // A global is on every page: refresh them as they are visited, not all on the next request
        {
          tags: [documentTag(change.collection, change.slug)],
          mode: change.collection === 'globals' ? 'stale' : 'expire',
        },
        { tags: [collectionTag(change.collection)], mode: 'stale' },
      ]
    case 'seo':
      if (change.configId === undefined) return [{ tags: [seoTag()], mode: 'stale' }]
      // A URL pattern can match any page: every page's JSON-LD refreshes as it is visited
      if (change.configId.startsWith('route:')) {
        return [{ tags: [seoTag(ROUTE_CONFIGS_TAG)], mode: 'stale' }]
      }
      return [{ tags: [seoTag(change.configId)], mode: 'stale' }]
    case 'media':
      // Pages embed a media URL, never the asset record; the file is served fresh
      return []
    case 'site':
      return [{ tags: [SITE_TAG], mode: 'stale' }]
  }
}

/** A tag segment: lowercase, and percent-encoded outside unreserved ASCII. `Foo` and `foo` share a tag — at worst a page is refreshed needlessly. */
function part(value: string): string {
  return encodeURIComponent(value.toLowerCase()).toLowerCase()
}

function tag(value: string): string {
  if (value.length <= MAX_TAG_LENGTH) return value
  const hash = fnv1a(value)
  return `${value.slice(0, MAX_TAG_LENGTH - hash.length - 1)}~${hash}`
}

/** A short, stable hash (FNV-1a, 32-bit) — no platform crypto, so core stays portable */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
