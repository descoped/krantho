import type { ContentChange } from '@krantho/core'
import type { KranthoHandlerOptions } from '@krantho/server'
import { createLazyHandler, createStudioServer } from '@krantho/server'
import { after } from 'next/server.js'
import { pageCacheSwitch } from './page-cache.js'
import { invalidatePages, withPageRefresh } from './page-refresh.js'
import { handleSitePreview } from './site-preview.js'

export { createContentLoader } from './content-loader.js'
export { showPreviewBanner } from './site-preview.js'
export type { KranthoHandlerOptions }

type RouteHandler = (request: Request) => Promise<Response>

/** The second argument Next.js passes a route handler: the matched dynamic segments */
interface RouteContext {
  params: Promise<Record<string, string | string[] | undefined>>
}

type ApiRouteHandler = (request: Request, context: RouteContext) => Promise<Response>

interface ApiRouteHandlers {
  GET: ApiRouteHandler
  POST: ApiRouteHandler
  PUT: ApiRouteHandler
  DELETE: ApiRouteHandler
  PATCH: ApiRouteHandler
}

/**
 * Create Next.js App Router route handlers from krantho config.
 *
 * Returns { GET, POST, PUT, DELETE, PATCH } matching the export convention
 * for `app/api/[...path]/route.ts`.
 *
 * The handler is initialized lazily on first request and reused across
 * subsequent requests (singleton pattern for serverless). Background jobs run
 * under `after()`, so the platform keeps them alive past the response. With
 * `cache.pages: 'next-isr'`, every committed write invalidates the cached pages
 * that read what it changed, and a published document's page is rendered
 * again right after the request.
 */
export function createApiRouteHandlers(options: KranthoHandlerOptions): ApiRouteHandlers {
  const cachesPages = pageCacheSwitch(options.config)

  const getHandler = createLazyHandler({
    ...options,
    onContentChange: async (change: ContentChange) => {
      if (cachesPages()) invalidatePages(change, options.collections)
      await options.onContentChange?.(change)
    },
    // Called only by a handler, inside its request, where after() is available
    waitUntil: (work) => after(() => work),
    sitePreview: 'draft-mode',
    framework: 'next',
  })

  async function handle(request: Request, context: RouteContext): Promise<Response> {
    const handler = await getHandler()
    const apiRequest = await withApiPath(request, context)
    const preview = await handleSitePreview(apiRequest, () => handler.handle(apiRequest))
    if (preview) return preview
    if (!cachesPages()) return handler.handle(apiRequest)
    return withPageRefresh(request, () => handler.handle(apiRequest))
  }

  return {
    GET: handle,
    POST: handle,
    PUT: handle,
    DELETE: handle,
    PATCH: handle,
  }
}

/**
 * A rewrite such as `/robots.txt` → `/api/seo/robots.txt` reaches the catch-all
 * route with the visitor's URL. The catch-all segments carry the path it was
 * rewritten to, so rebuild the `/api` path the router expects from them.
 */
async function withApiPath(request: Request, context: RouteContext): Promise<Request> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return request
  const segments = Object.values(await context.params).find(Array.isArray)
  if (!segments) return request
  url.pathname = `/api/${segments.map(encodeURIComponent).join('/')}`
  return new Request(url, request)
}

/**
 * Create Next.js App Router route handlers for Studio.
 *
 * Serves the @krantho/studio built SPA from the package's dist directory.
 * Pass the app's configuration to apply `auth.oidc.studioEntry`.
 * Use in `app/studio/[[...slug]]/route.ts`.
 */
export function createStudioRouteHandler(
  options: { config?: KranthoHandlerOptions['config'] } = {},
): {
  GET: RouteHandler
} {
  const serve = createStudioServer(options.config)
  return {
    async GET(request: Request): Promise<Response> {
      return serve({
        url: new URL(request.url),
        cookie: request.headers.get('cookie') ?? undefined,
      })
    },
  }
}
