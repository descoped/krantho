# krantho on Express and Vite

## Contents

- Files
- server.ts
- Content loader
- Alternatives to a full Express server
- Caching and preview

Grounded in `examples/react-ssr` of the krantho repository: one Express 5 server that mounts the
krantho API and Studio and renders React pages on the server, with Vite for development and the
client build. The same wiring serves any server-side renderer; the pages only need the content
loader.

## Files

```
krantho.config.ts
krantho.collections.ts
server.ts                 # Express: /api, /studio, sitemap, robots, pages
src/lib/cms.ts            # the content loader and render helpers
src/entry-server.tsx      # your SSR entry: render(url) → { status, html, head }
src/entry-client.tsx
vite.config.ts
content/<collection>/<slug>.md
```

## server.ts

```ts
import express from 'express'
import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from 'express'
import {
  createStudioServer,
  createHandler,
  renderCachedPage,
  toWebRequest,
  writeResponseHeaders,
} from '@krantho/server-node'
import config from './krantho.config'
import { collections } from './krantho.collections'

// Editors preview drafts through a short-lived link signed with auth.jwtSecret
const api = createHandler({ config, collections, sitePreview: 'signed-url' })
const serveStudio = createStudioServer(config)

const owns = (prefix: string, path: string) => path === prefix || path.startsWith(`${prefix}/`)

async function send(res: ExpressResponse, response: Response): Promise<void> {
  res.status(response.status)
  writeResponseHeaders(res, response)
  res.end(Buffer.from(await response.arrayBuffer()))
}

const app = express()

// Unmounted middleware: toWebRequest reads req.url, which a mount path would strip
app.use(async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  if (!owns('/api', req.path)) return next()
  try {
    await send(res, await api.handle(await toWebRequest(req)))
  } catch (error) {
    next(error)
  }
})

app.use(async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  if (!owns('/studio', req.path)) return next()
  const url = new URL(`http://localhost${req.originalUrl}`)
  await send(res, serveStudio({ url, cookie: req.headers.cookie }))
})

// The sitemap and robots.txt read no tagged content: no CDN purge reaches them, so no-cache
for (const [path, apiPath] of [['/sitemap.xml', '/api/seo/sitemap'], ['/robots.txt', '/api/seo/robots.txt']]) {
  app.get(path, async (req, res) => {
    const response = await api.handle(new Request(`http://${req.headers.host ?? 'localhost'}${apiPath}`))
    res.setHeader('Cache-Control', 'no-cache')
    await send(res, response)
  })
}

// Every page renders under the page cache rules. Pass req.originalUrl (it carries a preview
// token) and return every header the page sets from render — never write to res inside it.
app.use(async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  try {
    const page = await renderCachedPage({ url: req.originalUrl, method: req.method }, config, () =>
      renderPage(req.originalUrl), // → { status, html, headers? }
    )
    for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value)
    res.status(page.status).type('html').send(page.html)
  } catch (error) {
    next(error)
  }
})
```

`renderPage` is the app's own renderer: in development Vite's `ssrLoadModule('/src/entry-server.tsx')`
with `transformIndexHtml`, in production the built `dist/server/entry-server.js` with the built
`index.html` (serve `dist/client` with `express.static(dir, { index: false })`, so `/` stays a
page). `examples/react-ssr/server.ts` has both.

## Content loader

```ts
// src/lib/cms.ts
import { renderContent } from '@krantho/core'
import type { PublishedContent } from '@krantho/core'
import type { MarkedDocument } from '@krantho/core/marks'
import { createContentLoader } from '@krantho/server-node'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

const loader = createContentLoader({ config, collections })

async function render(doc: PublishedContent, preview: boolean) {
  const { html, sections } = await renderContent(doc.fields, doc.body)
  // The document, and whether this is an editor's preview: the Live marks apply
  const marked: MarkedDocument = { collection: doc.collection, slug: doc.slug, preview }
  return { slug: doc.slug, fields: doc.fields, html, body: doc.body, sections, doc: marked }
}

/** The published version of a document (its current version in a preview); null when it has none */
export async function loadContent(collection: string, slug: string) {
  const [doc, preview] = await Promise.all([loader.getPublished({ collection, slug }), loader.isPreview()])
  return doc ? render(doc, preview) : null
}

/** Every published document of a collection, rendered */
export async function loadCollection(collection: string) {
  const [docs, preview] = await Promise.all([loader.listPublished(collection), loader.isPreview()])
  return Promise.all(docs.map((doc) => render(doc, preview)))
}

/** The page's JSON-LD graph; null when nothing is published */
export function loadJsonLd(collection: string, slug: string) {
  return loader.jsonLd({ collection, slug })
}
```

Make every read inside `renderPage`, so the page request scope records its cache tags and
`isPreview()` sees an editor's preview. Mark every field and section a page renders for the
admin's Live mode, with the helpers from `@krantho/core/marks`: spread
`kranthoField(page.doc, 'title')` in JSX, `markAttributes(kranthoField(page.doc, 'title'))` in an
HTML string, `markBodySections(page.html, page.body, page.doc)` for a whole body. They add
nothing outside a preview. Client components from `@krantho/ui-react` mark only when the
`ContentData` you preload for them carries `document: page.doc`. Put the
title, meta description and the JSON-LD (escape `<` as `<` inside the script) in the head
your renderer returns. A missing page renders with `status: 404`.

## Alternatives to a full Express server

- **Vite plugin (development):** `kranthoPlugin({ config, collections })` from
  `@krantho/server-node/vite` adds `/api` and `/studio` to the Vite dev server.
- **Standalone server:** `startServer({ config, collections, staticDir: 'dist', port })` from
  `@krantho/server-node/standalone` serves `/api` and static files, with an SPA fallback; it
  does not serve `/studio`, so a site that needs Studio uses the Express wiring above. A
  client-only SPA reads content from the REST API (`/api/content/<collection>/<slug>`); it gets no
  server-rendered SEO and no page cache.

## Caching and preview

- `cache.pages: 'none'` (default) sends no cache headers. `KRANTHO_CACHE_PAGES=cdn` with
  `KRANTHO_CACHE_CDN_PROVIDER` (`cloudfront`, `gcp`, `vercel`) turns on tagged CDN caching and
  purges, with no code change.
- A response that sets a cookie, is not a `200` or `404`, or says `private`, `no-store` or
  `no-cache` itself is never cached.
- Signed preview links are verified with the secret the API signs with. Without
  `KRANTHO_JWT_SECRET` that is one ephemeral secret per process, enough on one dev server; set
  one value on every instance wherever more than one serves the site.
- On a serverless host pass the platform's `waitUntil` to `createHandler` so a purge completes.
