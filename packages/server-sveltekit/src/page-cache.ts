import type { KranthoHandlerOptions } from '@krantho/server'
import { servePageRequest } from '@krantho/server'

/**
 * The part of SvelteKit's RequestEvent the page cache reads, without
 * requiring @sveltejs/kit as a build dependency. `url` is the page's URL —
 * for a `__data.json` request SvelteKit strips the suffix, so a preview token
 * signed for the page verifies on its data request too.
 */
interface PageCacheEvent {
  url: URL
  request: Request
}

/** SvelteKit's `handle` hook input, generic so the hook assigns to `Handle` */
interface PageCacheHandleInput<E extends PageCacheEvent> {
  event: E
  resolve: (event: E) => Response | Promise<Response>
}

type PageCacheHandle = <E extends PageCacheEvent>(
  input: PageCacheHandleInput<E>,
) => Promise<Response>

/**
 * A SvelteKit `handle` hook that serves pages under the page cache rules.
 *
 * Every `GET` and `HEAD` outside `/api` and `/studio` — `__data.json` requests
 * included — renders inside a page request scope, so the content loader
 * records its tags. A verified signed preview link reads drafts and answers
 * `private, no-store`, `noindex`, with no referrer. Under `cache.pages: 'cdn'`
 * a published `200` or `404` that sets no cookie is cached at the CDN, tagged
 * with every read that rendered it — unless its own `Cache-Control` says
 * `private`, `no-store` or `no-cache`, which is then left as it is.
 *
 * Start every read inside a `load` (or the page itself), never in another
 * hook: a read made before `resolve`, or streamed after it returns, records no
 * tags. Never read `loader.preview` in a hook — that puts a draft into a page
 * the CDN caches.
 *
 * ```ts
 * // src/hooks.server.ts
 * export const handle = createPageCacheHandle({ config })
 * ```
 */
export function createPageCacheHandle(options: {
  config: KranthoHandlerOptions['config']
}): PageCacheHandle {
  return async ({ event, resolve }) => {
    const { value: response, headers } = await servePageRequest(
      { url: event.url, method: event.request.method },
      options.config,
      async () => resolve(event),
      (page) => ({ status: page.status, header: (name) => page.headers.get(name) }),
    )
    const names = Object.keys(headers)
    if (names.length === 0) return response
    const copy = new Response(response.body, response)
    for (const name of names) copy.headers.set(name, headers[name] as string)
    return copy
  }
}
