import { collectionTagOf, SITE_TAG } from './cache-tags.js'

/**
 * Response headers for a page a CDN caches, and for an editor's preview.
 *
 * A cached page is fresh at the CDN for `s-maxage` and never in the browser
 * (`max-age=0`), so a purge reaches every visitor. It carries the tags of every read that
 * rendered it, within the strictest per-response tag limit across CDNs.
 */

/** The CDN in front of the site */
export type CdnProvider = 'vercel' | 'cloudfront' | 'gcp'

/** What `cdnCacheHeaders` needs to cache a page */
export interface CdnCacheHeaderOptions {
  /** Tags of every read that rendered the page */
  tags: readonly string[]
  provider: CdnProvider
  /** How long the CDN serves the page as fresh */
  sMaxAgeSec: number
  /** How long after that the CDN serves it while it re-renders */
  staleWhileRevalidateSec: number
  /** The response header the CloudFront distribution reads tags from */
  tagHeader: string
}

const DEFAULT_TAG_BUDGET = 50

/**
 * Fit a page's tags into a CDN's per-response limit. Duplicates are dropped;
 * beyond the budget, document tags give way to their collection's tag (a
 * change to any document in it then refreshes the page), then the rest is cut.
 * `k:site` is always kept, so a site-wide change still reaches the page.
 */
export function pageTagBudget(tags: readonly string[], max = DEFAULT_TAG_BUDGET): string[] {
  const unique = [...new Set(tags)]
  if (unique.length <= max) return unique
  const collapsed = [...new Set(unique.map((tag) => collectionTagOf(tag) ?? tag))]
  if (collapsed.length <= max) return collapsed
  if (!collapsed.includes(SITE_TAG)) return collapsed.slice(0, max)
  return [SITE_TAG, ...collapsed.filter((tag) => tag !== SITE_TAG).slice(0, max - 1)]
}

/**
 * The headers that cache a page at the CDN, tagged for purging. Vercel and
 * Cloud CDN read the CDN lifetime from their own header, beside a
 * `Cache-Control` that keeps the page out of the browser. CloudFront reads
 * lifetimes only from `Cache-Control`, so there the lifetime is `s-maxage` in
 * `Cache-Control` itself — browsers ignore it and revalidate every visit.
 */
export function cdnCacheHeaders(options: CdnCacheHeaderOptions): Record<string, string> {
  const lifetime = `s-maxage=${options.sMaxAgeSec}, stale-while-revalidate=${options.staleWhileRevalidateSec}`
  const headers: Record<string, string> =
    options.provider === 'cloudfront'
      ? { 'Cache-Control': `public, max-age=0, ${lifetime}` }
      : {
          'Cache-Control': 'public, max-age=0, must-revalidate',
          [cdnControlHeader(options.provider)]: `public, ${lifetime}`,
        }
  const tags = pageTagBudget(options.tags)
  if (tags.length > 0) headers[tagHeaderFor(options)] = tags.join(',')
  return headers
}

/** The headers of an editor's preview: never stored, never indexed */
export function previewHeaders(): Record<string, string> {
  return { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
}

function cdnControlHeader(provider: Exclude<CdnProvider, 'cloudfront'>): string {
  return provider === 'vercel' ? 'Vercel-CDN-Cache-Control' : 'CDN-Cache-Control'
}

function tagHeaderFor(options: CdnCacheHeaderOptions): string {
  switch (options.provider) {
    case 'vercel':
      return 'Vercel-Cache-Tag'
    case 'cloudfront':
      return options.tagHeader
    case 'gcp':
      return 'Cache-Tag'
  }
}
