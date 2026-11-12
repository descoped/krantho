import type { KranthoHandlerOptions } from '@krantho/server'
import { servePageRequest } from '@krantho/server'

/** A page request as Express (or any Node server) sees it */
export interface PageRequestInfo {
  /** The full request path with its query string (Express: `req.originalUrl`), or an absolute URL */
  url: string
  method: string
}

/**
 * Response headers in Node's shape: what Express's `res.getHeaders()` returns,
 * and what `res.setHeader(name, value)` takes (an `undefined` value is skipped).
 */
export type PageHeaders = Record<string, string | number | readonly string[] | undefined>

/** The headers to send with a page, each ready for `res.setHeader(name, value)` */
export type CachedPageHeaders = Record<string, string | number | readonly string[]>

/** What a server-side render produced */
export interface RenderedPage {
  status: number
  html: string
  /**
   * The page's own response headers — a `Set-Cookie` among them, or a
   * `Cache-Control` saying `private`, `no-store` or `no-cache`, keeps the page
   * off the CDN
   */
  headers?: PageHeaders | undefined
}

/** A rendered page and every header to send with it */
export interface CachedPage {
  status: number
  html: string
  headers: CachedPageHeaders
}

/**
 * Render one page under the page cache rules.
 *
 * A `GET` or `HEAD` outside `/api` and `/studio` renders inside a page request
 * scope, so the content loader records its tags. A verified signed preview
 * link reads drafts and answers `private, no-store`, `noindex`, with no
 * referrer. Under `cache.pages: 'cdn'` a published `200` or `404` whose
 * headers set no cookie is cached at the CDN, tagged with every read that
 * rendered it — unless its own `Cache-Control` says `private`, `no-store` or
 * `no-cache`, which is then left as it is.
 *
 * The returned `headers` are the page's own merged with the cache headers,
 * the cache headers winning on a name both set; a `Set-Cookie` is always
 * passed through. Send every one:
 *
 * ```ts
 * const page = await renderCachedPage(req, config, render)
 * for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value)
 * res.status(page.status).send(page.html)
 * ```
 *
 * Start every content read inside `render`: a read made before it, or one that
 * outlives it, records no tags. Never read `loader.preview` outside `render` —
 * that puts a draft into a page the CDN caches.
 */
export async function renderCachedPage(
  req: PageRequestInfo,
  config: KranthoHandlerOptions['config'],
  render: () => Promise<RenderedPage>,
): Promise<CachedPage> {
  const { value, headers } = await servePageRequest(req, config, render, (page) => ({
    status: page.status,
    header: (name) => headerValue(page.headers ?? {}, name),
  }))
  return {
    status: value.status,
    html: value.html,
    headers: mergeHeaders(value.headers ?? {}, headers),
  }
}

/** A header by name, in any case, several values joined with `, ` — null when absent */
function headerValue(headers: PageHeaders, name: string): string | null {
  const wanted = name.toLowerCase()
  const values: string[] = []
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || key.toLowerCase() !== wanted) continue
    if (typeof value === 'object') values.push(...value)
    else values.push(String(value))
  }
  return values.length > 0 ? values.join(', ') : null
}

/** The page's headers, less any the cache headers replace (by name, in any case), plus those */
function mergeHeaders(page: PageHeaders, cache: Record<string, string>): CachedPageHeaders {
  const replaced = new Set(Object.keys(cache).map((name) => name.toLowerCase()))
  const merged: CachedPageHeaders = {}
  for (const [name, value] of Object.entries(page)) {
    if (value === undefined || replaced.has(name.toLowerCase())) continue
    merged[name] = value
  }
  return { ...merged, ...cache }
}
