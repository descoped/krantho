# @krantho/server-sveltekit

SvelteKit adapter for krantho. Returns endpoint handlers (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) compatible with SvelteKit's `+server.ts` convention, Studio SPA serving, and a `handle` hook that serves pages under the page cache rules: CDN headers and cache tags with `cache.pages: 'cdn'`, drafts behind a signed preview link.

## Context

SvelteKit routes API endpoints via `+server.ts` files that export named handler functions. Each handler receives a `RequestEvent` containing the Web `Request`. This package wraps `@krantho/server` to produce those exports directly.

## Rationale

- **Thin adapter** -- all logic lives in `@krantho/server`. This package extracts `event.request` and delegates.
- **No `@sveltejs/kit` build dependency** -- uses a minimal `RequestEvent` interface (`{ request: Request }`) that matches SvelteKit's shape without importing the framework.
- **Lazy singleton** -- handler is created on the first request and reused across subsequent invocations.

## Architecture

- `index.ts` -- `createApiHandlers` delegates to `createLazyHandler` from `@krantho/server`; `createStudioHandler` serves the Studio SPA through `createStudioServer`. Re-exports `createContentLoader`, `runPageRequest` and `verifyPreviewRequest` from `@krantho/server` for `load` functions and hooks.
- `page-cache.ts` -- `createPageCacheHandle`: a SvelteKit `handle` hook over `servePageRequest` from `@krantho/server`, the page cache rules every adapter shares.

## API Reference

### `createApiHandlers(options: KranthoHandlerOptions): ApiHandlers`

Returns an object with `GET`, `POST`, `PUT`, `DELETE`, `PATCH` handlers matching SvelteKit's endpoint convention. The handler names its framework, so `/api/capabilities` reports `framework: 'sveltekit'`.

```typescript
interface RequestEvent {
  request: Request
}

interface ApiHandlers {
  GET: (event: RequestEvent) => Promise<Response>
  POST: (event: RequestEvent) => Promise<Response>
  PUT: (event: RequestEvent) => Promise<Response>
  DELETE: (event: RequestEvent) => Promise<Response>
  PATCH: (event: RequestEvent) => Promise<Response>
}
```

### `createStudioHandler(options?: { config?: KranthoConfigInput }): { GET: (event: RequestEvent) => Promise<Response> }`

Returns a `GET` handler that serves the `@krantho/studio` SPA. Returns a 503 response if admin is not built. Pass the app's configuration to apply `auth.oidc.studioEntry` (see [server.md](server.md#createadminserverconfig-kranthoconfiginput-adminserver)).

### `createContentLoader(options: { config, collections }): IPublishedContentLoader & IPublishedSeoLoader`

Re-exported from `@krantho/server`. Page `load` functions read the live (published) version of each document through it, from the database the API route opens (see [server.md](server.md#createcontentloaderoptions--config-collections--ipublishedcontentloader--ipublishedseoloader)).

### `createPageCacheHandle(options: { config: KranthoConfigInput }): Handle`

A SvelteKit `handle` hook that serves every page under the page cache rules (`servePageRequest`, see [server.md](server.md#servepagerequestrequest-config-render-inspect)):

- A `GET` or `HEAD` outside `/api` and `/studio` -- `__data.json` requests included -- renders inside a page request scope, so the content loader records the cache tags of every read.
- With a verified signed preview token (`?krantho-preview=`, see [Editor preview](#editor-preview)) every read comes from the current version, draft included, and the response is `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`.
- Under `cache.pages: 'cdn'`, a published `200` or `404` that sets no cookie, and whose own `Cache-Control` says none of `private`, `no-store` or `no-cache`, gets the CDN headers of `cache.cdn.provider` with its tags (see [core.md](core.md#cdn-cache-headers)). Everything else is returned as it rendered.

Headers are set on a copy of the response, never with `setHeaders`. The hook reads only `event.url` and `event.request`, so the package still needs no `@sveltejs/kit` build dependency; the returned function assigns to `Handle`.

### `runPageRequest(options, render)`, `verifyPreviewRequest(url, config)`

Re-exported from `@krantho/server` (see [server.md](server.md#runpagerequestoptions-render)) for hooks that render outside `createPageCacheHandle`.

### `KranthoHandlerOptions` (re-exported type)

Same options object as `@krantho/server`. See [server.md](server.md) for full documentation.

## Usage

### API Endpoint

Create `src/routes/api/[...path]/+server.ts`:

```typescript
import { createApiHandlers } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'
import { collections } from '../../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiHandlers({
  config,
  collections,
})
```

### Studio endpoint

Create `src/routes/studio/[...path]/+server.ts`:

```typescript
import { createStudioHandler } from '@krantho/server-sveltekit'

export const { GET } = createStudioHandler()
```

### Page Cache

Serve every page through the page cache hook in `src/hooks.server.ts`:

```typescript
import type { Handle } from '@sveltejs/kit/hooks'
import { createPageCacheHandle } from '@krantho/server-sveltekit'
import config from '../krantho.config'

export const handle: Handle = createPageCacheHandle({ config })
```

With the default `cache.pages: 'none'` it adds no headers; the environment turns on a CDN (`KRANTHO_CACHE_PAGES=cdn`, `KRANTHO_CACHE_CDN_PROVIDER=cloudfront|gcp|vercel` and the provider's settings) with no code change. The providers, what each needs from the host, and the purge behaviour are in the [page caching guide](guides/page-caching.md).

Rules that keep a cached page correct:

- **Outermost.** Put `createPageCacheHandle` first in `sequence()`. An outer hook that appends a `Set-Cookie` after it bypasses the cookie check.
- **Reads inside `load`.** A read made in another hook before `resolve`, or streamed after the response, records no tags. Never read `loader.preview` in a hook: that puts a draft into a page the CDN caches.
- **No internal page fetches.** An `event.fetch` to another page route runs the hook again in a nested scope, whose tags never reach the outer page; forwarding the page's query string to it can render a draft inside a cached page. Read content through the loader.
- **No `kit.paths.base`.** Not supported: `/base/studio` would be treated as a page.
- **Remote functions.** Experimental remote functions are classified by their page path: a remote `GET` query that reads a cookie must answer `Cache-Control: private` itself, or it is cached as that page.

`/sitemap.xml` and `/robots.txt` read no tagged content, so no purge reaches them: proxy them from the API with `Cache-Control: no-cache`, as the examples do.

A content change purges the CDN in the background, after the API response. `adapter-node` keeps the server running, so the purge completes; on a serverless host pass the platform's `waitUntil` to `createApiHandlers` (on Vercel, `waitUntil` from `@vercel/functions`), or the purge may be cut off when the function ends -- a lost purge is bounded by `s-maxage`.

### Editor preview

Pass `sitePreview: 'signed-url'` to `createApiHandlers`. The Studio editor's **Open on site** then calls `GET /api/preview`, which redirects an editor to the page with a short-lived token (see [api.md](api.md#site-preview)); `createPageCacheHandle` verifies it and renders the draft, never cached. Without a configured secret the API and the hook share the process's ephemeral secret, which is enough on one server in development; with several instances or serverless functions set `KRANTHO_JWT_SECRET`, or a link signed by one instance renders the published page on another. Inside a preview `loader.isPreview()` answers `true`; `load` passes it to the Live marks as the document's `preview` (see [ui-svelte.md](ui-svelte.md)).

### Page Content

Read published content in `src/lib/cms.ts` and render it with `renderContent()` from `@krantho/core`:

```typescript
// src/lib/cms.ts
import { renderContent } from '@krantho/core'
import { createContentLoader } from '@krantho/server-sveltekit'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

const loader = createContentLoader({ config, collections })

/** The published version of a document; null when it has none */
export async function loadContent(collection: string, slug: string) {
  const doc = await loader.getPublished({ collection, slug })
  if (!doc) return null
  const { html, sections } = await renderContent(doc.fields, doc.body)
  return { slug: doc.slug, fields: doc.fields, html, sections }
}
```

```typescript
// src/routes/+page.server.ts
import { error } from '@sveltejs/kit'
import { loadContent } from '#lib/cms.ts'

export async function load() {
  const page = await loadContent('pages', 'home')
  if (!page) error(404, 'Not found')
  return { fields: page.fields, html: page.html }
}
```

### With Full Configuration

Auth and SEO are configuration, not wiring -- they live in `krantho.config.ts`:

```typescript
// krantho.config.ts
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  auth: { mode: 'token' }, // secret from KRANTHO_API_TOKEN
  seo: {
    identity: 'Organization',
    collections: { blog: ['Article'], pages: ['WebPage'] },
  },
})
```

## Dependencies

### Workspace Dependencies

- `@krantho/server` -- `createLazyHandler`, `createStudioServer`, `createContentLoader`, `servePageRequest`, `runPageRequest`, `verifyPreviewRequest`, `KranthoHandlerOptions`

### Peer Dependencies

- `@sveltejs/kit` (>=2.0.0, optional) -- not imported at build time, but expected at runtime
