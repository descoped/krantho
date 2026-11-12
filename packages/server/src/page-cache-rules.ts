import type { KranthoConfig, KranthoConfigInput } from '@krantho/config'
import { loadConfig } from '@krantho/config/node'
import { cdnCacheHeaders, previewHeaders } from '@krantho/core'
import { runPageRequest } from './page-request.js'
import { verifyPreviewRequest } from './preview-token.js'

/**
 * The page cache rules every framework adapter serves pages by.
 *
 * A `GET` or `HEAD` outside `/api` and `/studio` renders inside a page request
 * scope. With a verified signed preview token it reads drafts and answers
 * never stored and never indexed. Otherwise it reads the published version
 * and, under `cache.pages: 'cdn'`, a `200` or `404` that sets no cookie and
 * whose own `Cache-Control` is not `private`, `no-store` or `no-cache` is
 * cached at the CDN, tagged with every read that rendered it. Everything else
 * renders outside a scope and gets no headers.
 */

/** The request a page is rendered for */
export interface PageCacheRequest {
  /** Absolute, or a path with its query string */
  url: string | URL
  method: string
}

/** What the rules need to know about a rendered page's response */
export interface RenderedPageInfo {
  status: number
  /**
   * One of the response's own headers by name, in any case — several values
   * joined with `, ` — or null when it has none
   */
  header: (name: string) => string | null
}

/** A rendered page and the headers the rules add to it */
export interface ServedPage<T> {
  value: T
  headers: Record<string, string>
}

/** `Cache-Control` directives by which a page keeps itself out of any shared cache */
const UNCACHEABLE_DIRECTIVES: ReadonlySet<string> = new Set(['private', 'no-store', 'no-cache'])

/** Paths the krantho API and Studio own — never a page */
const KRANTHO_PREFIXES = ['/api', '/studio'] as const

/** Only a path needs a base; its origin is never used */
const URL_BASE = 'http://localhost'

/**
 * Render one page under the page cache rules.
 *
 * Start every content read inside `render`: a read started before it, or one
 * that outlives it, records no tags. Never call `runPageRequest` inside
 * `render` — a nested scope's tags do not reach this one.
 */
export async function servePageRequest<T>(
  request: PageCacheRequest,
  config: KranthoConfigInput,
  render: () => Promise<T>,
  inspect: (value: T) => RenderedPageInfo,
): Promise<ServedPage<T>> {
  const url = requestUrl(request.url)
  if (!isPageRequest(url, request.method)) return { value: await render(), headers: {} }

  const resolved = loadConfig({ code: config, env: process.env })
  if (verifyPreviewRequest(url, resolved)) {
    const { value } = await runPageRequest({ preview: true }, render)
    return { value, headers: { ...previewHeaders(), 'Referrer-Policy': 'no-referrer' } }
  }

  const { value, tags } = await runPageRequest({ preview: false }, render)
  return { value, headers: publishedPageHeaders(resolved, inspect(value), tags) }
}

/**
 * A path is appended to the base, never resolved against it: resolving
 * would read `//studio/x` as the host `admin` and the path `/x`.
 */
function requestUrl(url: string | URL): URL {
  if (typeof url === 'string' && url.startsWith('/')) return new URL(`${URL_BASE}${url}`)
  return new URL(url)
}

/** A `GET` or `HEAD` for a path the krantho API and Studio do not own */
function isPageRequest(url: URL, method: string): boolean {
  const verb = method.toUpperCase()
  if (verb !== 'GET' && verb !== 'HEAD') return false
  return !isKranthoPath(url.pathname)
}

/**
 * Whether a path belongs to the API or Studio, however it is spelled:
 * percent-encoded, in any case, or with repeated slashes. A path that does not
 * decode is treated as theirs, so it is never cached as a page.
 */
function isKranthoPath(pathname: string): boolean {
  let path: string
  try {
    path = decodeURIComponent(pathname)
  } catch {
    return true
  }
  const normal = path.replace(/\/{2,}/g, '/').toLowerCase()
  return KRANTHO_PREFIXES.some((prefix) => normal === prefix || normal.startsWith(`${prefix}/`))
}

function publishedPageHeaders(
  config: KranthoConfig,
  page: RenderedPageInfo,
  tags: readonly string[],
): Record<string, string> {
  const { pages, cdn } = config.cache
  if (pages !== 'cdn' || cdn.provider === 'none') return {}
  if (page.status !== 200 && page.status !== 404) return {}
  if (!isShareable(page)) return {}
  return cdnCacheHeaders({
    tags,
    provider: cdn.provider,
    sMaxAgeSec: cdn.sMaxAgeSec,
    staleWhileRevalidateSec: cdn.staleWhileRevalidateSec,
    tagHeader: cdn.tagHeader,
  })
}

/**
 * Whether a page's own response lets a shared cache keep it: it sets no
 * cookie, and its own `Cache-Control`, if any, says none of `private`,
 * `no-store` or `no-cache` — a page that depends on the visitor's cookie or
 * credentials says so there, and that header is left as the page set it.
 */
function isShareable(page: RenderedPageInfo): boolean {
  if (page.header('set-cookie') !== null) return false
  const cacheControl = page.header('cache-control')
  if (cacheControl === null) return true
  return !cacheControl
    .split(',')
    .some((directive) =>
      UNCACHEABLE_DIRECTIVES.has(directive.split('=')[0]?.trim().toLowerCase() ?? ''),
    )
}
