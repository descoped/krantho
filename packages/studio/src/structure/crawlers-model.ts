import type { LlmsTxtOrigin } from '../lib/api-seo.js'
import { type Served, servedOk } from '../lib/served.js'

/**
 * What crawlers and assistants read from the site — its sitemap, robots.txt
 * and llms.txt — as the site serves them, and whether what it serves is what
 * krantho's API answers (the site routes the address to it) or its own.
 */

/** One `<url>` of a served sitemap */
export interface SitemapEntry {
  loc: string
  lastmod?: string | undefined
  changefreq?: string | undefined
  priority?: string | undefined
}

function childText(element: Element, name: string): string | undefined {
  const child = element.getElementsByTagNameNS('*', name)[0]
  const text = child?.textContent?.trim()
  return text ? text : undefined
}

/** The URLs of a sitemap's XML; null when it is not a sitemap */
export function parseSitemap(xml: string): SitemapEntry[] | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return null
  if (doc.documentElement.localName !== 'urlset') return null
  return [...doc.getElementsByTagNameNS('*', 'url')].flatMap((url): SitemapEntry[] => {
    const loc = childText(url, 'loc')
    if (!loc) return []
    return [
      {
        loc,
        lastmod: childText(url, 'lastmod'),
        changefreq: childText(url, 'changefreq'),
        priority: childText(url, 'priority'),
      },
    ]
  })
}

/** Whether the site serves krantho's answer at the address, its own, or nothing */
export type ServedFrom = 'krantho' | 'own' | 'none'

/** Compare what the site serves with what krantho's API answers, ignoring the trailing newline */
export function servedFrom(served: Served, krantho: string): ServedFrom {
  if (!servedOk(served)) return 'none'
  return served.text.trimEnd() === krantho.trimEnd() ? 'krantho' : 'own'
}

/**
 * Where the llms.txt the site serves comes from, in words: `from` is null
 * when krantho's own could not be read to compare, `origin` when krantho's
 * API did not say how it made it. Nothing is claimed that was not read.
 */
export function llmsOriginText(from: ServedFrom | null, origin: LlmsTxtOrigin | null): string {
  if (from === null) {
    return "krantho's own llms.txt could not be read, so where this one comes from could not be determined."
  }
  if (from === 'own') {
    return "Written by the site's own /llms.txt route, not by krantho: it differs from what krantho's API builds, and Studio does not change it."
  }
  if (origin === 'snapshot') {
    return "Served from krantho's API: the snapshot saved through the assistant, until another is saved."
  }
  if (origin === 'generated') {
    return "Served from krantho's API, built from the live pages on each request: the site's name, the site entity's description as its summary, then each collection with pages and a link per live, indexable page with its description."
  }
  return "Served from krantho's API, which did not say how it made it: its origin could not be determined."
}

/** Where the robots.txt the site serves comes from, in words */
export function robotsServedText(from: ServedFrom): string {
  switch (from) {
    case 'krantho':
      return 'The site serves this at /robots.txt.'
    case 'own':
      return "The site's /robots.txt is answered by its own route, so what is saved here does not reach it."
    case 'none':
      return 'The site serves no /robots.txt: route it to /api/seo/robots.txt to serve this.'
  }
}
