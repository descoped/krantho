import type { KranthoHandlerOptions } from '@krantho/server'
import { createLazyHandler, createStudioServer } from '@krantho/server'
import type { Plugin, ViteDevServer } from 'vite'
import { toWebRequest } from './node-request.js'
import { writeWebResponse } from './node-response.js'

export type { KranthoHandlerOptions }

/**
 * Vite plugin that adds krantho API middleware to the dev server.
 *
 * Intercepts requests matching `/api/*` and routes them through the
 * krantho handler. All other requests pass through to Vite normally.
 */
export function kranthoPlugin(options: KranthoHandlerOptions): Plugin {
  const getHandler = createLazyHandler({ ...options, framework: 'node' })
  const serveStudio = createStudioServer(options.config)

  return {
    name: 'krantho-api',

    configureServer(server: ViteDevServer): void {
      // Serve Studio SPA
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/studio')) {
          next()
          return
        }

        let response: Response
        try {
          response = serveStudio({
            url: new URL(url, 'http://localhost'),
            cookie: req.headers.cookie,
          })
        } catch (err: unknown) {
          next(err)
          return
        }
        res.statusCode = response.status
        for (const [key, value] of response.headers) {
          res.setHeader(key, value)
        }
        response
          .arrayBuffer()
          .then((buf) => res.end(Buffer.from(buf)))
          .catch(() => {
            res.statusCode = 500
            res.end('Failed to read Studio asset')
          })
      })

      // Serve krantho API
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/')) {
          next()
          return
        }

        try {
          const handler = await getHandler()
          const webRequest = await toWebRequest(req)
          const response = await handler.handle(webRequest)
          await writeWebResponse(res, response)
        } catch {
          if (res.headersSent) {
            res.destroy()
            return
          }
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      })
    },
  }
}
