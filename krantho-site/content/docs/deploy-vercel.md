---
title: Deploy to Vercel
description: Run a krantho site on Vercel Functions — Next.js pages cached until a change invalidates them, Postgres for content and an object store for media.
area: deploy
order: 10
level: intermediate
stacks: [next, sveltekit]
prerequisites: [installation, persistence, rendering-modes]
next: [deploy-cdn]
related: [media, studio, configuration, package-server, package-media-vercel-blob]
status: published
---

A krantho site runs on Vercel Functions like any other Next.js app. A function has a read-only filesystem and shares no memory with other instances, so three things differ from a single server: content lives in **Postgres**, uploads go to an **object store**, and every instance shares one signing secret. SQLite stays the local default.

This guide covers Next.js. SvelteKit on Vercel caches pages at Vercel's CDN instead; see [SvelteKit on Vercel](#sveltekit-on-vercel) below.

> [!NOTE]
> krantho's packages are not yet published to npm, so a deployment today builds from a checkout of the repository. The package names on this page are the ones the first release will use; [Project status](/docs/project-status) explains how to run krantho from source.

## What serves what

One Vercel project serves the whole site:

| Path | Served by |
|------|-----------|
| `/`, `/about`, … | Your page routes, reading the published version through `createContentLoader({ config, collections })` from `@krantho/server-next`; each page is cached until Studio changes what it shows |
| `/api/*` | The krantho handler, `createApiRouteHandlers` in `app/api/[...path]/route.ts` |
| `/studio/*` | The Studio SPA, `createStudioRouteHandler` in `app/studio/[[...slug]]/route.ts` |
| `/robots.txt`, `/sitemap.xml` | Rewrites to `/api/seo/robots.txt` and `/api/seo/sitemap` |

## Database

Add the Postgres adapter and driver to the app (see [Installation](/docs/installation#postgres)) and set the connection in the environment:

| Variable | Value |
|----------|-------|
| `KRANTHO_PERSISTENCE_PROVIDER` | `postgres` |
| `KRANTHO_PERSISTENCE_POSTGRES_URL` | The connection string (secret) |
| `KRANTHO_PERSISTENCE_POSTGRES_PREPARE` | `false` behind a transaction pooler, such as PgBouncer or a pooled Neon URL, which does not support prepared statements |
| `KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS` | A small pool, such as `2`: every function instance opens its own (the driver default is 10) |
| `KRANTHO_PERSISTENCE_POSTGRES_IDLE_TIMEOUT_SEC` | Such as `20`, so a frozen instance's idle connections close |

Put the database in or near the functions' region. The schema migrations run on the first request that opens the database, whether it is the API route or a page. Instances that cold-start together serialize on a Postgres advisory lock, so each migration is applied once. Give the API route headroom for that first boot:

```ts title="app/api/[...path]/route.ts"
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

// Headroom for first-boot migrations and the content import
export const maxDuration = 60

export const { GET, POST, PUT, DELETE, PATCH } = createApiRouteHandlers({ config, collections })
```

## The build

The build never reads the database when the page routes have the cached shape (see [Rendering modes](/docs/rendering-modes#cached-until-changed-isr)): a dynamic segment whose `generateStaticParams` returns nothing, and a root layout that reads no content. `next build` then needs no database URL.

Files krantho reads at runtime are invisible to Next's file tracing, so add them to the functions yourself:

```ts title="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Load krantho's server packages from node_modules instead of bundling them, as the examples do
  serverExternalPackages: ['@krantho/server', '@krantho/server-next'],
  outputFileTracingIncludes: {
    // Content files a fresh database imports, whichever route it serves first
    '/**': ['./content/**/*'],
    // The Studio build the Studio route serves; list @krantho/studio in the app's dependencies
    '/studio/**': ['./node_modules/@krantho/studio/dist/**/*'],
  },
  async rewrites() {
    return [
      { source: '/robots.txt', destination: '/api/seo/robots.txt' },
      { source: '/sitemap.xml', destination: '/api/seo/sitemap' },
      // With seo.indexNow.key set: the IndexNow key file
      { source: '/:key([a-zA-Z0-9-]+).txt', destination: '/api/seo/indexnow/:key' },
    ]
  },
}

export default nextConfig
```

A collection directory missing from the bundle is logged at import time (`[import] Skipping <collection>: directory not found: …`). In a pnpm workspace, set the project's **Root Directory** to the app, trace from the workspace root with `outputFileTracingRoot`, and point Studio include at the Studio package's `dist` directory.

**Image variants with pnpm.** The media library's crops and sizes are rendered with sharp in the API function. Sharp's native binding loads libvips by its library path, not with `require`, so with pnpm's layout tracing leaves the library out and every variant answers 500 with `libvips-cpp.so…: cannot open shared object file`. Add it to the API route:

```ts title="next.config.ts"
outputFileTracingIncludes: {
  '/api/**': [
    './node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*',
  ],
},
```

In a workspace, start the path from the workspace root (`../node_modules/.pnpm/…`).

## Page cache

Set `cache: { pages: 'next-isr' }` in `krantho.config.ts` (see [Rendering modes](/docs/rendering-modes#cached-until-changed-isr)).

- **The first visit** to a page renders it in a function, and Vercel stores the result. Later visits are served from Vercel's CDN (`x-vercel-cache: HIT`), with no function invocation and no database read.
- **A publish** in Studio invalidates the page's cache tags, and Vercel propagates the invalidation to every region. The API route then requests the page once, so the editor's next reload shows it already rendered. A change to a global or a collection list marks the pages showing it stale: each is served once more and re-rendered in the background.
- **No CDN purge is needed.** Next's invalidation already purges Vercel's edge; leave `KRANTHO_CACHE_CDN_PROVIDER` unset (or `vercel`). Vercel shares the cache between instances, so `cache.shared` stays `none`.
- **A deploy** starts with an empty page cache. Request every page once after each production deploy, so no visitor waits for a first render:

```bash
# Warm the page cache from the sitemap
SITE_URL=https://example.com
curl -fsS "$SITE_URL/sitemap.xml" | sed -n 's:.*<loc>\(.*\)</loc>.*:\1:p' |
  while read -r url; do curl -s -o /dev/null -w "%{http_code} $url\n" "$url"; done
```

- **A deployed site's structured data** can be checked as search engines read it, with no database or credentials: fetch each sitemap page, parse its JSON-LD blocks and validate them with `validateGraph` from `@krantho/seo`. Fail the deploy job on errors and report warnings; see [Checked on the deployed site](/docs/package-seo#checked-on-the-deployed-site).

Each instance also keeps its own content cache for the API, and a write clears it only on the instance that took it. Set `KRANTHO_CONTENT_CACHE_ENABLED=false` so every instance reads the database; visitors still get pages from Vercel's cache.

## Media

A function's filesystem is read-only and per instance, so the `local` store does not work on Vercel: uploads need an object store. Any remote store works (see [Media](/docs/media#choose-a-file-store)); Vercel Blob keeps everything in one Vercel account:

1. Create a **public** Blob store, preferably in the functions' region. Krantho writes public blobs only.
2. Add `@krantho/media-vercel-blob` to the app's dependencies.
3. Set the environment:

| Variable | Value |
|----------|-------|
| `KRANTHO_MEDIA_PROVIDER` | `vercel-blob` |
| `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` | The store's read-write token (secret) |
| `KRANTHO_MEDIA_MAX_SIZE` | `4194304` (4 MiB) |

Krantho passes the token on every call, so no project connection or `BLOB_READ_WRITE_TOKEN` is needed.

**Cap uploads below 4.5 MB.** Uploads pass through the API function, and Vercel rejects a request body over 4.5 MB with `413` before krantho sees it. With the 4 MiB cap Studio reports an oversized file itself; a `413` from the platform shows as `File too large for this host`. Responses share the limit, so a very large `preset=full` variant can reach it.

Pages embed `/api/media/<id>/image?preset=…`, which redirects to a versioned URL served with `s-maxage`: Vercel's CDN caches each variant, and a replaced image shows on the next view with no purge. Each view still invokes a function for the redirect.

## Studio sign-in

Any OIDC provider works; Sign in with Vercel keeps sign-in in the same account. Its setup is in [Studio](/docs/studio#sign-in-with-vercel). On Vercel in particular:

- **`KRANTHO_JWT_SECRET`** must be set, with one value for every instance. Without it each instance signs with its own ephemeral key, so sessions and signed-in flows fail across instances. In production the server warns at startup when it is unset.
- **`KRANTHO_AUTH_OIDC_STUDIO_ENTRY=redirect`**, with `createStudioRouteHandler({ config })` in the Studio route, sends a visitor without a session straight to the provider and answers 404 to anyone refused.
- **`OIDC_REDIRECT_URI`** names one domain. A preview deployment on a `*.vercel.app` URL cannot complete sign-in unless the provider accepts its callback too.

## Preview deployments

A preview deployment reads whatever environment its target has. When Preview and Production share the database and Blob variables, a preview writes to the production database and store. Give Preview its own database and store when that matters.

## Content from the repository

Collections with a `directory` are imported from their markdown files when the site opens an **empty** database. On Postgres the database persists across deployments, so:

- **The first deployment imports the content**, on the first request that opens the database.
- **Later edits to the files need a content manifest.** Without one, the import is skipped once the database has content.
- **A deploy with a newer manifest imports new and changed files.** Write `content/manifest.json` at build time ([Ship content file changes with a deploy](/docs/package-server#ship-content-file-changes-with-a-deploy)); its version must grow with every content change. A page an editor changed in Studio keeps the editor's version, and a changed file for it is recorded as a conflict. Build from the full git history: in GitHub Actions, check out with `fetch-depth: 0`.
- **Edits made in Studio come back with a pull.** [Bring production edits back to git](/docs/content-round-trip) reads them as a branch to merge, so the files stay the durable copy.

## SvelteKit on Vercel

A SvelteKit site builds with `@sveltejs/adapter-vercel` and caches pages at Vercel's CDN with `KRANTHO_CACHE_PAGES=cdn` and `KRANTHO_CACHE_CDN_PROVIDER=vercel`, purged by tag when content changes. Add `@vercel/functions` to the app, and keep purges alive past the response by passing its `waitUntil` to the API handlers:

```ts title="src/routes/api/[...path]/+server.ts"
import { waitUntil } from '@vercel/functions'
import { createApiHandlers } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'
import { collections } from '../../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiHandlers({
  config,
  collections,
  sitePreview: 'signed-url',
  waitUntil,
})
```

The page cache hook, the headers and the rules are in [Deploy behind a CDN](/docs/deploy-cdn). A new deployment starts with an empty CDN cache.

## SEO enrichment

AI enrichment (`POST /api/seo/enrich`) runs as a background job after the response is sent. On Next.js it runs under `after()`, so it keeps going up to the function's `maxDuration`, but its status lives in that instance's memory: a status poll that lands on another instance does not find the job. Run large enrichments locally, or from the CLI against the production database.
