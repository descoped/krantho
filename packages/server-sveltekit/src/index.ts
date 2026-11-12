import type { KranthoHandlerOptions } from '@krantho/server'
import { createLazyHandler, createStudioServer } from '@krantho/server'

export type { PageRequestOptions, PageRequestResult } from '@krantho/server'
export { createContentLoader, runPageRequest, verifyPreviewRequest } from '@krantho/server'
export { createPageCacheHandle } from './page-cache.js'
export type { KranthoHandlerOptions }

/**
 * Minimal RequestEvent shape — matches SvelteKit's RequestEvent
 * without requiring @sveltejs/kit as a build dependency.
 */
interface RequestEvent {
  request: Request
}

type SvelteKitHandler = (event: RequestEvent) => Promise<Response>

interface ApiHandlers {
  GET: SvelteKitHandler
  POST: SvelteKitHandler
  PUT: SvelteKitHandler
  DELETE: SvelteKitHandler
  PATCH: SvelteKitHandler
}

/**
 * Create SvelteKit endpoint handlers from krantho config.
 *
 * Returns { GET, POST, PUT, DELETE, PATCH } matching the export convention
 * for `src/routes/api/[...path]/+server.ts`.
 *
 * Each handler extracts `event.request` and delegates to the krantho handler.
 * The handler is initialized lazily on first request and reused (singleton).
 */
export function createApiHandlers(options: KranthoHandlerOptions): ApiHandlers {
  const getHandler = createLazyHandler({ ...options, framework: 'sveltekit' })

  async function handle(event: RequestEvent): Promise<Response> {
    const handler = await getHandler()
    return handler.handle(event.request)
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
 * Create a SvelteKit Studio route handler.
 *
 * Serves the @krantho/studio built SPA from the package's dist directory.
 * Pass the app's configuration to apply `auth.oidc.studioEntry`.
 * Use in `src/routes/studio/[...path]/+server.ts`.
 */
export function createStudioHandler(options: { config?: KranthoHandlerOptions['config'] } = {}): {
  GET: SvelteKitHandler
} {
  const serve = createStudioServer(options.config)
  return {
    async GET(event: RequestEvent): Promise<Response> {
      const { request } = event
      return serve({
        url: new URL(request.url),
        cookie: request.headers.get('cookie') ?? undefined,
      })
    },
  }
}
