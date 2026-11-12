# @krantho/server-next

Next.js App Router adapter for krantho. Returns route handler exports (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) compatible with Next.js `app/api/[...path]/route.ts`, Studio SPA serving for `app/studio/[[...slug]]/route.ts`, and the content loader server components read through. With `cache.pages: 'next-isr'`, pages stay cached until a content change invalidates them; with `cache.shared: 'database'`, every instance of the site shares that cache through the site's database.

## Context

Next.js App Router uses file-based routing where each `route.ts` file exports named HTTP method handlers. This package wraps `@krantho/server` to produce those exports directly, so a single spread or destructure wires up the entire krantho API.

Rendering a page on every request reads the database on every visit. With incremental static regeneration (ISR), Next.js keeps each rendered page and serves it from its cache — on Vercel, from the CDN. The CMS knows what a write changed and the page knows what it read, so the cached page is refreshed exactly when its content changes, not on a timer.

## Rationale

- **Thin adapter** -- request handling lives in `@krantho/server`. This package bridges it to Next.js conventions and owns the Next.js cache.
- **Lazy singleton** -- the handler is created on the first request and reused across subsequent invocations. This is important for serverless environments where the module may be re-evaluated but the handler should persist within a warm instance.
- **Tags, not timers** -- every page read registers the cache tags of what it read (see [core.md](core.md#cache-tags)); every committed write invalidates the tags of what it changed. A page is re-rendered only when something it shows changed.
- **One place touches `unstable_cache`** -- the content loader. Moving to Next's `'use cache'` later touches that module and the route structure only.
- **No database at build** -- the build renders no content page. The first request renders each page; a deploy step warms them (see [deploy-vercel.md](guides/deploy-vercel.md#page-cache)).

## Architecture

- `index.ts` -- `createApiRouteHandlers` and `createStudioRouteHandler`. The API handlers run background jobs under `after()`, so the platform keeps them alive past the response, and with `next-isr` they invalidate the page cache for each committed write.
- `content-loader.ts` -- `createContentLoader`: the loader from `@krantho/server`, with each read wrapped in `unstable_cache` and tagged when pages are cached.
- `page-refresh.ts` -- turns a change into `revalidateTag` calls, and renders a published document's page again after the request.
- `site-preview.ts` -- the preview routes: draft mode on for an editor the API allows, off again on exit; and `showPreviewBanner`, which says whether the site's "Previewing drafts" notice belongs on a render (an editor's preview outside a frame).
- `page-cache.ts` -- whether pages are cached: `cache.pages: 'next-isr'`, outside `next dev`.
- `cache-handler.ts` -- the `@krantho/server-next/cache-handler` entry point: a Next.js cache handler over the site's database, shared by every instance.
- `cache-value.ts` -- converts the values Next caches to and from what the page cache store keeps.

## API Reference

### `createApiRouteHandlers(options: KranthoHandlerOptions): ApiRouteHandlers`

Returns an object with `GET`, `POST`, `PUT`, `DELETE`, `PATCH` handlers matching the Next.js App Router route handler convention. The handler names its framework, so `/api/capabilities` reports `framework: 'next'`.

```typescript
type ApiRouteHandler = (request: Request, context: RouteContext) => Promise<Response>

interface ApiRouteHandlers {
  GET: ApiRouteHandler
  POST: ApiRouteHandler
  PUT: ApiRouteHandler
  DELETE: ApiRouteHandler
  PATCH: ApiRouteHandler
}
```

A Next.js rewrite into the catch-all route (for example `/robots.txt` → `/api/seo/robots.txt`) hands the handler the visitor's URL. When the path does not start with `/api/`, the handler rebuilds it from the catch-all segments in `context.params`, so rewrites reach the right API route.

Background work -- the SEO enrichment job -- is handed to `after()` through the handler's `waitUntil`, so it runs to completion on hosts that end a request's work with its response, and its invalidations are applied when it settles.

With `cache.pages: 'next-isr'`, every committed write (see [api.md](api.md#content-changes)) invalidates the pages that read what it changed, before your own `onContentChange` runs:

| Change | Invalidates | Mode |
|---|---|---|
| A document published, unpublished, archived or deleted | its pages | `expire`: the next request renders it fresh |
| — the same change | its collection's lists | `stale`: served once more while it re-renders |
| A global | every page showing it | `stale` |
| A save (it keeps the live version), a media change | nothing | |
| A document SEO configuration | that document's pages | `expire` |
| A site or collection SEO configuration, every SEO configuration | the pages composed from it | `stale` |
| Anything site-wide (import, checkpoint restore) | every page | `stale` |

After a request that published a document, the handler requests that document's page (at `documentPath()`: the path its collection declares, or by default `pages` at the site root, `home` at `/`, other collections under their name; a document whose collection has no pages is not requested) in an `after()` callback, so neither the editor nor the next visitor waits for its render.

### `createContentLoader(options: { config, collections }): IPublishedContentLoader & IPublishedSeoLoader`

The loader server components read through: the live (published) version of each document, and each page's SEO, from the database the API route opens (see [server.md](server.md#createcontentloaderoptions--config-collections--ipublishedcontentloader--ipublishedseoloader)). With `cache.pages: 'next-isr'`, every read goes through the Next.js data cache, tagged with the document, collection or SEO configuration it read; the loader's own read cache is off, so Next's cache is the only page-side cache. `isPreview()` is Next.js draft mode: in draft mode every read (`getPublished`, `listPublished`, `seoProperties`, `jsonLd`) goes through the `@krantho/server` loader's `preview` view, uncached and never through `unstable_cache` -- a document and its JSON-LD from the current version, lists the live documents, as on the other server packages. `@krantho/ui-react/server` sets `CMSContent.preview` from it, which drives the Live marks (see [core.md](core.md#marks)).

```typescript
// lib/krantho.ts
import { notFound } from 'next/navigation'
import { createContentLoader } from '@krantho/server-next'
import { getCMSContent, initServerLoader, NetworkError } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

initServerLoader(createContentLoader({ config, collections }))

/** A page's published content; a document with no published version answers 404 */
export async function requirePublished(collection: string, slug: string): Promise<CMSContent> {
  try {
    return await getCMSContent(collection, slug)
  } catch (error) {
    if (error instanceof NetworkError && error.status === 404) notFound()
    throw error
  }
}
```

### Editor preview

The API handlers register `GET /api/preview?collection=&slug=` (`sitePreview: 'draft-mode'`, see [api.md](api.md#site-preview)). For an editor or Studio, the API answers the document's path; the route handler then turns on Next.js draft mode and redirects there. In draft mode the content loader reads a document and its JSON-LD from its current version, draft included, uncached — lists stay published, so a draft that is not yet live does not appear in list pages — `isPreview()` answers `true`, and Next.js renders the page per request with its own `Cache-Control: private, no-cache, no-store`. Visitors keep the cached published page. `GET /api/preview/exit?path=/about` leaves draft mode and returns to a path on the site.

The Studio editor's **Open on site** opens the draft preview when `/api/capabilities` reports `features.sitePreview`. Tell the editor they are previewing, with a way out, in a layout:

```tsx
// app/(site)/layout.tsx
import { showPreviewBanner } from '@krantho/server-next'

const previewing = await showPreviewBanner()
// {previewing && <p className="preview-banner">Previewing drafts — <a href="/api/preview/exit">Exit preview</a></p>}
```

`showPreviewBanner()` is true for an editor's preview and false when a frame shows the page, as Studio's Live mode does: the browser says so with `Sec-Fetch-Dest: iframe`, so Live mode shows no banner of the site's own, and the site sets no flag for it. `isPreview()` from the content loader stays true in a frame, because the page still reads the draft.

The draft-mode cookie is `Secure`: preview works over HTTPS, and on `localhost` in browsers that treat it as secure. Under `next dev`, Next.js sets it without `Secure`.

### `createStudioRouteHandler(options?: { config?: KranthoConfigInput }): { GET: (request: Request) => Promise<Response> }`

Returns a `GET` handler that serves the `@krantho/studio` SPA. Returns a 503 response with a build instruction message if admin is not built. Pass the app's configuration to apply `auth.oidc.studioEntry`: with `redirect`, visitors without a session are sent to the OIDC sign-in and refused sign-ins answer 404 (see [server.md](server.md#createadminserverconfig-kranthoconfiginput-adminserver)).

### `KranthoHandlerOptions` (re-exported type)

Same options object as `@krantho/server`. See [server.md](server.md) for full documentation.

## Usage

### API Route

Create `app/api/[...path]/route.ts`:

```typescript
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiRouteHandlers({
  config,
  collections,
})
```

### Studio route

Create `app/studio/[[...slug]]/route.ts`:

```typescript
import { createStudioRouteHandler } from '@krantho/server-next'

export const { GET } = createStudioRouteHandler()
```

### Cached pages

Set the strategy in `krantho.config.ts`:

```typescript
export default defineKranthoConfig({
  site: { /* … */ },
  cache: { pages: 'next-isr' },
})
```

and give every route that reads content the ISR shape. The build must never read the database, so:

1. **Every content route has a dynamic segment** whose `generateStaticParams()` returns nothing, and `revalidate = false`. Use an optional catch-all (`[[...slug]]`) where the index needs content too: `app/(site)/[[...slug]]/page.tsx` serves `/` and `/about`; `app/(site)/services/[[...slug]]/page.tsx` serves `/services` and `/services/<slug>`.
2. **The root layout reads no content.** The build prerenders the 404 page through it. Put the layout that reads globals (navigation, footer) in a route group, `app/(site)/layout.tsx`.
3. **Metadata comes from the page's `generateMetadata`**, through the same loader.

```typescript
// app/(site)/[[...slug]]/page.tsx
import { notFound } from 'next/navigation'
import { CMSMarkdownServer, SeoJsonLd } from '@krantho/ui-react/server'
import { requirePublished } from '@/lib/krantho'

export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface PageProps {
  params: Promise<{ slug?: string[] | undefined }>
}

/** `/` is the home page; any other page is one path segment */
function pageSlug(path: string[] | undefined): string {
  if (!path) return 'home'
  const [name] = path
  if (path.length !== 1 || !name || name === 'home') notFound()
  return name
}

export default async function Page({ params }: PageProps) {
  const slug = pageSlug((await params).slug)
  const page = await requirePublished('pages', slug)
  return (
    <article>
      <SeoJsonLd collection="pages" slug={slug} />
      <h1>{String(page.fields['title'] ?? slug)}</h1>
      <CMSMarkdownServer collection="pages" slug={slug} />
    </article>
  )
}
```

`next build` lists these routes as `●` (SSG) with no paths prerendered. The ISR shape needs `cache.pages: 'next-isr'`: without it no write invalidates the cache, and pages keep their first render. The `examples/nextjs-shadcn` app is the reference.

### Behind CloudFront or Cloud CDN

A self-hosted Next.js app (`next start` in a container or VM) can sit behind a CDN that caches each page as Next's own `Cache-Control` (`s-maxage`) says. Set the provider next to `next-isr` -- by environment, with no code change:

```bash
KRANTHO_CACHE_PAGES=next-isr
KRANTHO_CACHE_CDN_PROVIDER=cloudfront   # + KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID
# or
KRANTHO_CACHE_CDN_PROVIDER=gcp          # + KRANTHO_CACHE_CDN_GCP_PROJECT, KRANTHO_CACHE_CDN_GCP_URL_MAP
```

Every live change then runs `revalidateTag` as above, and purges `/*` at the CDN under `after()`. The purge is site-wide on purpose: a published document also shows on list pages whose paths krantho cannot know, and a per-page purge would leave them stale at the CDN until `s-maxage`. The CDN's origin is Next's warm page cache, so a full purge costs cheap origin hits, not renders. A save, which keeps the live version, purges nothing. Content files a deploy ships are not reliably purged — the content loader can import them silently before the API route runs — so purge `/*` at the CDN as a deploy step whenever content files change (see the [page caching guide](guides/page-caching.md#deploys)). CloudFront needs `@aws-sdk/client-cloudfront` installed in the app; Cloud CDN needs nothing. What each provider needs from the host is in the [page caching guide](guides/page-caching.md#cdn-providers).

**On Vercel** no CDN purge is needed: `revalidateTag` already purges Vercel's edge, so `next-isr` with `cache.cdn.provider` `vercel` or `none` registers no purge listener.

### Shared cache across instances

Next.js keeps its cache per instance, in the instance's memory and on its own disk. A write reaches one instance, whose `revalidateTag` invalidates only its own cache; the other instances keep serving the old page. Several `next start` instances serving one site — containers behind a load balancer, several VMs — with no cache the platform shares between them need one shared cache. `@krantho/server-next/cache-handler` keeps Next's cache in the site's own database, SQLite or Postgres, through its `IPageCacheStore` (see [persistence.md](persistence.md#page-cache)), so every instance serves one cache and sees every invalidation. On Vercel the platform already shares the cache; leave this off.

Opt in with `cache.shared: 'database'` — in `krantho.config.ts`, or `KRANTHO_CACHE_SHARED=database` — and let `next.config.ts` set the handler from it:

```typescript
// next.config.ts
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

const nextConfig: NextConfig = {
  ...sharedCache,
  serverExternalPackages: ['better-sqlite3', '@krantho/server', '@krantho/server-next'],
}

export default nextConfig
```

`cacheMaxMemorySize: 0` turns off Next's in-memory layer, so no instance keeps a private copy. `next start` reads `next.config.ts` again when it starts, so set the variable for the build and for every server start. `next build` writes the handler's path into `.next/required-server-files.json`.

**What it stores.** Everything Next hands its cache handler: rendered pages (HTML, RSC payload and segment data, headers, status), route handler responses, and the data cache — `unstable_cache` and `fetch` results, which is where the content loader's reads live under `next-isr`.

**Invalidation.** An entry's tags are a data cache entry's own and implicit tags, and the `x-next-cache-tags` header Next stamps on a page or route response, its implicit path tags included. The handler checks them against the marks in the store on every read:

| `revalidateTag` call | Mark | The next read of an entry written before it |
|---|---|---|
| no profile, or an expiry of zero (`{ expire: 0 }`: krantho's `expire` invalidations) | expired | a miss: the request renders the page |
| any later expiry (`'max'`: krantho's `stale` invalidations; a `cacheLife` profile) | stale | the entry comes back with `lastModified: -1`, which Next 16.3 reads as past its tags: the request renders the page again before it responds, and later requests get the new render |

Next.js does not read a custom handler's `cacheState`; `lastModified: -1` is the mechanism it reads as "render before responding". A `cacheLife` profile with a finite `expire` marks the tags stale here and the handler never expires them, so their entries are rendered again on the next request. krantho itself calls only `{ expire: 0 }` and `'max'`. Next 16.3 also hands the handler page keys of the form `/route-cache/<kind>/<hash of the source route>/$<path>`; the handler treats keys as opaque.

**The database.** Next loads the handler by path, with no access to `krantho.config.ts`: it opens the database with `resolvePersistence(process.env)` from `@krantho/config` — defaults plus the environment, relative paths from the working directory — once per process, on its first read or write, running the migrations like the server (a failed open is tried again on the next call). Persistence set in `krantho.config.ts` is not seen, so a deployment whose database is not the default sets it by environment (`KRANTHO_PERSISTENCE_PROVIDER`, `KRANTHO_PERSISTENCE_POSTGRES_URL`, `KRANTHO_PATHS_DATA_DIR` or `KRANTHO_PERSISTENCE_SQLITE_PATH`), for the handler and the API route alike. With the filesystem provider the handler throws on first use: there is no database to share. On Postgres every `createAdapter` call opens its own connection pool: a Next.js process holds one for the API route and one for the content loader, and a third when the handler runs.

**Clocks.** The store stamps entries and marks from one clock — the database server's on Postgres — so tag invalidation is exact across instances whatever their clocks. A route with a time-based `revalidate` period is different: Next compares an entry's `lastModified` with the instance's own clock, so skew between the database and an instance shifts that period by the skew. The krantho route shape uses `revalidate = false`. An instance that has not rendered a route itself reads a shared page entry as stale at first — Next applies a short fallback revalidate period to routes it has no revalidate setting for, and that setting is per process — so each new instance re-renders each page once in the background while serving the shared entry.

**The build.** Once `cacheHandler` is set, `next build` loads the handler too, so a route the build prerenders that reads through `unstable_cache` or `fetch` can make the build open — and migrate — the database its environment names. The krantho route shape ([Cached pages](#cached-pages)) reads nothing at build, so the build opens no database.

**Deploying.** The handler loads the database backend the way the server does, by dynamic import: a deployment with `output: 'standalone'` must carry `@krantho/persistence-sqlite` and `better-sqlite3`, or `@krantho/persistence-postgres` and `postgres`, in its output. Nothing is evicted: a re-render replaces its entry, and entries for pages that no longer exist stay — as they do in Next's own disk cache. The handler follows Next.js 16.3's cache handler interface.

### With Media

Media is configuration, not a route option. Set `media.provider` in `krantho.config.ts` (or `KRANTHO_MEDIA_PROVIDER`) and add the store's package to the app's dependencies; the route stays as it is:

```typescript
// krantho.config.ts
export default defineKranthoConfig({
  media: { provider: 'local', local: { dir: 'public/uploads' } },
})
```

The server loads the store with a literal dynamic import, so Next.js file tracing can follow it; `examples/nextjs-shadcn` lists no store package in `serverExternalPackages`. On Vercel, use a remote store such as Vercel Blob -- see [guides/media.md](guides/media.md) and [guides/deploy-vercel.md](guides/deploy-vercel.md#media).

## Dependencies

### Workspace Dependencies

- `@krantho/server` -- `createLazyHandler`, `createStudioServer`, `createContentLoader`, `openPageCacheStore`, `KranthoHandlerOptions`
- `@krantho/config` -- `resolveConfig`, for `cache.pages`; `resolvePersistence`, for the cache handler's database
- `@krantho/core` -- the cache tag vocabulary and `documentPath`

### Peer Dependencies

- `next` (>=16.0.0) -- `unstable_cache` and `revalidateTag` from `next/cache`, `after` from `next/server`, `draftMode` from `next/headers`
