import { fetchSiteFindings } from '../lib/api.js'

/**
 * The rich results a page can appear in, from the search engines' own rules
 * as the API applies them: the site's findings (`GET /api/seo/findings`) list,
 * for each live page in the default locale, the features of the active
 * readers its entities can appear in — never a feature a reader has retired.
 * Drafts and other locales are not checked, and say so.
 */

/** A search feature of one reader, and whether the live page is eligible for it */
export interface RichFeature {
  feature: string
  /** The Schema.org type of the entity it is about */
  type: string
  /** The reader's name, as the site lists it */
  reader: string
  eligible: boolean
}

export type RichResults =
  | { state: 'listed'; features: readonly RichFeature[] }
  | { state: 'not-live' }
  | { state: 'other-locale' }
  | { state: 'unlisted' }
  | { state: 'error' }

export interface RichResultsTarget {
  collection: string
  slug: string
  /** A version of the document is live */
  live: boolean
  /** The document is the default locale's version */
  defaultLocale: boolean
}

/** The live page's rich results by the readers' rules, or why they are not shown */
export async function loadRichResults(target: RichResultsTarget): Promise<RichResults> {
  if (!target.live) return { state: 'not-live' }
  if (!target.defaultLocale) return { state: 'other-locale' }
  try {
    const { pages, readers } = await fetchSiteFindings()
    const page = pages.find((p) => p.collection === target.collection && p.slug === target.slug)
    if (!page) return { state: 'unlisted' }
    const name = (id: string): string => readers.find((reader) => reader.id === id)?.name ?? id
    const features = page.features.map((f) => ({
      feature: f.feature,
      type: f.type,
      reader: name(f.reader),
      eligible: f.eligible,
    }))
    return { state: 'listed', features }
  } catch {
    return { state: 'error' }
  }
}
