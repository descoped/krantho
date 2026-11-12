---
title: "@krantho/server"
description: The server runtime and its framework adapters for Next.js, SvelteKit and Node.js.
area: reference
order: 110
level: advanced
stacks: [next, sveltekit, express]
prerequisites: [installation]
next: [package-studio]
related: [configuration, api, rendering-modes, deploy-cdn, package-ui-react, live-editing]
status: published
---

The server runtime. One function sets up persistence, the content engine, the API handlers, content import, SEO seeding and the media store; a companion Studio handler serves Studio. Framework adapters wire both into Next.js, SvelteKit or plain Node.js.

## Install

> [!NOTE]
> Krantho is in active development and its packages are not on npm yet. The commands below are the ones the first release will use. To run krantho today, see [Project status](/docs/project-status).

Add the server and the adapter for your framework:

```bash stack="next"
pnpm add @krantho/server @krantho/server-next      # Next.js App Router
```

```bash stack="sveltekit"
pnpm add @krantho/server @krantho/server-sveltekit # SvelteKit
```

```bash stack="express"
pnpm add @krantho/server @krantho/server-node      # Vite, Express or standalone
```

## Quick start

Configuration lives in `krantho.config.ts` at the app root. It is data only, and every scalar and list leaf can be overridden from the environment:

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
})
```

### The API route

Mount the krantho API under `/api`. With Vite, the krantho plugin serves both `/api` and `/studio` on the dev server.

```ts title="app/api/[...path]/route.ts" stack="next"
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiRouteHandlers({
  config,
  collections,
})
```

```ts title="src/routes/api/[...path]/+server.ts" stack="sveltekit"
import { createApiHandlers } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'
import { collections } from '../../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiHandlers({
  config,
  collections,
  sitePreview: 'signed-url', // editors preview drafts through a signed link
})
```

```ts title="vite.config.ts" stack="express"
import { kranthoPlugin } from '@krantho/server-node/vite'
import { defineConfig } from 'vite'
import config from './krantho.config'
import { collections } from './krantho.collections'

export default defineConfig({
  plugins: [
    kranthoPlugin({ config, collections }),
  ],
})
```

The Next.js handlers turn on draft-mode preview for you (`sitePreview: 'draft-mode'`).

### The Studio route

Serve Studio under `/studio`:

```ts title="app/studio/[[...slug]]/route.ts" stack="next"
import { createStudioRouteHandler } from '@krantho/server-next'

export const { GET } = createStudioRouteHandler()
```

```ts title="src/routes/studio/[...path]/+server.ts" stack="sveltekit"
import { createStudioHandler } from '@krantho/server-sveltekit'

export const { GET } = createStudioHandler()
```

The Vite plugin serves Studio itself. Pass the configuration to the Studio handler (`createStudioRouteHandler({ config })`, `createStudioHandler({ config })`) when you use the OIDC Studio gate (`auth.oidc.studioEntry: 'redirect'`, see [Auth modes](#auth-modes)).

### SvelteKit page hook

SvelteKit pages render under the page cache rules through a `handle` hook (see [Page cache](#page-cache)):

```ts title="src/hooks.server.ts"
import { createPageCacheHandle } from '@krantho/server-sveltekit'
import config from '../krantho.config'

export const handle = createPageCacheHandle({ config })
```

### Express

For an Express server, `@krantho/server-node` exports `createHandler()` for the API, `createStudioServer(config)` for Studio and `renderCachedPage()` for pages. [Rendering modes](/docs/rendering-modes) shows how they fit together.

### Standalone Node.js

```ts title="server.ts"
import { startServer } from '@krantho/server-node/standalone'
import config from './krantho.config.js'
import { collections } from './krantho.collections.js'

await startServer({
  config,
  collections,
  staticDir: 'dist',
  port: 3000,
})
```

The standalone server answers `/api` and serves `staticDir` with an `index.html` fallback. It does not serve Studio.

## Handler options

`KranthoHandlerOptions` is the whole surface. It carries one configuration object plus the wiring that cannot be expressed as data.

```ts
interface KranthoHandlerOptions {
  config: KranthoConfigInput          // from defineKranthoConfig()
  collections: ContentConfigInput['collections'] // from defineCollection(), keyed by name
  pages?: readonly PageDefinition[]   // from definePage(): enables resolvePageRoute
  plugins?: KranthoPlugin[]           // routes, hooks and field types
  hooks?: ContentHooks                // lifecycle hooks
  onContentChange?: ContentChangeListener // told about every committed write
  waitUntil?: (work: Promise<unknown>) => void // keeps background work (a CDN purge) alive on serverless hosts
  sitePreview?: 'draft-mode' | 'signed-url' // how editors preview drafts on the site
}
```

- `onContentChange` is told about every committed write: through the API, the startup content import or the file watcher. With a CDN configured, the CDN purge runs after it, even when it throws.
- `waitUntil` keeps background work (the SEO enrichment job, a CDN purge) running past the response on hosts that end a request's work with it. `@krantho/server-next` passes Next's `after()`. For SvelteKit or Express in a Vercel function, pass `waitUntil` from `@vercel/functions`. Without it, background work is fire-and-forget: fine on a long-running server, liable to be cut off on a serverless host.
- `sitePreview` turns on `GET /api/preview`, which Studio's Live mode and **Open on site** load. `'draft-mode'` is Next.js draft mode, and `@krantho/server-next` sets it itself. `'signed-url'` sends the editor to the page with a short-lived signed link, which the page verifies (SvelteKit and Express). Without it, Live mode shows its empty state and Open on site opens the live page, when one is live.

Persistence, auth, SEO, LLM, media and page cache settings are not handler options; they are sections of the configuration tree. The standalone server adds `staticDir` and `port` to these options as `StandaloneOptions`.

### Media

Media is configuration too. Set `media.provider` (`local`, `vercel-blob`, `s3` or `gcs`) and install that store's package: [@krantho/media-local](/docs/package-media-local), [@krantho/media-vercel-blob](/docs/package-media-vercel-blob), [@krantho/media-s3](/docs/package-media-s3) or [@krantho/media-gcs](/docs/package-media-gcs). The handler keeps media metadata and folders in the configured database (SQLite or Postgres; the filesystem provider has no media) and loads the store when it starts. Leave `media.provider` unset and media is off. A missing package or setting fails startup with a message naming it. See [Media](/docs/media).

## Configuration

Everything else is a leaf of the tree in `krantho.config.ts`. [Configuration](/docs/configuration) lists every section, its environment variable and its default.

### Persistence providers

```ts
// SQLite (the default when the section is omitted), at .krantho/content.db
persistence: { provider: 'sqlite', sqlite: { path: './data/content.db' } }

// Postgres: the URL comes from KRANTHO_PERSISTENCE_POSTGRES_URL;
// install @krantho/persistence-postgres and postgres alongside the server
persistence: { provider: 'postgres' }

// Filesystem: reads and writes the markdown files directly
persistence: { provider: 'filesystem', filesystem: { contentPath: 'content/pages' } }
```

### SEO seeding

Seed archetype configuration on startup. Existing Studio overrides are kept.

```ts
// Type lists in code
seo: {
  identity: 'Organization',
  collections: { docs: ['Article', 'BreadcrumbList'], features: ['BreadcrumbList'] },
}

// Or YAML seed files, one per entity, as krantho.com does
seo: { configDir: './krantho.seo' }
```

### LLM configuration

Turn on AI-assisted SEO enrichment. A key is a secret, so it comes from its provider's own variable, such as `KRANTHO_LLM_ANTHROPIC_API_KEY`.

```ts
llm: { provider: 'anthropic' }
```

On first boot the server copies the chosen provider, its model and its base URL into the settings Studio's **Setup › AI provider** edits, and only when the code passes an `llm` block, or the environment chooses a provider (`KRANTHO_LLM_PROVIDER`) and supplies that provider's key. A key alone seeds nothing and needs to: the provider is on because it has a key, and the site uses the first provider that is on. The server never overwrites a stored provider, so after that Studio settings win. The credential is picked per request: the provider's own, so `claude-code` uses the subscription token only and every other provider its own variable (`KRANTHO_LLM_<PROVIDER>_API_KEY`), then the key stored for that provider, and never another provider's (see [@krantho/ai](/docs/package-ai#inside-a-krantho-site)). The subscription token is never stored.

### Auth modes

```ts
auth: { mode: 'none' }    // no authentication (default)
auth: { mode: 'token' }   // shared secret from KRANTHO_API_TOKEN
auth: { mode: 'oidc' }    // OpenID Connect
```

With OIDC, `auth.oidc.studioEntry` decides how `/studio` treats a visitor without a session. `login` (the default) serves Studio, which shows its own sign-in page. `redirect` sends the visitor straight to the OIDC provider, serves the admin only with a valid session, and answers 404 when sign-in is refused. `redirect` needs `KRANTHO_JWT_SECRET` and the configuration passed to the Studio handler (`createStudioRouteHandler({ config })`, `createStudioHandler({ config })`, `createStudioServer(config)`; the Vite plugin passes it itself). Studio's hashed build assets are served without the gate. See [Studio](/docs/studio) for setting up authentication.

## What happens on startup

1. Resolves the configuration (defaults, then `krantho.config.ts`, then the environment) and, in production, warns about unsafe settings (`auth.mode: 'none'`, or no `KRANTHO_JWT_SECRET`)
2. Creates the persistence adapter
3. Runs the content import (markdown into the database)
4. Creates the content engine with caching, and adds the CDN purge to the change listeners when `cache.cdn.provider` is set and `cache.pages` calls for a purge (see [Purge the CDN](#purge-the-cdn)). An import that brought in anything announces a site-wide change.
5. Starts the file watcher when `content.watch` is on
6. When `media.provider` is set, loads that store's package
7. Seeds SEO and LLM configuration
8. Wires up the API handlers
9. Returns a handler: `handle(request: Request) => Promise<Response>`, plus `close()` to stop the file watcher

### Ship content file changes with a deploy

Markdown files are imported into an empty database. To bring later file changes into a database that already has content, write a content manifest at build time, with a version that grows with every content change. The last commit that touched the content directory gives one:

```js title="scripts/content-manifest.mjs"
// Run before the framework's build, from a checkout with the full git history
import { join } from 'node:path'
import { contentVersion, generateContentDates, generateManifest } from '@krantho/server'

const contentDir = join(import.meta.dirname, '..', 'content')
await generateContentDates(contentDir) // content/dates.json: each page dated by its last commit
const version = await contentVersion(contentDir)
if (version) await generateManifest(contentDir, version) // content/manifest.json
```

`generateManifest(contentDir, version)` writes `manifest.json` in the content directory, with the checksum of every markdown file under it. `contentVersion(contentDir)` is the time of the last commit that touched the directory, in seconds; it is null without the full history, as in a shallow CI checkout. Ship both files with the deployment and keep them out of git.

When the manifest's version is higher than the one the database last imported, startup compares each file with its document:

- a new file is imported, and an unchanged one skipped;
- a changed file is imported, unless an editor changed the document in Studio — then the editor's version stands, and the change is recorded as a conflict (`GET /api/migrations/conflicts`);
- a document deleted in Studio stays deleted, and a file removed from the repository leaves its document in place.

The server takes a checkpoint before it imports into a database that already holds content. The API handler then announces the new content once, so cached pages refresh. [Deploy to Vercel](/docs/deploy-vercel) covers content from the repository in practice.

## Direct handler usage

For advanced cases, use `createKranthoHandler` directly.

```ts
import { createKranthoHandler } from '@krantho/server'
import config from './krantho.config.js'
import { collections } from './krantho.collections.js'

const handler = await createKranthoHandler({
  config,
  collections,
})

const response = await handler.handle(request)
```

## Page content loader

`createContentLoader({ config, collections })` gives server-rendered pages the published version of each document, from the same database the API handler opens. It takes the configuration and collections the handler takes (keep the collections in one `krantho.collections.ts` that both import), and runs the same startup content import, so a fresh database is filled whichever a deployment serves first. `@krantho/server-sveltekit` and `@krantho/server-node` re-export it; `@krantho/server-next` exports its own `createContentLoader` with the same options, which wraps it (see below).

```ts
import { createContentLoader } from '@krantho/server-next'
import config from './krantho.config'
import { collections } from './krantho.collections'

const loader = createContentLoader({ config, collections })
const about = await loader.getPublished({ collection: 'pages', slug: 'about' }) // null unless published
const features = await loader.listPublishedSummaries('features') // fields without the body, for a list
```

`getPublished()` answers `null` when nothing is live. `listPublishedSummaries()` gives a list (a navigation, a card list) each document's fields without its body; `listPublished()` gives whole documents, for a page that renders every body. An omitted locale is the site's default locale. The loader also serves the pages' SEO in-process: `seoProperties(configId)` returns a stored SEO configuration's properties, and `jsonLd(ref)` composes a page's JSON-LD graph from its published fields, so no page calls the site's own API.

`isPreview()` says whether the current render is an editor's preview. It answers the same way on every server package: `true` in Next.js draft mode, and inside a page request rendered for a verified signed preview link on SvelteKit and Express; `false` for visitors and for any render a cache keeps. Page templates pass it to the Live marks, see [Live editing](/docs/live-editing):

```ts
const preview = await loader.isPreview()
```

The adapter opens on the first read, not at import time, and a failed open is retried on the next read. Reads are cached per `content.cache`, except with `cache.pages: 'next-isr'` (Next.js caches them) and `cache.pages: 'cdn'` (the CDN caches the pages, and the render after a purge must read the new version). The loader's read cache is not cleared by a write, since pages and the API may run in separate processes, such as serverless functions. Under `cache.pages: 'none'` a published change therefore reaches pages after at most `content.cache.ttlMs`. Set it low, or `KRANTHO_CONTENT_CACHE_ENABLED=false`, where changes must appear at once.

`@krantho/server-next` wraps the loader in the Next.js data cache under `cache.pages: 'next-isr'`. In draft mode every read goes through the loader's `preview` view, uncached: a document and its JSON-LD come from the current version, unpublished changes included. Register it with `initServerLoader()` from `@krantho/ui-react/server` (see [@krantho/ui-react](/docs/package-ui-react)). The `@krantho/server` loader has the same `preview` view, which `runPageRequest()` switches to for a verified preview, and whose `isPreview()` answers `true`. On every server package, collection lists in a preview still show the live documents.

## Page cache

`@krantho/server` holds the rules every framework adapter serves pages by. How pages are cached is configuration: `cache.pages` is `none`, `next-isr` or `cdn`. See [Rendering modes](/docs/rendering-modes) and [Deploy behind a CDN](/docs/deploy-cdn) for the full setup.

### Render a page

`runPageRequest({ preview }, render)` renders one page inside a request scope. While `render` runs, every content loader read records its cache tags, and with `preview: true` every read comes from the loader's `preview` view. It returns `{ value, tags }`, the tags deduplicated in first-read order.

`servePageRequest(request, config, render, inspect)` wraps it with the caching rules:

- Only a `GET` or `HEAD` outside `/api` and `/studio` is a page. Anything else renders outside a scope and gets no headers.
- A URL with a valid signed preview token renders the draft and answers `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.
- Otherwise, under `cache.pages: 'cdn'`, a `200` or `404` that sets no cookie, and whose own `Cache-Control` says none of `private`, `no-store` or `no-cache`, gets the CDN cache headers of the configured provider, tagged with every read that rendered it.

You rarely call it directly: `createPageCacheHandle` in `@krantho/server-sveltekit` and `renderCachedPage` in `@krantho/server-node` wrap it. Start every content read inside the render; a read made before it, or one that outlives it, records no tags.

### Preview drafts with a signed link

`verifyPreviewRequest(url, config)` checks the `?krantho-preview=` token that `GET /api/preview` issues in `signed-url` mode. Its `config` is the resolved tree, `resolveConfig(config, process.env)` from `@krantho/config`, not the `krantho.config.ts` object. The token is signed for that page's path and expires after ten minutes. It is checked with the secret the API signs with: `auth.jwtSecret`, or, when none is configured, the one ephemeral secret the process generates. A link therefore works without `KRANTHO_JWT_SECRET` while the API and the pages run in one process, as in development. With several instances or serverless functions, set `KRANTHO_JWT_SECRET` to one value everywhere, or a link signed by one instance renders the published page on another.

### Purge the CDN

When `cache.cdn.provider` is set, the handler purges the CDN on every content change through `createCdnInvalidator(config.cache)`, as `cache.pages` decides (under `none` nothing is purged):

| `cache.pages` | Provider | Purge |
|---|---|---|
| `cdn` | `vercel`, `cloudfront`, `gcp` | by cache tag |
| `next-isr` | `cloudfront`, `gcp` | every path (`/*`) |
| `next-isr` | `vercel` | none: Next.js already purges Vercel's edge |

The purge clients load their SDKs by dynamic import: `@vercel/functions` for Vercel and `@aws-sdk/client-cloudfront` for CloudFront, both optional peers you install yourself. Cloud CDN needs no SDK. A save purges nothing, since it leaves the live version as it is. A purge runs in the background, is retried once, and never fails a write. The CloudFront and Cloud CDN clients are tested against mocked clients and the providers' documented APIs, not a live distribution or URL map; [Deploy behind a CDN](/docs/deploy-cdn) explains how each provider is verified.

### Share one Next.js cache across instances

`openPageCacheStore(persistence)` opens the shared page cache store in the site's database (SQLite or Postgres; the filesystem provider throws). `@krantho/server-next/cache-handler` calls it; your `next.config.ts` sets that module as Next's `cacheHandler` when `cache.shared` is `database`. The cache handler reads the database settings from the environment alone (`resolvePersistence(process.env)`), not from `krantho.config.ts`. See [Rendering modes](/docs/rendering-modes).

## API endpoints

The main routes the API handler serves:

| Route | Purpose |
|-------|---------|
| `GET /api/openapi.json` | The generated OpenAPI 3.1 spec |
| `GET /api/docs` | Scalar API reference UI |
| `GET /api/capabilities` | What this server supports; Studio shows and hides features from it |
| `/api/content/*` | Content CRUD, versions, bulk operations |
| `/api/media/*` | Media upload, library, folders (when `media.provider` is set) |
| `/api/seo/*` | SEO configuration, preview, enrichment, sitemap, robots.txt |
| `/api/auth/*` | Login, logout, token refresh, OIDC callback |
| `/api/users/*` | User management and permissions |
| `GET /api/preview` | Preview a draft on the site (when `sitePreview` is set) |

`/api/openapi.json` documents the full API; see also [API](/docs/api). Studio at `/studio` is served by each framework adapter's Studio handler (`createStudioRouteHandler` in Next.js, `createStudioHandler` in SvelteKit, `createStudioServer` in Express); the Vite plugin serves it itself.

## Next steps

- Define your content schema: [@krantho/schema](/docs/package-schema)
- Explore Studio: [@krantho/studio](/docs/package-studio)
- Set up SEO archetypes: [@krantho/seo](/docs/package-seo)
