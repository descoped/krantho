import { cache } from 'react'
import type { CMSContent, CMSContentOptions, CMSSummary, CMSSummaryOptions } from '../types'
import { getServerLoader, loadCollection, loadContent, loadSummaries } from './content-loader.js'

/**
 * Load the published version of a document. The returned `fields` is
 * `Record<string, unknown>` — callers can narrow to `Record<string, string>`
 * when they know the content shape. Throws a 404 `NetworkError` when the
 * document has no published version.
 */
export const getCMSContent = cache(
  async (collection: string, slug: string, options?: CMSContentOptions): Promise<CMSContent> => {
    return loadContent({ collection, slug, locale: options?.locale }, options)
  },
)

/** The slugs of the published documents in a collection */
export const getCMSSlugs = cache(
  async (collection: string, locale?: string | undefined): Promise<string[]> => {
    const docs = await getServerLoader().listPublishedSummaries(collection, locale)
    return docs.map((doc) => doc.slug)
  },
)

/** Every published document in a collection */
export const getAllCMSContent = cache(
  async (collection: string, options?: CMSContentOptions): Promise<CMSContent[]> => {
    try {
      return await loadCollection(collection, options?.locale, options)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Failed to load the ${collection} collection:`, error)
      }
      return []
    }
  },
)

/**
 * The published documents of a collection without their bodies: the fields a
 * list, a card or a navigation shows. Nothing is rendered; a page that shows a
 * document's body reads `getAllCMSContent` or `getCMSContent`.
 */
export const getAllCMSSummaries = cache(
  async (collection: string, options?: CMSSummaryOptions): Promise<CMSSummary[]> => {
    try {
      return await loadSummaries(collection, options?.locale)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Failed to load the ${collection} collection:`, error)
      }
      return []
    }
  },
)
