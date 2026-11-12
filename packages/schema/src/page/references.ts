import type { CollectionOptions, CollectionRef, SectionsRef, SlugRef } from './types.js'

/** Reference one document with explicit collection identity and optional locale. */
export function slug(collection: string, name: string, locale?: string): SlugRef {
  return { type: 'slug', collection, slug: name, locale }
}

/**
 * Reference specific ## heading sections from a content document.
 *
 * @example
 * ```ts
 * sections('pages', 'services', ['strategy', 'advisory'])  // named sections
 * sections('pages', 'services', '*')                        // all sections
 * ```
 */
export function sections(
  collection: string,
  slugName: string,
  names: readonly string[] | '*',
  locale?: string,
): SectionsRef {
  return { type: 'sections', collection, slug: slugName, names, locale }
}

/**
 * Reference multiple articles from a named collection.
 *
 * @example
 * ```ts
 * collection('blog', { sort: 'date:desc', limit: 3 })
 * collection('blog', { exclude: ':slug' })  // exclude current dynamic slug
 * ```
 */
export function collection(
  name: string,
  options: CollectionOptions = {},
  locale?: string,
): CollectionRef {
  return { type: 'collection', collection: name, options, locale }
}
