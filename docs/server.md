# @krantho/server

Framework-agnostic server runtime for krantho. Resolves the configuration tree once, then initializes persistence, content engine, and API handlers from it. Converts between Web API Request/Response and the krantho API layer, runs content migration on startup, seeds SEO and LLM configuration, and serves the Studio SPA. It also owns the page cache rules every framework adapter serves pages by, and purges the CDN in front of the site when content changes.

## Context

Every krantho site needs a server handler regardless of framework. This package is the shared core that all framework-specific adapters (`server-next`, `server-sveltekit`, `server-node`) delegate to. It owns the startup sequence: create adapter, run migrations, import content, seed config, wire up API handlers.

## Rationale

- **One resolution point** -- `createKranthoHandler` calls `resolveConfig()` from [`@krantho/config`](configuration.md) exactly once, so defaults, `krantho.config.ts` and the environment are layered by one rule for every deployment target.
- **Config is data, wiring is code** -- collections, plugins and hooks are constructor arguments. Everything a deployer might want to change is a leaf of the tree and has an environment variable, including where media files are stored: `media.provider` picks the file store (see [guides/media.md](guides/media.md)).
- **Single startup path** -- all framework adapters call `createKranthoHandler` or `createLazyHandler`, ensuring consistent initialization regardless of deployment target.
- **Dynamic imports for optional backends** -- SQLite and Postgres adapters are loaded via `import()` so native modules are only pulled in when configured.
- **Lazy initialization** -- `createLazyHandler` defers the async setup to the first request, which is important for serverless environments where module-level `await` is not available.
- **SEO seed-on-startup** -- developer config flows into the `seo_config` table idempotently, so Studio overrides are preserved while defaults are always available.

## Architecture

### Directory Layout

```
src/
  handler.ts         -- KranthoHandlerOptions, createKranthoHandler (main entry)
  lazy-handler.ts    -- createLazyHandler (singleton deferred init)
  persistence.ts     -- createAdapter (provider factory)
  content-loader.ts  -- createContentLoader (published-content loader over the same persistence)
  read-cache.ts      -- createReadCache (the loader's content.cache read cache)
  page-request.ts    -- runPageRequest (a page request scope: read tags, preview reads)
  page-cache-rules.ts -- servePageRequest (which page responses a CDN may keep, and their headers)
  preview-token.ts   -- verifyPreviewRequest (signed preview links)
  cdn/               -- createCdnInvalidator (vercel, cloudfront, gcp) and the purge change listener
  convert.ts         -- toApiRequest, toResponse (Web API <-> ApiRequest)
  studio.ts           -- serveStudioAsset (internal), STUDIO_NOT_AVAILABLE_MESSAGE
  studio-gate.ts      -- createStudioServer: Studio gate + SPA serving for every adapter
  import.ts          -- autoImport (markdown import into an empty database)
  content-migration.ts -- runContentMigration (new and changed files on a newer content manifest), claimContentAnnouncement
  route-matcher.ts   -- matchRoute, routeSpecificity, encode/decodeRouteSlug
  seo-config-io.ts   -- loadSeoConfigDir, exportSeoConfig, importSeoConfig
  seo-seed.ts        -- seedSeoOnce (the seo section's seed, shared by the handler and the loader; internal)
  manifest.ts        -- generateManifest (the content version and each file's checksum)
  content-dates.ts   -- generateContentDates, loadContentDates, contentVersion (each content file's last git commit, and the content's version)
  indexnow.ts        -- submitIndexNow and the IndexNow change listener
  webhook-sweep.ts   -- createWebhookSweep (the throttled retry of failed webhook deliveries; internal)
  mime-types.ts      -- MIME_TYPES map
  lock-adapters.ts   -- createLockAdapters (sub-adapter factory, media metadata and folders and the page cache store included)
  file-store.ts      -- createFileStore (loads the media file store media.provider names; internal)
  page-cache-store.ts -- openPageCacheStore (the shared page cache store the Next.js cache handler opens)
```

### Startup Sequence

1. Resolve and validate the configuration tree -- defaults, then code, then the environment; every problem reported in one error
2. Create persistence adapter from `config.persistence` (filesystem, SQLite, or Postgres)
3. Run content migration (new and changed files on a newer content manifest, or every file into an empty database)
4. Create content engine with caching; when `cache.cdn.provider` is set, add the CDN purge to the change listeners (a startup import that imported anything announces a site-wide change, which purges the whole site; the content loader's own import announces nothing, so deploys purge the CDN themselves -- see [page-caching.md](guides/page-caching.md#deploys))
5. Create sub-adapters (lock, webhook, retention, settings, SEO config, media metadata and folders, page cache store) on the same database handle
6. When `media.provider` is set, load its file store package and compose the media library
7. Seed SEO config from developer defaults (idempotent; once per process and database, shared with the content loader)
8. Seed LLM config from developer defaults (idempotent)
9. Wire up API handlers via `createApiHandlers`, passing the `webhooks` of the configuration and the page cache store when `cache.shared` is `database` (the API's publish impact counts its entries)
10. Announce a site-wide change when the startup import imported anything, or when the database holds a content version not announced yet (`content.announcedVersion` in the site settings) -- the content loader may have imported it first
11. Return handler with `handle(request: Request): Promise<Response>`

## API Reference

### `createKranthoHandler(options: KranthoHandlerOptions): Promise<KranthoHandler>`

Main entry point. Resolves the configuration, runs the full startup sequence and returns a handler. Call once at module level -- the handler is designed to be reused across requests.

```typescript
import { createKranthoHandler } from '@krantho/server'
import config from './krantho.config'

const handler = await createKranthoHandler({
  config,
  collections: { pages, globals },
})
```

### `KranthoHandlerOptions`

```typescript
interface KranthoHandlerOptions {
  config: KranthoConfigInput
  collections: Record<string, Collection>
  pages?: readonly PageDefinition[] | undefined
  plugins?: KranthoPlugin[] | undefined
  hooks?: ContentHooks | undefined
  /** Told about every committed write: API, startup import, file watcher (see api.md, "Content changes") */
  onContentChange?: ContentChangeListener | undefined
  /** Keep a background job running past its request's response (`after()` in Next.js) */
  waitUntil?: ((work: Promise<unknown>) => void) | undefined
  /** How the host renders drafts for editors on the site: enables `GET /api/preview` (see api.md, "Site preview") */
  sitePreview?: 'draft-mode' | 'signed-url' | undefined
  /** The server package hosting the handler, reported by `GET /api/capabilities` */
  framework?: 'next' | 'sveltekit' | 'node' | undefined
}
```

- `config` -- the object `defineKranthoConfig()` returned. Resolved here against `process.env`; see [configuration.md](configuration.md) for every leaf and its variable.
- `collections` -- collection definitions from `defineCollection()`, keyed by collection name (see [schema.md](schema.md))
- `pages` -- page definitions from `definePage()` for `resolvePageRoute`
- `plugins` -- plugins contributing routes, hooks and field types
- `hooks` -- lifecycle hooks
- `onContentChange` -- told about every committed write; with a CDN configured, the purge runs after it, even when it throws
- `waitUntil` -- keeps background work (the SEO enrichment job, a CDN purge, the webhook retry sweep) running past the response on hosts that end a request's work with it: `after()` in Next.js, `waitUntil` from `@vercel/functions` in a Vercel function. Without it, background work is fire-and-forget -- fine on a long-running server, liable to be cut off on a serverless host
- `sitePreview` -- `'draft-mode'` for Next.js draft mode (`@krantho/server-next` passes it), `'signed-url'` for a short-lived link each page request verifies with `verifyPreviewRequest()` (SvelteKit, Express)
- `framework` -- the server package hosting the handler, which `/api/capabilities` reports and Studio's Pulse shows. Each server package sets its own (`'next'`, `'sveltekit'`, `'node'`), overriding what the options carry; a handler created directly has none

Settings that used to live beside these -- site identity, persistence, auth, media storage, SEO seeds, the LLM provider -- are leaves of the configuration tree now.

### Media

There is no media option. Media is on exactly when `media.provider` is set in the configuration (`local`, `vercel-blob`, `s3` or `gcs`), and off when it is unset:

```typescript
// krantho.config.ts
export default defineKranthoConfig({
  media: { provider: 'local', local: { dir: 'public/uploads' } },
})
```

At startup the handler builds the media library from two parts:

- **Metadata and folders** come from the persistence -- `createLockAdapters` returns the SQLite or Postgres media adapters on the same database handle as everything else. The filesystem persistence has none, so a provider set on `persistence.provider: 'filesystem'` is a startup error (`media needs sqlite or postgres`).
- **File bytes** go to the store `media.provider` names. `createFileStore` (internal, `file-store.ts`) loads its package with a literal dynamic import, so Next.js and Vercel file tracing can follow it. When the package is not installed, startup fails with `media.provider is "s3", but @krantho/media-s3 could not be loaded. Add it to the dependencies of the app that runs krantho.`

A missing store setting (a bucket, a token, a region) is reported with the rest of the configuration problems, naming the path and its variable. See [guides/media.md](guides/media.md) for each store.

### `KranthoHandler`

```typescript
interface KranthoHandler {
  handle(request: Request): Promise<Response>
  /** Stop the file watcher and release resources */
  close(): void
}
```

### SEO and LLM seeding

Both read the resolved tree and run only when the developer or the operator configured that section -- a site that sets nothing writes nothing.

`config.seo` carries three input shapes: the thin one (`identity`, `collections`, `routes` -- type lists), the rich one (`site`, `richCollections`, `richRoutes` -- full entity config), and the file-based one (`configDir`, e.g. `'./krantho.seo'`). `seo.seedMode: 'seed'` (the default) preserves rows already in the database; `'overwrite'` replaces them.

The handler and the content loader both seed SEO before they serve anything, through one shared function that runs once per process for each database and seed: concurrent first requests share it, and whichever opens the database later does not seed again -- so an `'overwrite'` seed never lands over edits made since the process started. Neither composes a page from an unseeded database, so no stale page is cached and the seed announces no change. Across instances the seed is idempotent: `'seed'` writes only missing rows, and each row is saved whole.

`config.llm` seeds `provider`, `model` and `baseUrl` into `site_settings` on first boot, -- when the code passes an `llm` block, or the environment chooses a provider (`KRANTHO_LLM_PROVIDER`) and supplies that provider's key (for example `KRANTHO_LLM_OPENAI_API_KEY`). The provider is stored only when it was chosen: a key alone, for a provider nobody chose, seeds no provider, and any other `llm.*` variable alone does not seed, the subscription token (`KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN`) included, which is never stored. Admin edits are preserved -- the seed is skipped once a provider is stored. No credential is seeded or copied into the database: the credential is picked per request, the active provider's own, `claude-code` the subscription token only, every other provider its own variable (`KRANTHO_LLM_<PROVIDER>_API_KEY`) or the key the app's code passes, then the key pasted in Setup, sealed by the secret vault (`secrets.provider`), and never another provider's. A key rotated in the environment therefore takes effect at once (see [ai.md](ai.md#credentials)).

### `createLazyHandler(options: KranthoHandlerOptions): () => Promise<KranthoHandler>`

Returns a function that creates the handler on first call and caches it. Concurrent first calls share one creation. A failed creation is not cached -- the next call retries, so an instance that met an unreachable database at cold start recovers without a restart. Used by all framework adapters.

### `createAdapter(persistence: PersistenceSection, site: Pick<SiteSection, 'defaultLocale'>, content: Pick<ContentSection, 'defaultStatus'>): Promise<AdapterResult>`

Creates a persistence adapter from the `persistence` section, the site's default locale and the content status default of the resolved tree. `site.defaultLocale` is the locale of every read and write that names none, and of a file whose frontmatter declares none; `content.defaultStatus.filesystem` is the status of a file whose frontmatter declares none. Filesystem is loaded directly; SQLite and Postgres use dynamic import to avoid pulling in native modules when unused.

### `openPageCacheStore(persistence: PersistenceSection): Promise<IPageCacheStore>`

Opens the shared page cache store of a site's database (see [persistence.md](persistence.md#page-cache)) — for `@krantho/server-next/cache-handler`, which calls it once per process with `resolvePersistence(process.env)`. It opens the database as the server does, through `createAdapter()` with an empty default locale, since the page cache reads no content and runs without the site's configuration, so the migrations run (creating the SQLite file's directory first), and returns the store `createLockAdapters()` builds for it. It throws when `persistence.provider` is `filesystem` — there is no database to share between instances — and when the backend returns no store.

### `createContentLoader(options: { config, collections }): IPublishedContentLoader & IPublishedSeoLoader`

The content loader server-rendered pages read through (`initServerLoader()` in `@krantho/ui-react/server`, or directly in a SvelteKit `load`). It reads only the live (published) version of a document — never a newer saved version — by collection, slug and locale; an omitted locale is `site.defaultLocale`. `getPublished(ref)` answers `null` when nothing is live; `listPublished(collection, locale?)` returns the live version of every document in a collection that has one, and `listPublishedSummaries(collection, locale?)` the same documents without their body (a `summary` query), for a page that only lists them.

It takes the `config` and `collections` that `createKranthoHandler()` takes, resolves the same configuration and opens persistence through `createAdapter()`, so pages and the API read one database — SQLite by default, Postgres when configured — with no second path to keep in step. Keep the collections in one module (`krantho.collections.ts`) that the API route and the loader both import. On first open, before its first read returns, it runs the same content import and SEO seed the handler runs at startup, so a fresh database is filled and configured whichever of them a deployment serves first. The adapter opens on the first read, not at import time; a failed open is retried on the next read, and an adapter without `getPublished` and `query` is an error.

It also serves the pages' SEO (`IPublishedSeoLoader` from `@krantho/core`): `seoProperties(configId, locale?)` returns document properties from that locale's published metadata for a document ID, and shared policy properties from configuration storage for other scopes, and `jsonLd(ref)` composes a page's JSON-LD graph from its published version with `composePageJsonLd()` from `@krantho/api`, the composition the SEO preview endpoint uses — so no page calls the site's own API. Reads are cached per `content.cache` (`enabled`, `ttlMs`, `maxEntries`), so pages cache exactly as long as the API does; set `KRANTHO_CONTENT_CACHE_TTL_MS` low (or `KRANTHO_CONTENT_CACHE_ENABLED=false`) where pages and the API run in separate processes, such as serverless functions, and published changes must appear at once. With `cache.pages: 'next-isr'` the loader keeps no read cache: Next.js caches page reads instead. With `cache.pages: 'cdn'` it keeps none either: the CDN caches the pages, and after a publish purges it the next render must read the new version. Its `preview` view serves the same reads for an editor's preview: a document and its JSON-LD from the current version, draft included, uncached; lists stay the live documents. `isPreview()` says which a render reads: `true` inside a `runPageRequest({ preview: true })` scope and on the `preview` view, `false` otherwise -- for visitors and for any render a cache keeps. Page templates pass it to the Live marks (`MarkedDocument.preview`, see [core.md](core.md#marks)). `@krantho/server-sveltekit` and `@krantho/server-node` re-export it; `@krantho/server-next` wraps it in the Next.js data cache (see [server-next.md](server-next.md#createcontentloaderoptions--config-collections--ipublishedcontentloader--ipublishedseoloader)).

### `runPageRequest(options, render)`

```typescript
function runPageRequest<T>(
  options: { preview: boolean },
  render: () => Promise<T>,
): Promise<{ value: T; tags: string[] }>
```

Renders one page inside a page request scope (`AsyncLocalStorage`). While `render` runs, every content loader read records its cache tags into the scope (`documentReadTags`, `listReadTags`, `seoReadTags`, `jsonLdTags` from `@krantho/core`), and with `preview: true` every read is served from the loader's `preview` view -- the current version, draft included, uncached. The tags come back deduplicated, in first-read order. Each call has its own scope, so concurrent and nested renders never share tags or the preview flag; a nested scope's tags do not reach the outer one. Outside a scope the loader behaves as it always does. `@krantho/server-sveltekit` and `@krantho/server-node` re-export it.

### `servePageRequest(request, config, render, inspect)`

```typescript
function servePageRequest<T>(
  request: { url: string | URL; method: string },
  config: KranthoConfigInput,
  render: () => Promise<T>,
  inspect: (value: T) => { status: number; header: (name: string) => string | null },
): Promise<{ value: T; headers: Record<string, string> }>
```

The page cache rules every framework adapter serves pages by (`createPageCacheHandle` in `@krantho/server-sveltekit`, `renderCachedPage` in `@krantho/server-node` are thin wrappers):

1. A `GET` or `HEAD` for a path outside `/api` and `/studio` is a page -- however the path is spelled: percent-encoded, in any case, with repeated slashes; a path that does not decode counts as theirs. Anything else renders outside a scope and gets no headers.
2. A page whose URL carries a valid signed preview token renders with `preview: true` and gets `previewHeaders()` plus `Referrer-Policy: no-referrer`.
3. Otherwise it renders with `preview: false`. Under `cache.pages: 'cdn'` a `200` or `404` that sets no cookie and whose own `Cache-Control` says none of `private`, `no-store`, `no-cache` gets `cdnCacheHeaders()` of the configured provider with the tags it read. Anything else gets no headers.

`config` is resolved against `process.env` once per config object. `request.url` is absolute, or a path with its query string. Start every content read inside `render`: a read started before it, or one that outlives it, records no tags. See the [page caching guide](guides/page-caching.md).

### `verifyPreviewRequest(url: URL, config: Pick<KranthoConfig, 'auth'>): boolean`

Whether a page URL carries a valid signed preview token (`?krantho-preview=`, from `GET /api/preview` in `signed-url` mode): signed for this URL's path, and not expired. It verifies with `resolveJwtSecret(config.auth)` from `@krantho/api`, the secret the API signs with: the configured `auth.jwtSecret`, or, when none is configured, the one ephemeral secret of the process. A link therefore verifies without `KRANTHO_JWT_SECRET` while the API and the pages run in one process (development, a single server). With several instances or serverless functions the secret must be configured, or a link signed by one instance fails on another and the page renders the published version.

### `createCdnInvalidator(cache: CacheSection): CdnInvalidator | null`

```typescript
interface CdnInvalidator {
  /** Purge every cached response carrying any of the tags */
  purgeTags(tags: readonly string[], mode: 'expire' | 'stale'): Promise<void>
  /** Purge cached responses by path (`/about`, `/about*`, `/*`) */
  purgePaths(paths: readonly string[], mode: 'expire' | 'stale'): Promise<void>
}
```

The purge client for `cache.cdn.provider`; `null` for `none`. Configuration validation guarantees each provider's settings.

- `vercel` -- `@vercel/functions` (optional peer, dynamic import): `expire` → `dangerouslyDeleteByTag(tags, { revalidationDeadlineSeconds: 0 })`, `stale` → `invalidateByTag(tags)`. Both work only inside a Vercel function and resolve as no-ops elsewhere. Path purges are ignored with one warning.
- `cloudfront` -- `@aws-sdk/client-cloudfront` (optional peer, dynamic import), one `CreateInvalidationCommand` per purge with a `#`-prefixed item per tag (or the paths), a unique `CallerReference`, a client for `us-east-1` and credentials from the SDK's default chain. Mode is ignored: CloudFront only deletes.
- `gcp` -- plain `fetch` to the URL map's `invalidateCache`: tags in chunks of 10 to the `beta` endpoint, each path to `v1`. The bearer token is `cache.cdn.gcp.accessToken`, or a metadata-server token reused until shortly before it expires. Mode is ignored.

A purge never throws: a failed request is retried once, immediately, then logged. A lost purge is bounded by the page's `s-maxage`.

### CDN purge on content changes

When `cache.cdn.provider` is set, `createKranthoHandler()` adds a change listener after the host's `onContentChange`:

| `cache.pages` | Provider | Purge per live change |
|---|---|---|
| `cdn` | any | `purgeTags` with the tags of `invalidationsFor(change)`, one call per mode |
| `next-isr` | `cloudfront`, `gcp` | `purgePaths(['/*'])`, `expire` when any invalidation expires, else `stale` |
| `next-isr` | `vercel` | none: `revalidateTag` already purges Vercel's edge |
| `none` | any | none |

A change `invalidationsFor` maps to nothing -- a save that keeps the live version, a media change -- purges nothing. The purge runs in the background: the listener returns at once and hands the work to `waitUntil` when the host gives one, and a failure never fails the write.

### Webhooks

The `webhooks` section of the configuration -- a list of `{ url, events, secret? }` -- is passed to `createApiHandlers`, which fires each webhook subscribed to a content event. With SQLite or Postgres persistence every delivery is logged, Setup › Integrations lists them, and a failed one is retried automatically; over the filesystem adapter there is no log, so deliveries are fire-and-forget and never retried.

The retry runs as a sweep from the request handler, since a serverless host does not keep a timer alive. `createWebhookSweep({ webhooks, deliveries, waitUntil?, now? })` returns a function the handler calls for every request. It starts `processWebhookRetries` when none is running and at least `WEBHOOK_SWEEP_INTERVAL_MS` (30 seconds) has passed since the last start -- the first request after boot sweeps at once -- and otherwise does nothing. The sweep never delays or fails the request: it is handed to `waitUntil` when the host gives one, and an error is logged. A delivery is due when its retry time has passed (backing off: immediately, 30 s, 2 min, 15 min, 1 h); after `MAX_WEBHOOK_ATTEMPTS` it is failed and waits for **Retry** in Setup › Integrations.

### `toApiRequest(request: Request): Promise<ApiRequest>`

Converts a Web Request to the framework-agnostic `ApiRequest`. Handles JSON and multipart/form-data content types. The `/api` prefix is preserved for the API router.

### `toResponse(apiResponse: ApiResponse): Response`

Converts an `ApiResponse` to a Web Response. Handles JSON, binary (Buffer/Uint8Array), string, null and stream bodies, and writes each cookie in `cookies` as its own `Set-Cookie` line.

A `ReadableStream` body is passed to the `Response` unread (content type `application/octet-stream` unless the handler set one), so a handler can stream -- the [Studio assistant](assistant.md)'s chat answers `text/event-stream` this way. Next.js route handlers and SvelteKit return that `Response` as it is and stream it; a Node server must write it with `writeWebResponse` from `@krantho/server-node` rather than buffer it with `response.text()` (see [server-node.md](server-node.md#writewebresponseres-serverresponse-response-response-promisevoid)).

### `createStudioServer(config?: KranthoConfigInput): StudioServer`

Returns the function every framework adapter uses to answer `/studio` requests: `({ url, cookie }) => Response`.

- **Serving.** Serves the `@krantho/studio` SPA from its `dist/` directory. The directory is found by resolving `@krantho/studio/dist/index.html` from the app root (the app lists `@krantho/studio` as a dependency), then by walking up from the working directory for `node_modules/@krantho/studio/dist` or `packages/studio/dist`. Strips the `/studio` prefix, serves the build's content-hashed `assets/` files with immutable cache headers, and falls back to `index.html` for SPA routing; a missing `assets/` file answers 404, never `index.html`. When Studio is not built it answers 503 with a build instruction.
- **Gate.** With a configuration whose `auth.mode` is `oidc` and `auth.oidc.studioEntry` is `redirect`, Studio is served only with a valid access cookie. Without one, a request that carries a refresh cookie is redirected (302, `no-store`) to `GET /api/auth/refresh?returnTo=<path>`, which rotates the session and redirects back, or starts a new sign-in when the refresh token is no longer valid (leaving the cookies to the sign-in, so two tabs refreshing at once cannot undo each other's new session); a request with neither is redirected to `/api/auth/login/oidc?returnTo=<path>`. A refused sign-in answers 404 from the callback. Gated responses are marked `private`, so a shared cache never answers for the gate. The build's `/studio/assets/` files bypass the gate: they hold no data, and the running SPA loads chunks lazily after its access cookie (`auth.session.accessTtlSec`) may have expired — a gated chunk would redirect and fail to load. Without a configuration, or with `studioEntry: 'login'` (the default), the SPA is served as-is and shows its own sign-in page.

### `autoImport(adapter, contentConfig, dateOf?): Promise<number>`

Imports `.md` files from content directories into the database. Skips if the database already has content. A configured collection directory that does not exist is logged and skipped — usually content left out of a deployment bundle. Parses frontmatter, validates against collection schemas, and renders markdown to HTML. `dateOf(filePath)` dates each imported version (`upsertFromFile`'s `modifiedAt`) by when its file last changed; a file without a date is dated by the import. The handler and the content loader pass the dates the build wrote to `<paths.contentDir>/dates.json`, for the empty-database import and the manifest migration alike.

### `generateContentDates(contentDir): Promise<ContentDates | null>`

Writes `<contentDir>/dates.json`: every markdown file under `contentDir` with its last git commit date (ISO 8601), keyed by its path relative to `contentDir` (`docs/install.md`). Run it at build time, where the repository's history is present. It answers null and writes nothing without git, or in a shallow clone (`fetch-depth: 1`), where every file would carry the latest commit's date; a file that is not committed is left out. Because each version keeps the time it was written, the sitemap's `lastmod` is then the file's last commit for a page never edited in Studio, and the time an editor last published it otherwise. `loadContentDates(contentDir)` reads the file back (no dates when it is missing). Gitignore the file — it is written by every build.

### IndexNow

With `seo.indexNow.key` set (`KRANTHO_SEO_INDEX_NOW_KEY`), the handler notifies IndexNow (Bing and the other participating engines) through a change listener after the host's own listener and the CDN purge: a document's page when its published version changes (a publish, an unpublish, an archive, a delete — not a save), and every page in the sitemap after a site-wide change such as the startup import. The submission runs alongside the response (`waitUntil` on serverless hosts), never fails the write, is logged with the URLs and IndexNow's answer (`[indexnow] IndexNow: submitted 1 URL, HTTP 200`), and is skipped for a `site.baseUrl` on a local host and whenever `NODE_ENV` is not `production`, so a development server configured for the real site never announces its pages under that domain. The key itself is served by `GET /api/seo/indexnow/:key`; the site routes `/<key>.txt` there, the address IndexNow checks.

`submitIndexNow({ baseUrl, key }, urls, fetchFn?)` submits URLs directly — a deploy step that submits the whole sitemap uses it. It sends at most 10,000 URLs per request, resolves with IndexNow's HTTP status for each request, and throws unless every one is 200 or 202. `describeSubmission(urls, statuses)` formats the log line both use — `IndexNow: submitted 63 URLs, HTTP 200` followed by every URL — so the deploy log and the server log show exactly what IndexNow was told.

### `generateManifest(contentDir, version, commit?): Promise<ContentManifest>`

Writes `<contentDir>/manifest.json`: the content's `version` and every markdown file under `contentDir` with its SHA-256, keyed by its path relative to `contentDir`. Run it at build time, after `generateContentDates`, with `contentVersion(contentDir)` — the time of the last commit that touched the content directory, in seconds, so every content change (a deleted file included) raises it; null without the full history. Pass `contentCommit(contentDir)` (`git rev-parse HEAD`, or null outside a checkout) as `commit`: the migration stores it with the import as `repoCommit`, the baseline a pull of production's edits starts from (see the [content round trip](../krantho-site/content/docs/content-round-trip.md)). Gitignore the file.

### Content migration

`runContentMigration(adapter, contentConfig, migrationAdapter, checkpointAdapter, contentDir)` runs on startup in the handler and in the content loader. Without `<contentDir>/manifest.json` it imports into an empty database only (`autoImport`). With one whose `version` is higher than the database's (or a database without a version), it compares every file with its document's current version:

| File and document | Outcome |
|-------------------|---------|
| No document, file never imported | imported |
| Same canonical fields, body, metadata, defaults and contract | unchanged |
| Only the repository differs from the agreed basis | imported |
| The document's current version was written by an import (`source: 'filesystem'`, no `changedBy`; a restore always names who restored it) | imported: nobody edited it, even when it predates its basis and contract |
| Only the database differs from the agreed basis | kept (the editor's version stands) |
| Repository and database both differ from their agreed basis | conflict, recorded with document locale for `GET /api/migrations/conflicts`, once while it stays open |
| No document, file imported before | deleted (it was deleted in Studio) |
| File fails its collection's schema | rejected, and logged |
| Document written by an import (`source: 'filesystem'`, no `changedBy`) whose file is gone, in a collection whose directory still holds files | removed: the document is deleted |

Fields and body are compared by `contentChecksum(fields, body)`, which sorts object keys and writes dates as ISO strings, so a file and its database copy compare equal regardless of how the database stores JSON. Importing a document resolves its open conflicts as `use_repo`. A checkpoint is taken before an import writes to or deletes from a database that holds content. The database then records the manifest's version and each file's checksum. A file removed from the repository deletes its document, unless an editor changed the document in Studio; a collection directory without any files deletes nothing, so a deployment that misses its content keeps it.

### Route Matching

- `matchRoute(pattern: string, url: string): boolean` -- tests URL path against a route pattern
- `routeSpecificity(pattern: string): number` -- scores specificity (literal=2, wildcard=1, globstar=0)
- `encodeRouteSlug(pattern: string): string` -- encodes a URL pattern to a filesystem-safe slug
- `decodeRouteSlug(slug: string): string` -- decodes back to a URL pattern

Pattern syntax: literal segments (`/services/consulting`), single-segment wildcard (`/services/*`), multi-segment wildcard (`/services/**`).

### SEO Config I/O

- `loadSeoConfigDir(dir: string): Promise<SeoSeedConfig>` -- loads SEO config from a directory layout
- `exportSeoConfig(adapter, targetDir): Promise<ExportResult>` -- exports DB state to YAML files
- `importSeoConfig(adapter, sourceDir, options?): Promise<ImportResult>` -- imports YAML files to DB

Directory layout:

```
krantho.seo/
  site/                          -- site-scope entities
    professional-service.yaml
    _field-mappings.yaml
  collections/{name}/            -- collection-scope entities
  documents/{collection}/{slug}.yaml
  routes/{slug-encoded}.yaml
```

### Re-exported Types

- `ContentConfig` from `@krantho/schema`
- `IPageCacheStore`, `PageCacheValue` from `@krantho/persistence`

## Usage

### Minimal Setup

```typescript
// krantho.config.ts
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
})
```

```typescript
// the route file
import { createKranthoHandler } from '@krantho/server'
import { defineCollection } from '@krantho/schema'
import config from './krantho.config'

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: './content/pages',
  schema: pageSchema,
})

const handler = await createKranthoHandler({ config, collections: { pages } })
```

### With SEO and Auth

```typescript
// krantho.config.ts
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  auth: { mode: 'token' },        // secret from KRANTHO_API_TOKEN
  llm: { provider: 'anthropic' }, // key from KRANTHO_LLM_ANTHROPIC_API_KEY
  seo: {
    identity: 'ProfessionalService',
    collections: { pages: ['Article'], services: ['Service'] },
  },
})
```

### With Postgres

```typescript
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  persistence: { provider: 'postgres' }, // url from KRANTHO_PERSISTENCE_POSTGRES_URL
})
```

The app adds `@krantho/persistence-postgres` and `postgres` to its own dependencies (see Peer Dependencies). Pool size, prepared statements and idle timeout are configuration leaves; [persistence-postgres.md](persistence-postgres.md) has the serverless guidance.

## Dependencies

### Runtime Dependencies

- `chokidar` -- file watching when `content.watch` is on
- `gray-matter` -- YAML frontmatter parsing for markdown import
- `marked` -- markdown-to-HTML rendering during import
- `yaml` -- YAML parsing/serialization for SEO config files

### Workspace Dependencies

- `@krantho/config` -- the configuration tree, `resolveConfig`, `defineKranthoConfig`
- `@krantho/api` -- API handlers, auth, MediaConfig
- `@krantho/core` -- ContentEngineFactory, the cache tags, `invalidationsFor`, `cdnCacheHeaders`, `previewHeaders`
- `@krantho/schema` -- ContentConfig, PageDefinition, validation
- `@krantho/persistence` -- IPersistenceAdapter interfaces
- `@krantho/seo-shared` -- SeoConfigData types
- `@krantho/persistence-fs` -- FileSystemAdapter (direct dependency)
- `@krantho/persistence-sqlite` -- SQLiteAdapter (direct dependency, loaded for default provider)

### Peer Dependencies (Optional)

- `@krantho/persistence-postgres` -- only needed when `persistence.provider` is `postgres`
- `@vercel/functions` -- only needed when `cache.cdn.provider` is `vercel`
- `@aws-sdk/client-cloudfront` -- only needed when `cache.cdn.provider` is `cloudfront`
- `@krantho/media-local` -- only needed when `media.provider` is `local`
- `@krantho/media-vercel-blob` -- only needed when `media.provider` is `vercel-blob`
- `@krantho/media-s3` -- only needed when `media.provider` is `s3`
- `@krantho/media-gcs` -- only needed when `media.provider` is `gcs`
- `postgres` -- PostgreSQL client, only needed with Postgres provider

An app that selects the Postgres provider must list `@krantho/persistence-postgres` and `postgres` in its own dependencies; without them, boot fails with an error naming both.

Development file watching saves edits through the common document save path. Hooks and foreign edit locks apply, saves create drafts, and removing a file does not delete its document. Initial seeding and manifest-driven deployment imports use the configured filesystem publication policy.
