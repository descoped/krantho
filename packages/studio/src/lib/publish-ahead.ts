import { bulkPublishItems, fetchAllDocuments } from './api-content.js'
import { documentStatus } from './document-status.js'
import { loadLocales } from './locales.js'

/** The documents of one collection and locale whose saved draft is ahead of the live version */
export interface AheadGroup {
  collection: string
  locale: string
  slugs: string[]
}

/** Every document, in every collection and locale, with unpublished changes */
export async function findDocumentsAhead(): Promise<AheadGroup[]> {
  const [metas, locales] = await Promise.all([fetchAllDocuments({ view: 'meta' }), loadLocales()])
  const groups = new Map<string, AheadGroup>()
  for (const meta of metas) {
    if (!locales.supportedLocales.includes(meta.locale)) continue
    if (documentStatus(meta) !== 'ahead') continue
    const key = `${meta.collection}\u0000${meta.locale}`
    const group = groups.get(key) ?? { collection: meta.collection, locale: meta.locale, slugs: [] }
    group.slugs.push(meta.slug)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/** How many documents the groups hold */
export function countAhead(groups: readonly AheadGroup[]): number {
  return groups.reduce((sum, group) => sum + group.slugs.length, 0)
}

/** Publish every group through the bulk publish API; resolves to how many were published */
export async function publishAhead(groups: readonly AheadGroup[]): Promise<number> {
  let published = 0
  for (const group of groups) {
    const result = await bulkPublishItems(group.collection, group.slugs, group.locale)
    published += result.published
  }
  return published
}
