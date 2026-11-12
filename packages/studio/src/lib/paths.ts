/**
 * Studio's route paths, relative to Studio's basename — the one place a
 * screen's path is spelled. `shell/destinations.ts` holds the destinations
 * themselves; `routes.tsx` registers them.
 */

/** The collection whose documents form the site's Layout (header, footer, contact) */
export const LAYOUT_COLLECTION = 'globals'

const enc = encodeURIComponent

/** The editor of a document: `/layout/:slug` for a global, `/site/:collection/:slug` otherwise */
export function editorPath(collection: string, slug: string, locale?: string | undefined): string {
  const path =
    collection === LAYOUT_COLLECTION
      ? `/layout/${enc(slug)}`
      : `/site/${enc(collection)}/${enc(slug)}`
  return locale ? `${path}?locale=${enc(locale)}` : path
}

/**
 * A page's editor in Data mode: what the page emits — its previews, its
 * structured data with provenance, findings, enrichment and history
 */
export function dataModePath(
  collection: string,
  slug: string,
  locale?: string | undefined,
): string {
  const query = new URLSearchParams({ ...(locale ? { locale } : {}), mode: 'data' })
  return `/site/${enc(collection)}/${enc(slug)}?${query}`
}

/** A collection's view */
export function collectionPath(collection: string): string {
  return `/site/${enc(collection)}`
}

/**
 * The editor for a new document in a collection — outside `/site/:collection/…`,
 * so a document whose slug is `new` stays reachable
 */
export function newDocumentPath(collection: string): string {
  return `/new/${enc(collection)}`
}

/** Structure, with Fill what's missing open: enrichment over the site or a collection */
export const FILL_MISSING_PATH = '/structure/graph?fill=1'

/** Structure › Scopes & archetypes, at one of its sections */
export function structureScopesPath(
  section?: 'site' | 'collection' | 'route' | 'document',
): string {
  return section ? `/structure/scopes#scope-${section}` : '/structure/scopes'
}

/** The image editor of a media file */
export function mediaEditPath(id: string): string {
  return `/media/${enc(id)}/edit`
}

/** Setup › AI provider — where the language model is configured */
export const AI_SETUP_PATH = '/setup/ai'
