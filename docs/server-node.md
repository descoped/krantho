# @krantho/server-node

Node.js adapter for krantho. Provides three entry points: a raw handler for custom HTTP servers, a Vite plugin for development, and a standalone production server with static file serving. For an Express (or any Node) server that renders its own pages, it adds the pieces to mount the API and Studio, read published content, and serve pages under the page cache rules: CDN headers and cache tags with `cache.pages: 'cdn'`, drafts behind a signed preview link.

## Context

Not every Node.js project uses Next.js or SvelteKit. This package bridges the krantho handler to plain Node.js HTTP servers, Vite dev middleware, and standalone production servers. It handles the conversion between Node.js `IncomingMessage` and the Web `Request` API that `@krantho/server` expects.

## Rationale

- **Three entry points** -- `@krantho/server-node` (raw handler), `@krantho/server-node/vite` (dev plugin), `@krantho/server-node/standalone` (production server). Import only what you need.
- **Vite plugin** intercepts `/api/*` and `/studio` requests in the dev server middleware, passing everything else to Vite for HMR and asset serving.
- **Standalone server** adds static file serving with SPA fallback on top of the API handler, suitable for production deployments without a framework.

## Architecture

```
src/
  index.ts          -- createHandler (raw handler for custom servers), re-exports from @krantho/server
  page-cache.ts     -- renderCachedPage (page cache rules for a server-side render)
  vite.ts           -- kranthoPlugin (Vite dev middleware)
  standalone.ts     -- startServer (production HTTP server)
  node-request.ts   -- toWebRequest (IncomingMessage -> Web Request)
  node-response.ts  -- writeResponseHeaders, writeWebResponse (Web Response -> ServerResponse, body streamed)
```

Package exports:
- `@krantho/server-node` -- `createHandler`, `renderCachedPage`, `toWebRequest`, `writeResponseHeaders`, `writeWebResponse`; re-exported from `@krantho/server`: `createContentLoader`, `createStudioServer`, `runPageRequest`, `verifyPreviewRequest`
- `@krantho/server-node/vite` -- `kranthoPlugin`
- `@krantho/server-node/standalone` -- `startServer`, `StandaloneOptions`

## API Reference

### `createHandler(options: KranthoHandlerOptions): KranthoHandler`

Creates a raw handler for use with any Node.js HTTP server. The handler is initialized lazily on the first request and reused. Like `kranthoPlugin` and `startServer`, it names its framework, so `/api/capabilities` reports `framework: 'node'`.

```typescript
import { createHandler } from '@krantho/server-node'

const handler = createHandler({ config, collections })
const response = await handler.handle(request)
```

Returns a `KranthoHandler` with `handle(request: Request): Promise<Response>` and `close()`, which stops the file watcher once the handler has started.

### `renderCachedPage(req, config, render): Promise<CachedPage>`

Renders one page under the page cache rules (`servePageRequest`, see [server.md](server.md#servepagerequestrequest-config-render-inspect)).

```typescript
interface PageRequestInfo {
  /** The full request path with its query string (Express: `req.originalUrl`), or an absolute URL */
  url: string
  method: string
}

interface RenderedPage {
  status: number
  html: string
  /** The page's own response headers */
  headers?: PageHeaders | undefined
}

interface CachedPage {
  status: number
  html: string
  /** The page's headers merged with the cache headers, each ready for `res.setHeader()` */
  headers: CachedPageHeaders
}

function renderCachedPage(
  req: PageRequestInfo,
  config: KranthoConfigInput,
  render: () => Promise<RenderedPage>,
): Promise<CachedPage>
```

- A `GET` or `HEAD` outside `/api` and `/studio` renders inside a page request scope, so the content loader records the cache tags of every read made inside `render`.
- With a verified signed preview token (`?krantho-preview=`) every read comes from the current version, draft included, and the page answers `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`.
- Under `cache.pages: 'cdn'`, a published `200` or `404` gets the CDN headers of `cache.cdn.provider` with its tags -- unless the headers `render` returned carry a `Set-Cookie`, or a `Cache-Control` saying `private`, `no-store` or `no-cache`, which is then left as it is.
- The returned `headers` are the page's own, merged with the cache headers; the cache headers win on a name both set, and a `Set-Cookie` is always passed through.

Pass `req.originalUrl`: under a mounted router `req.url` loses the mount path, and with it the query string that carries a preview token. Return every header the page sets from `render` and set them from the result -- a header written to `res` inside `render` is invisible to the rules, and a cookie set there would be cached.

### `toWebRequest(req: IncomingMessage): Promise<Request>`

Converts a Node request (Express's included) into a Web `Request` for `createHandler().handle()`, reading the body for `POST`, `PUT` and `PATCH`.

### `writeResponseHeaders(res: ServerResponse, response: Response): void`

Copies a Web `Response`'s headers onto a Node response, one `Set-Cookie` line per cookie.

### `writeWebResponse(res: ServerResponse, response: Response): Promise<void>`

Writes a Web `Response` to a Node response: the status, the headers (through `writeResponseHeaders`), flushed at once, then the body chunk by chunk as it arrives. Use it for every krantho API and Studio response.

- **Streaming.** A streamed body — the [Studio assistant](assistant.md)'s `text/event-stream` chat — reaches the client as it is produced, not when it ends.
- **Backpressure.** When `res.write()` reports a full buffer, the next chunk waits for `drain` (or `close`).
- **Client gone.** When the response closes before the body ends, the body stream is cancelled, which stops the work producing it.
- **Failure after the headers.** A body that fails once the headers are sent destroys the response; no status can be written at that point. A caller's own `catch` must do the same when `res.headersSent` is true, and write its 500 only otherwise.
- **Binary.** Bytes are written as they are, so media images pass through intact.

Express's `res` is a Node `ServerResponse`, so it takes it directly. `startServer` and `kranthoPlugin` write every API response with it.

### `createContentLoader`, `createStudioServer`, `runPageRequest`, `verifyPreviewRequest`

Re-exported from `@krantho/server` (see [server.md](server.md)): the published-content loader pages read through, the `/studio` server, the page request scope and the signed preview check. Types `ContentLoader`, `StudioRequest`, `StudioServer`, `PageRequestOptions` and `PageRequestResult` come with them.

### `kranthoPlugin(options: KranthoHandlerOptions): Plugin`

*Import from `@krantho/server-node/vite`*

Vite plugin that adds krantho API and Studio middleware to the dev server. Intercepts `/api/*` routes and `/studio` paths; all other requests pass through to Vite. API responses are written with `writeWebResponse`.

```typescript
import { kranthoPlugin } from '@krantho/server-node/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    kranthoPlugin({ config, collections }),
  ],
})
```

### `startServer(options: StandaloneOptions): Promise<void>`

*Import from `@krantho/server-node/standalone`*

Starts a standalone HTTP server with API routing and optional static file serving. API responses are written with `writeWebResponse`, so streamed responses stream and binary responses keep their bytes.

```typescript
interface StandaloneOptions extends KranthoHandlerOptions {
  staticDir?: string | undefined
  port?: number | undefined
}
```

- `staticDir` -- directory for static files (e.g., `'dist'`). Falls back to `index.html` for SPA routing.
- `port` -- defaults to `3000`.

Requests to `/api/*` route to the krantho handler. All other requests serve static files from `staticDir`.

```typescript
import { startServer } from '@krantho/server-node/standalone'

await startServer({
  config,
  collections,
  staticDir: 'dist',
  port: 3000,
})
```

### `KranthoHandlerOptions` (re-exported type)

Same options object as `@krantho/server`. See [server.md](server.md) for full documentation.

## Usage

### Express with Server-Rendered Pages

One Express server mounts the krantho API and Studio and renders every page through `renderCachedPage`. Pages read the published version through `createContentLoader({ config, collections })`, from the database the API opens -- keep the collections in one module both import.

```typescript
import express from 'express'
import {
  createStudioServer,
  createHandler,
  renderCachedPage,
  toWebRequest,
  writeWebResponse,
} from '@krantho/server-node'
import config from './krantho.config'
import { collections } from './krantho.collections'

// Editors preview drafts through a short-lived link signed with auth.jwtSecret
const api = createHandler({ config, collections, sitePreview: 'signed-url' })
const serveStudio = createStudioServer(config)

const owns = (prefix: string, path: string) => path === prefix || path.startsWith(`${prefix}/`)

const app = express()
// Unmounted middleware: toWebRequest reads req.url, which a mount path would strip
app.use(async (req, res, next) => {
  if (!owns('/api', req.path)) return next()
  // Streams the body: the assistant's chat arrives as it is written, media bytes stay intact
  await writeWebResponse(res, await api.handle(await toWebRequest(req)))
})
app.use(async (req, res, next) => {
  if (!owns('/studio', req.path)) return next()
  const url = new URL(`http://localhost${req.originalUrl}`)
  await writeWebResponse(res, serveStudio({ url, cookie: req.headers.cookie }))
})
app.use(async (req, res) => {
  const page = await renderCachedPage({ url: req.originalUrl, method: req.method }, config, () =>
    render(req.originalUrl), // your SSR entry: { status, html, headers? }
  )
  for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value)
  res.status(page.status).type('html').send(page.html)
})
```

With the default `cache.pages: 'none'` pages get no cache headers; the environment turns on a CDN (`KRANTHO_CACHE_PAGES=cdn`, `KRANTHO_CACHE_CDN_PROVIDER=cloudfront|gcp|vercel` and the provider's settings) with no code change. Serve `/sitemap.xml` and `/robots.txt` from the API (`/api/seo/sitemap`, `/api/seo/robots.txt`) with `Cache-Control: no-cache`: they read no tagged content, so no purge would reach them at a CDN. The providers and the purge behaviour are in the [page caching guide](guides/page-caching.md); `examples/react-ssr` is the reference.

A content change purges the CDN in the background, after the API response. A long-running server completes the purge; on a serverless host pass the platform's `waitUntil` to `createHandler` (on Vercel, `waitUntil` from `@vercel/functions`), or the purge may be cut off -- a lost purge is bounded by `s-maxage`. Set `KRANTHO_JWT_SECRET` for signed preview links: without a configured secret the API signs with an ephemeral one the page cannot verify.

### Custom Server

```typescript
import { createServer } from 'node:http'
import { createHandler, toWebRequest, writeWebResponse } from '@krantho/server-node'

const handler = createHandler({ config, collections })

const server = createServer(async (req, res) => {
  const response = await handler.handle(await toWebRequest(req))
  await writeWebResponse(res, response)
})

server.listen(3000)
```

### Vite Development

```typescript
// vite.config.ts
import { kranthoPlugin } from '@krantho/server-node/vite'

export default defineConfig({
  plugins: [kranthoPlugin({ config, collections })],
})
```

### Standalone Production

```typescript
// server.ts
import { startServer } from '@krantho/server-node/standalone'

await startServer({
  config,
  collections,
  staticDir: 'dist',
  port: Number(process.env.PORT ?? 3000),
})
```

## Dependencies

### Workspace Dependencies

- `@krantho/server` -- `createKranthoHandler`, `createLazyHandler`, `createStudioServer`, `createContentLoader`, `servePageRequest`, `runPageRequest`, `verifyPreviewRequest`, `MIME_TYPES`

### Peer Dependencies

- `vite` (>=8.0.0, optional) -- only needed when using `@krantho/server-node/vite`
