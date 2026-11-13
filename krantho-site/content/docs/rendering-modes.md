---
title: Rendering modes
description: Render with SSG or SSR, keep Next.js pages cached until a change, or cache SvelteKit and Express pages at a CDN — and choose the mode that fits your content.
area: concepts
order: 30
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [first-page, templates]
next: [studio, deploy-vercel, deploy-cdn]
related: [configuration, persistence, templates]
status: published
---

Krantho works with every Next.js rendering mode, and caches SvelteKit and Express pages at a CDN. Your choice decides when content is read and how fresh it is. In every mode, pages render the published version of a document: a save never changes a live page, Publish makes the current version live, and unpublishing, archiving or deleting takes the page offline.

The Next.js examples below use `requirePublished(collection, slug)` from `lib/krantho.ts` (see [Your first page](/docs/first-page)): it returns the published content, and answers 404 when the page has no published version.

## Set up the server handler

Every mode needs the krantho API in your app. Create one route that handles all krantho endpoints:

```ts title="app/api/[...path]/route.ts" stack="next"
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiRouteHandlers({ config, collections })
```

```ts title="src/routes/api/[...path]/+server.ts" stack="sveltekit"
import { createApiHandlers } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'
import { collections } from '../../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiHandlers({ config, collections })
```

```ts title="server.ts" stack="express"
import express from 'express'
import { createHandler, toWebRequest, writeResponseHeaders } from '@krantho/server-node'
import config from './krantho.config'
import { collections } from './krantho.collections'

const api = createHandler({ config, collections })

const app = express()

// The krantho API at /api. Mount it without a path: the handler routes on the full URL
app.use(async (req, res, next) => {
  if (req.path !== '/api' && !req.path.startsWith('/api/')) return next()
  try {
    const response = await api.handle(await toWebRequest(req))
    res.status(response.status)
    writeResponseHeaders(res, response)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    next(error)
  }
})
```

In Express, `toWebRequest` turns the Node request into a Web `Request` from `req.url`, which Express strips of a mount path — so a handler mounted at `app.use('/api', …)` would not match its routes. `writeResponseHeaders` copies the Web `Response` headers onto `res`, one `Set-Cookie` line per cookie. In a Vite dev server, the `@krantho/server-node/vite` plugin serves the API and Studio for you.

## Static site generation (SSG)

Content is read once at build time and baked into HTML. It suits sites whose content changes rarely.

### Read content at build time

Use `createContentResolver` from `@krantho/core/content` for the simplest static setup. It reads markdown files from disk, parses fields and body, and optionally validates them against a Zod schema. Pass the site's default locale (`site.defaultLocale`) as `defaultLocale`: it is the locale of a file whose frontmatter names none.

```ts title="lib/content.ts"
import { createContentResolver } from '@krantho/core/content'
import { defineConfig } from '@krantho/schema'
import { collections } from '../krantho.collections'

export const content = createContentResolver(defineConfig({ collections }), { defaultLocale: 'en' })

// const about = await content.get('pages', 'about') -- null when the file is missing
```

### Generate static paths

Use `getCMSSlugs(collection)` in `generateStaticParams` to list the published pages at build time:

```tsx title="app/[slug]/page.tsx"
import { getCMSSlugs } from '@krantho/ui-react/server'
import { requirePublished } from '@/lib/krantho'

export async function generateStaticParams() {
  const slugs = await getCMSSlugs('pages')
  return slugs.map((slug) => ({ slug }))
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const content = await requirePublished('pages', slug)
  return <h1>{content.fields.title as string}</h1>
}
```

These pages read the published documents from the site's database while `next build` runs, so the build must reach that database — and opens, and migrates, it. Content is not read again after the build.

## Server-side rendering (SSR)

Content is read on every request. It suits pages that differ per visitor.

Server components call `getCMSContent(collection, slug)` on every request. The content loader's cache reduces database reads within the TTL window (`content.cache`, 5 minutes by default).

```tsx title="app/[slug]/page.tsx"
import { requirePublished } from '@/lib/krantho'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const content = await requirePublished('pages', slug)
  return <h1>{content.fields.title as string}</h1>
}
```

Your adapter must handle concurrent reads. The filesystem adapter is safe (independent file handles). SQLite runs in WAL mode, so reads proceed alongside a write; Postgres uses a connection pool.

## Cached until changed (ISR)

Each page is rendered on its first request and served from the cache until Studio changes something it shows. The build never reads the database. It suits Studio-managed sites: every visit after the first is served from the cache, and a publish shows on the next reload.

Turn it on in `krantho.config.ts`:

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  cache: { pages: 'next-isr' },
})
```

Then give every route that reads content the ISR shape: a dynamic segment whose `generateStaticParams` returns nothing, and `revalidate = false`. An optional catch-all serves the home page too:

```tsx title="app/(site)/[[...slug]]/page.tsx"
import { notFound } from 'next/navigation'
import { requirePublished } from '@/lib/krantho'

export const revalidate = false

export function generateStaticParams() {
  return []
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  if (slug && slug.length !== 1) notFound()
  const content = await requirePublished('pages', slug?.[0] ?? 'home')
  return <h1>{content.fields.title as string}</h1>
}
```

The root layout must not read content: Next.js prerenders its 404 page through it at build. Read globals (navigation, footer) in a route-group layout, `app/(site)/layout.tsx`, instead. [Content and page templates](/docs/templates) shows the whole site built this way.

How pages stay fresh:

- Every read a page makes is tagged with what it read: the document, the collection list, the SEO configuration.
- Every write through the API invalidates the tags of what it changed. The document an editor publishes is fresh on the next request, and the API route renders it once right after the publish. A change to a global or a collection list marks the pages showing it stale: each is served once more and re-rendered in the background.
- A save changes nothing a visitor sees. Live mode and **Open on site** in Studio's editor show an editor the saved version on the page itself (Next.js draft mode, entered through `/api/preview`), while visitors keep the cached published page. `/api/preview/exit?path=/about` leaves draft mode and returns to the page.
- `next dev` caches nothing: it renders every request and reads the database each time. The page cache works in `next build` and `next start`, and on Vercel.

On Vercel, cached pages are served from the CDN, and a deploy starts with an empty cache: request the pages once after each deploy (see [Deploy to Vercel](/docs/deploy-vercel)).

### Behind CloudFront or Cloud CDN

A self-hosted Next.js app (`next start`) can sit behind Amazon CloudFront or Google Cloud CDN, which cache each page as Next's own `Cache-Control` (`s-maxage`) says. Name the CDN by environment, next to `next-isr`:

```bash
KRANTHO_CACHE_PAGES=next-isr
KRANTHO_CACHE_CDN_PROVIDER=cloudfront   # + KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID
# or
KRANTHO_CACHE_CDN_PROVIDER=gcp          # + KRANTHO_CACHE_CDN_GCP_PROJECT, KRANTHO_CACHE_CDN_GCP_URL_MAP
```

Every live change then refreshes Next's cache as above and purges `/*` at the CDN. The purge is site-wide on purpose: a published document also shows on list pages whose paths krantho cannot know. The CDN's origin is Next's warm page cache, so a full purge costs cheap origin hits, not renders. On Vercel no CDN purge is needed: Next's own invalidation already purges Vercel's edge. What each CDN needs from you is in [Deploy behind a CDN](/docs/deploy-cdn). krantho's purges are tested against each provider's documented API, not a live CloudFront distribution or Cloud CDN URL map.

### Several instances

Next.js keeps its cache per instance. When several `next start` instances serve one site — containers behind a load balancer, several VMs — an invalidation reaches only the instance that took the write, and the others keep serving the old page. On Vercel the platform shares the cache already; elsewhere, keep Next's cache in the site's own database, SQLite or Postgres, so every instance serves one cache and sees every invalidation.

Set `cache.shared: 'database'` — or `KRANTHO_CACHE_SHARED=database`, for the build and every server start — and let `next.config.ts` set the cache handler from it:

```ts title="next.config.ts"
import { resolveConfig } from '@krantho/config'
import type { NextConfig } from 'next'
import kranthoConfig from './krantho.config'

const sharedCache =
  resolveConfig(kranthoConfig, process.env).cache.shared === 'database'
    ? {
        cacheHandler: require.resolve('@krantho/server-next/cache-handler'),
        cacheMaxMemorySize: 0,
      }
    : {}

const nextConfig: NextConfig = { ...sharedCache /* , the rest of your config */ }

export default nextConfig
```

- A page one instance rendered is served by every other. A publish makes the next request render the page fresh; a change to a global or a list marks the pages showing it stale, served once more while they re-render in the background.
- The handler opens the database from the environment alone, not from `krantho.config.ts`: if your database is not the default, set it by environment (`KRANTHO_PERSISTENCE_PROVIDER`, `KRANTHO_PERSISTENCE_POSTGRES_URL`, `KRANTHO_PATHS_DATA_DIR`). The filesystem provider has no database to share and fails.
- With the ISR route shape above the build opens no database. A route the build prerenders that reads data would make the build open, and migrate, the database.
- Nothing is evicted: entries for pages that no longer exist stay, as in Next's own disk cache.

The `nextjs-shadcn` and `nextjs-mui` examples are wired this way.

## Use with SvelteKit

SvelteKit uses its own adapter, and the same concepts apply. Pages read the published version through `createContentLoader`, re-exported by `@krantho/server-sveltekit`, and render the body with `renderContent` from `@krantho/core`:

```ts title="src/lib/cms.ts"
import { renderContent } from '@krantho/core'
import { createContentLoader } from '@krantho/server-sveltekit'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

const loader = createContentLoader({ config, collections })

export async function loadContent(collection: string, slug: string) {
  const doc = await loader.getPublished({ collection, slug })
  if (!doc) return null // not published
  const { html } = await renderContent(doc.fields, doc.body)
  return { fields: doc.fields, html }
}
```

SvelteKit renders on the server by default. Use `export const prerender = true` in `+page.ts` for static generation.

To cache pages at a CDN, serve them through the page cache hook, keeping it the outermost handle:

```ts title="src/hooks.server.ts"
import type { Handle } from '@sveltejs/kit/hooks'
import { createPageCacheHandle } from '@krantho/server-sveltekit'
import config from '../krantho.config'

export const handle: Handle = createPageCacheHandle({ config })
```

With the default `cache.pages: 'none'` it changes nothing; see [Cached at a CDN](#cached-at-a-cdn) below.

## Use with Node and Express

The standalone Node adapter works with Vite or plain Express. Mount the API as shown in [Set up the server handler](#set-up-the-server-handler), and Studio with `createStudioServer(config)` (see [Studio](/docs/studio#set-up-the-admin)). The `react-ssr` example is a complete Express server.

An Express server that renders its own pages reads the published version through `createContentLoader`, re-exported by `@krantho/server-node`, and renders each page through `renderCachedPage`:

```ts title="server.ts"
import { renderCachedPage } from '@krantho/server-node'

app.use(async (req, res) => {
  // Pass the full URL: req.originalUrl keeps the mount path and the query string
  const page = await renderCachedPage({ url: req.originalUrl, method: req.method }, config, () =>
    render(req.originalUrl), // your SSR entry: { status, html, headers? }
  )
  for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value)
  res.status(page.status).type('html').send(page.html)
})
```

Return every header the page sets — a cookie above all — from `render`, not on `res`: the helper must see a cookie to keep that page off the CDN.

## Cached at a CDN

SvelteKit and Express pages can be cached by the CDN in front of the site, and purged exactly when their content changes. Turn it on by environment, with no code change:

```bash
KRANTHO_CACHE_PAGES=cdn
KRANTHO_CACHE_CDN_PROVIDER=cloudfront   # or gcp, or vercel — plus the provider's settings
```

How pages stay fresh:

- A page renders inside a page request scope that records the cache tags of every content read: the document, the collection lists, the globals in the layout, the SEO configuration.
- A published `200` or `404` answers with `max-age=0` for the browser, a CDN lifetime of `s-maxage` (default one day) and `stale-while-revalidate` (default one week), and a tag header naming its tags. Vercel and Cloud CDN get the lifetime in their own cache header; CloudFront, which reads only `Cache-Control`, gets it there. The browser never keeps the page, so a purge reaches every visitor.
- Every live change through the API — a publish, unpublish or delete of a document or a global, an SEO configuration, a whole-site bundle import — purges the tags of what it changed at the CDN. A save purges nothing — an edit, a restore or an import into a collection — and neither does a media change unless it rewrites content references (a replace of a file that documents link to announces a site-wide change).
- A response that sets a cookie, is not a `200` or `404`, or says `private`, `no-store` or `no-cache` itself is never cached. Neither is anything under `/api` or `/studio`.

The draft preview (Live mode and **Open on site**) works through a signed link: pass `sitePreview: 'signed-url'` to the API handlers, and set `KRANTHO_JWT_SECRET` to one value wherever more than one instance serves the site. The editor lands on the page with a token valid for ten minutes; the page renders the draft, `private, no-store`, never cached.

The three CDNs, what each needs from you, how each is verified, and the rules that keep a cached page correct are in [Deploy behind a CDN](/docs/deploy-cdn).

## How the caching layers stack

```text
Next.js page cache (ISR; in the site's database with cache.shared: 'database')
  -> Next.js data cache (each tagged read, with cache.pages: 'next-isr')
    -> persistence adapter (published read from storage)

CDN (with cache.pages: 'cdn', SvelteKit and Express)
  -> page render (reads recorded as the page's cache tags)
    -> persistence adapter (published read from storage)
```

With `cache.pages: 'next-isr'`, Next.js caches both the rendered pages and the reads behind them, and invalidates both by tag. With `cache.pages: 'cdn'`, the CDN caches the pages and a change purges them by tag; the loader reads uncached, so the render after a purge reads the new version. Without either (SSG and SSR), the content loader keeps its own in-process cache with a configurable TTL and size limit (`content.cache`): a read within the TTL window returns the cached result without reaching the database. It caches in development too. Set `KRANTHO_CONTENT_CACHE_ENABLED=false` (or a low `KRANTHO_CONTENT_CACHE_TTL_MS`) to see published changes immediately.

## Choose a mode

| Mode | Content freshness | Build reads content | Suits |
|------|-------------------|---------------------|-------|
| **SSG** | Stale until the next build | Yes | Sites that deploy on content changes |
| **SSR** | Always fresh | No | Personalized pages |
| **Cached until changed** (Next.js) | Fresh on the next reload after a publish | No | Studio-managed content, high traffic |
| **Cached at a CDN** (SvelteKit, Express) | Fresh once the CDN purge lands after a publish | No | Studio-managed content behind CloudFront, Cloud CDN or Vercel |

> [!TIP]
> Use a cached mode with Studio: visitors get cached pages, and editors see their change on the next reload. Use SSG for sites whose content lives in the repository and deploys with the code.
