import type { KranthoConfig } from '@krantho/config'
import type { ContentChange, ContentChangeListener, PageCollection } from '@krantho/core'
import { documentPath, pageCollection } from '@krantho/core'

/** The shared IndexNow endpoint; participating engines (Bing among them) share submissions */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/** IndexNow accepts at most this many URLs in one submission */
const MAX_URLS_PER_SUBMISSION = 10_000

/** A site's IndexNow identity */
export interface IndexNowSite {
  /** The site's canonical origin (`site.baseUrl`) */
  baseUrl: string
  /** The key the site serves at `<baseUrl>/<key>.txt` */
  key: string
}

/**
 * Tell IndexNow that these URLs changed (added, updated or removed). Every URL
 * must be on the site's host. Resolves with the HTTP status of each request
 * when IndexNow accepted them all (200, or 202 while it validates the key),
 * and throws otherwise.
 */
export async function submitIndexNow(
  site: IndexNowSite,
  urls: readonly string[],
  fetchFn: typeof fetch = fetch,
): Promise<number[]> {
  const origin = new URL(site.baseUrl)
  const statuses: number[] = []
  for (let start = 0; start < urls.length; start += MAX_URLS_PER_SUBMISSION) {
    const response = await fetchFn(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: origin.host,
        key: site.key,
        keyLocation: `${origin.origin}/${site.key}.txt`,
        urlList: urls.slice(start, start + MAX_URLS_PER_SUBMISSION),
      }),
    })
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`IndexNow rejected ${urls.length} URLs: HTTP ${response.status}`)
    }
    statuses.push(response.status)
  }
  return statuses
}

/** One log line for an accepted submission: how many URLs, IndexNow's answer, and the URLs */
export function describeSubmission(urls: readonly string[], statuses: readonly number[]): string {
  const count = urls.length === 1 ? '1 URL' : `${urls.length} URLs`
  return `IndexNow: submitted ${count}, HTTP ${statuses.join(', ')}\n${urls.map((url) => `  ${url}`).join('\n')}`
}

/** The URLs a content change touched, or none to submit */
export type ChangedUrls = (change: ContentChange) => Promise<readonly string[]>

/**
 * The pages a change touched: a document's page when its published version
 * changed (a draft save touches none), every page in the sitemap after a
 * site-wide change such as the startup import.
 */
export function changedUrlsFor(
  baseUrl: string,
  collections: Readonly<Record<string, PageCollection>>,
  listSitemap: () => Promise<readonly string[]>,
): ChangedUrls {
  const origin = baseUrl.replace(/\/$/, '')
  return async (change) => {
    if (change.kind === 'site') return listSitemap()
    if (change.kind !== 'document' || !change.live) return []
    const path = documentPath(pageCollection(collections, change.collection), change.slug)
    return path === null ? [] : [`${origin}${path}`]
  }
}

/** Local development serves the configured site from a machine nobody indexes */
function isLocal(baseUrl: string): boolean {
  const host = new URL(baseUrl).hostname
  return (
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  )
}

/**
 * A change listener that notifies IndexNow of the pages a committed write
 * touched, when `seo.indexNow.key` is set, the site is not on a local host and
 * the server runs in production: a development server configured for the real
 * site would otherwise announce its draft pages under the site's domain.
 * The submission runs alongside the response (`waitUntil` on serverless hosts)
 * and never fails the write; every submission is logged with IndexNow's answer.
 */
export function indexNowChangeListener(
  config: KranthoConfig,
  nodeEnv: string | undefined,
  changedUrls: ChangedUrls,
  waitUntil?: ((work: Promise<unknown>) => void) | undefined,
  fetchFn: typeof fetch = fetch,
): ContentChangeListener | null {
  const key = config.seo.indexNow.key
  const baseUrl = config.site.baseUrl
  if (!key || isLocal(baseUrl) || nodeEnv !== 'production') return null

  return (change) => {
    const work = changedUrls(change)
      .then(async (urls) => {
        if (urls.length === 0) return
        const statuses = await submitIndexNow({ baseUrl, key }, urls, fetchFn)
        console.log(`[indexnow] ${describeSubmission(urls, statuses)}`)
      })
      .catch((error: unknown) => console.error('[indexnow] notification failed:', error))
    try {
      waitUntil?.(work)
    } catch (error) {
      console.error('[indexnow] waitUntil rejected the notification:', error)
    }
  }
}
