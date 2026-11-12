import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import type { KranthoHandlerOptions } from '@krantho/server'
import { createKranthoHandler, MIME_TYPES } from '@krantho/server'
import { toWebRequest } from './node-request.js'
import { writeWebResponse } from './node-response.js'

/** Options for the standalone production server */
export interface StandaloneOptions extends KranthoHandlerOptions {
  /** Directory containing static files to serve (e.g., 'dist') */
  staticDir?: string | undefined
  /** Port to listen on (default: 3000) */
  port?: number | undefined
}

/**
 * Start a standalone HTTP server with API + optional static file serving.
 *
 * Requests to `/api/*` are routed to the krantho handler.
 * All other requests serve static files from `staticDir` (if configured).
 * Falls back to `index.html` for SPA client-side routing.
 */
export async function startServer(options: StandaloneOptions): Promise<void> {
  const port = options.port ?? 3000
  const handler = await createKranthoHandler({ ...options, framework: 'node' })

  const server = createServer(async (req, res) => {
    const url = req.url ?? '/'

    // API routes
    if (url.startsWith('/api/')) {
      try {
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
      return
    }

    // Static files
    if (options.staticDir) {
      const served = await serveStatic(res, options.staticDir, url)
      if (served) return

      // SPA fallback — serve index.html for non-file paths
      const indexServed = await serveStatic(res, options.staticDir, '/index.html')
      if (indexServed) return
    }

    res.statusCode = 404
    res.setHeader('content-type', 'text/plain')
    res.end('Not Found')
  })

  server.listen(port, () => {
    console.log(`krantho server listening on http://localhost:${port}`)
    if (options.staticDir) {
      console.log(`  Static files: ${options.staticDir}`)
    }
    console.log(`  API: http://localhost:${port}/api/`)
  })
}

async function serveStatic(
  res: import('node:http').ServerResponse,
  staticDir: string,
  urlPath: string,
): Promise<boolean> {
  const resolvedDir = resolve(staticDir)
  const safeRoot = resolvedDir.endsWith(sep) ? resolvedDir : resolvedDir + sep
  const filePath = resolve(join(staticDir, urlPath))

  // Prevent directory traversal — trailing separator prevents sibling-directory bypass
  if (!filePath.startsWith(safeRoot) && filePath !== resolvedDir) {
    return false
  }

  try {
    const stats = await stat(filePath)
    if (!stats.isFile()) return false

    const content = await readFile(filePath)
    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

    res.statusCode = 200
    res.setHeader('content-type', contentType)
    res.end(content)
    return true
  } catch {
    return false
  }
}
