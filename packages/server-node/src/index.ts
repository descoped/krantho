import type { KranthoHandler, KranthoHandlerOptions } from '@krantho/server'
import { createKranthoHandler } from '@krantho/server'

export type {
  ContentLoader,
  PageRequestOptions,
  PageRequestResult,
  StudioRequest,
  StudioServer,
} from '@krantho/server'
export {
  createContentLoader,
  createStudioServer,
  runPageRequest,
  verifyPreviewRequest,
} from '@krantho/server'
export { toWebRequest } from './node-request.js'
export { writeResponseHeaders, writeWebResponse } from './node-response.js'
export type {
  CachedPage,
  CachedPageHeaders,
  PageHeaders,
  PageRequestInfo,
  RenderedPage,
} from './page-cache.js'
export { renderCachedPage } from './page-cache.js'
export type { KranthoHandlerOptions }

/**
 * Create a raw handler for use with any Node.js HTTP server.
 *
 * Returns an object with `handle(request: Request): Promise<Response>`.
 * The handler is initialized lazily on first request and reused (singleton).
 *
 * Use this when integrating with Express, Fastify, or a custom Node.js server.
 * For Vite dev middleware, use `@krantho/server-node/vite` instead.
 * For a standalone production server, use `@krantho/server-node/standalone`.
 */
export function createHandler(options: KranthoHandlerOptions): KranthoHandler {
  let handlerPromise: Promise<KranthoHandler> | undefined

  function getHandler(): Promise<KranthoHandler> {
    if (!handlerPromise) {
      handlerPromise = createKranthoHandler({ ...options, framework: 'node' })
    }
    return handlerPromise
  }

  return {
    async handle(request: Request): Promise<Response> {
      const handler = await getHandler()
      return handler.handle(request)
    },
    close(): void {
      if (handlerPromise) {
        handlerPromise.then((h) => h.close()).catch(() => {})
      }
    },
  }
}
