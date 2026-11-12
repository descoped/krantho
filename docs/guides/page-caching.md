# Page Caching

How a krantho site serves pages from a cache and refreshes exactly the pages a content change affects, on each framework and behind each CDN.

## Context

A server-rendered page that reads the database on every visit costs a render and a query per request. krantho knows two things that make caching precise instead of timed: every page read registers the cache tags of what it read (the document, a collection list, an SEO configuration, the site), and every committed write announces a `ContentChange` that `invalidationsFor()` in `@krantho/core` maps to the tags it invalidates (see [core.md](../core.md#cache-tags)). A cached page is therefore kept until something it shows changes, and then only that page is refreshed.

One configuration leaf picks the strategy, `cache.pages`, a second names the CDN, `cache.cdn.provider`, and a third, `cache.shared`, lets several Next.js instances share one cache. The application code is the same for every CDN: the topology is chosen by environment at deploy time, and no provider is preferred.

## Topologies

| `cache.pages` | Framework | `cache.cdn.provider` | Who caches pages | How a change reaches them |
|---|---|---|---|---|
| `none` (default) | any | ignored | nobody: every request renders | nothing to refresh |
| `next-isr` | Next.js | `none` or `vercel` | Next's ISR cache; on Vercel, Vercel's CDN | `revalidateTag` in the API route |
| `next-isr` with `cache.shared: 'database'` | Next.js, several instances | `none`, or `cloudfront` or `gcp` in front | Next's cache in the site's database, shared by every instance | `revalidateTag`, which every instance sees |
| `next-isr` | Next.js | `cloudfront` or `gcp` | the CDN, by Next's own `Cache-Control` (`s-maxage`), in front of Next's ISR cache | `revalidateTag`, then a CDN purge of `/*` |
| `cdn` | SvelteKit, Express | `vercel`, `cloudfront` or `gcp` (required) | the CDN, by the page's CDN headers | a CDN purge by tag |

With `none`, the content loader keeps its own read cache (`content.cache`, see [server.md](../server.md#createcontentloaderoptions--config-collections--ipublishedcontentloader--ipublishedseoloader)). Under `next-isr` and `cdn` that read cache is off: Next.js or the CDN is the cache, and a render after a purge must read the new version, not a cached read the CDN would then keep for `s-maxage`.

### `none`

Every request renders the page from the database. Nothing is purged, whatever `cache.cdn.provider` says. Pages show a publish as soon as the loader's read cache (`KRANTHO_CONTENT_CACHE_TTL_MS`) lets them.

### `next-isr`

Each Next.js page is rendered on its first request and kept until a change invalidates its tags. The route shape and the invalidation table are in [server-next.md](../server-next.md#cached-pages); the Vercel deployment in [deploy-vercel.md](deploy-vercel.md#page-cache).

**Behind CloudFront or Cloud CDN.** Set `cache.cdn.provider` to `cloudfront` or `gcp` with the provider's settings (below). The CDN caches each page as Next's own `Cache-Control` says; after `revalidateTag` has refreshed Next's cache, the API route purges `/*` at the CDN. A per-page purge would leave the list pages that show a document stale at the CDN, and krantho cannot know their paths; the CDN's origin is Next's warm page cache, so a full purge costs only cheap origin hits. A save, which keeps the live version, purges nothing. The purge runs under `after()`, like the rest of the route's background work.

**On Vercel.** `next-isr` with `cache.cdn.provider: 'vercel'` (or `none`) needs no CDN purge: `revalidateTag` already purges Vercel's edge, and no purge listener is registered.

**Several instances.** Next's cache is per instance: `revalidateTag` in the instance that took a write leaves the others serving the old page. Several `next start` instances with no cache the platform shares between them set `cache.shared: 'database'` (`KRANTHO_CACHE_SHARED=database`, for the build and every server start), and `next.config.ts` sets `cacheHandler` to `@krantho/server-next/cache-handler` and `cacheMaxMemorySize` to `0`. Next's cache then lives in the site's own database, SQLite or Postgres: a page one instance rendered is served by every other, and an invalidation on one instance reaches all of them. An `expire` invalidation makes the next read a miss; a `stale` one serves the entry once more while Next re-renders it in the background. The handler opens the database from the environment alone (`resolvePersistence`), not from `krantho.config.ts`, so a non-default database is set by environment. Nothing is evicted, as in Next's own disk cache. A CDN in front works as above. Setup, the build and deployment notes: [server-next.md](../server-next.md#shared-cache-across-instances).

### `cdn`

A SvelteKit or Express site renders each page inside a page request scope (`runPageRequest()` from `@krantho/server`), which collects the tags of every content loader read. The page answers with headers that let the CDN keep it and name its tags; a content change purges those tags at the CDN, so the page is fresh on its next request.

- SvelteKit: `createPageCacheHandle({ config })` in `src/hooks.server.ts` (see [server-sveltekit.md](../server-sveltekit.md#page-cache)).
- Express or any Node server: `renderCachedPage(req, config, render)` around the page render (see [server-node.md](../server-node.md#rendercachedpagereq-config-render-promisecachedpage)).

Both apply the same rules, `servePageRequest()` in `@krantho/server` (see [server.md](../server.md#servepagerequestrequest-config-render-inspect)).

## Headers on a cached page

Under `cdn`, a page the CDN may keep answers:

| Header | Vercel, Cloud CDN | CloudFront |
|---|---|---|
| `Cache-Control` | `public, max-age=0, must-revalidate` | `public, max-age=0, s-maxage=<sMaxAgeSec>, stale-while-revalidate=<staleWhileRevalidateSec>` |
| the CDN's control header | `public, s-maxage=<sMaxAgeSec>, stale-while-revalidate=<staleWhileRevalidateSec>` | none |
| the CDN's tag header | the page's tags, comma-separated (`k:site,k:d:pages:about,k:d:globals:navigation,…`) | the same |

`max-age=0` keeps the page out of the browser, so a purge reaches every visitor. Vercel and Cloud CDN read the CDN lifetime from their own control header. CloudFront reads lifetimes only from `Cache-Control` and its cache policy, not from `CDN-Cache-Control`, so for CloudFront the lifetime is `s-maxage` in `Cache-Control` itself: browsers ignore `s-maxage` and still revalidate every visit, and `must-revalidate` is left out because it would forbid CloudFront to serve a stale page while it revalidates.

`KRANTHO_CACHE_CDN_S_MAX_AGE_SEC` (default one day) bounds how long a page stays cached if a purge is lost; `KRANTHO_CACHE_CDN_STALE_WHILE_REVALIDATE_SEC` (default one week) how long a stale page may be served while it is refreshed. The headers are built by `cdnCacheHeaders()` in `@krantho/core`.

**Tag budget.** A page carries at most 50 tags — the strictest per-response limit across the supported CDNs. `pageTagBudget()` drops duplicates; beyond the budget, document tags give way to their collection's tag (a change to any document in the collection then refreshes the page), then the rest is cut. `k:site` is always kept, so a site-wide change still reaches every page. Each tag is lowercase and at most 120 bytes.

## CDN providers

The three providers side by side, in no preferred order.

| | Amazon CloudFront | Google Cloud CDN | Vercel |
|---|---|---|---|
| `KRANTHO_CACHE_CDN_PROVIDER` | `cloudfront` | `gcp` | `vercel` |
| Required settings | `KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID` | `KRANTHO_CACHE_CDN_GCP_PROJECT`, `KRANTHO_CACHE_CDN_GCP_URL_MAP` | none |
| Optional settings | `KRANTHO_CACHE_CDN_TAG_HEADER` (default `x-krantho-cache-tag`) | `KRANTHO_CACHE_CDN_GCP_ACCESS_TOKEN` (secret) | none |
| CDN lifetime (`cdn`) | `s-maxage` and `stale-while-revalidate` in `Cache-Control` | `CDN-Cache-Control` | `Vercel-CDN-Cache-Control` |
| Tag header (`cdn`) | the configured tag header | `Cache-Tag` | `Vercel-Cache-Tag` |
| Tag purge (`cdn`) | `CreateInvalidation` with one `#<tag>` item per tag | `invalidateCache` on the URL map (`beta` endpoint), up to 10 tags per request | `invalidateByTag` (stale) or `dangerouslyDeleteByTag` (expire) |
| Path purge (`next-isr`) | `CreateInvalidation` with `/*` | `invalidateCache` with `path: '/*'` (`v1` endpoint) | none needed |
| Install in the app | `@aws-sdk/client-cloudfront` | nothing (plain `fetch`) | `@vercel/functions` |
| Credentials | the AWS SDK's default chain, allowed `cloudfront:CreateInvalidation` | a token from the metadata server (the runtime's service account, allowed `compute.urlMaps.invalidateCache`), or the configured access token | none: purges run inside a Vercel function |
| From the host | a cache policy that honours origin cache headers with Minimum TTL 0 (so a `private` or `no-store` response is never stored) and a Maximum TTL of at least `s-maxage`; the distribution's cache tag header set to the same name as `KRANTHO_CACHE_CDN_TAG_HEADER` | a backend service with Cloud CDN enabled behind the URL map, in a cache mode that honours origin headers | the site deployed on Vercel |

The SDKs are optional peer dependencies of `@krantho/server`, loaded by dynamic import when a purge runs. Until the app installs the one its provider needs, every purge fails and is logged; pages are still cached and expire after `s-maxage`.

**Invalidation modes.** A change invalidates in `expire` mode (the document an editor just changed: the next request renders it) or `stale` mode (a collection list, a global, the site: the old page is served once more while it re-renders). Vercel honours both. CloudFront and Cloud CDN only delete, so both modes delete there.

### How the providers are verified

krantho's tests check what krantho sends: the response headers for each provider (the example apps' `verify:cache` scripts run the real servers), and the exact purge requests (a mocked CloudFront client whose input is typed by the AWS SDK, stubbed Cloud CDN and metadata-server calls, a mocked `@vercel/functions`). They do not run against a live CloudFront distribution or Cloud CDN URL map. How the CDN stores, expires and invalidates what krantho sends follows each provider's documentation. Before relying on a provider in production, confirm on a staging distribution that a page is served from the CDN cache and that a publish invalidates it.

### CloudFront notes

- CloudFront caches a page for its `s-maxage`, capped by the cache policy's Maximum TTL, and honours `stale-while-revalidate`. The cache policy must honour origin cache headers with Minimum TTL 0: with a Minimum TTL above 0 CloudFront stores even `private` and `no-store` responses — previews and responses that set a cookie.

- The client is created for `us-east-1`, where CloudFront's global API is signed. The China partition is not supported.
- Each purge sends one `CreateInvalidation` holding all its items; the items of one purge are not split across invalidations. A change purges once per invalidation mode, so publishing a page or service sends two: its document tag (`expire`) and its collection tag (`stale`); a global sends one, since both its purges are `stale`. Each item counts against CloudFront's limits on invalidations in progress and toward its invalidation pricing.

### Cloud CDN notes

- Cloud CDN caps a response's tag header at 4 KiB, besides 50 tags and 120 bytes per tag. The tag budget caps the count, not the bytes: a page near the budget with long collection and slug names can exceed 4 KiB.
- Without a configured access token, a token is fetched from the metadata server (`Metadata-Flavor: Google`) and reused until shortly before it expires — which works on Google Cloud runtimes that expose the metadata server, such as Cloud Run and Compute Engine.

### Vercel notes

- `invalidateByTag` and `dangerouslyDeleteByTag` work only inside a Vercel function and resolve as no-ops elsewhere, so a local server with `KRANTHO_CACHE_CDN_PROVIDER=vercel` sends the headers but purges nothing.
- Vercel purges by tag only; a path purge is ignored with one warning. `next-isr` on Vercel never needs one.
- The SvelteKit examples build with `@sveltejs/adapter-vercel` when `VERCEL` is set. A local build with `VERCEL=1` needs a Node version the adapter supports (20, 22 or 24).

## Purges

A purge runs as a change listener that `createKranthoHandler()` adds when `cache.cdn.provider` is set (`createCdnInvalidator()` in `@krantho/server`): by tag under `cdn`, `/*` under `next-isr` behind CloudFront or Cloud CDN. It runs after the host's own `onContentChange`.

- **Never fails a write.** A failed purge request is retried once, immediately, with no backoff; a second failure is logged. A lost purge is bounded by `s-maxage`.
- **Background work.** The listener returns at once and hands the purge to the handler's `waitUntil`. `@krantho/server-next` passes `after()`. The SvelteKit and Express adapters pass none by default: on a long-running server (`node build`, a container, a VM) the purge simply completes after the response; on a serverless host it is fire-and-forget and may be cut off when the function ends — pass the platform's `waitUntil` in the handler options (on Vercel, `waitUntil` from `@vercel/functions`) to keep it alive.
- **What purges.** A publish, unpublish, archive or delete; a global; an SEO configuration; a site-wide change. A save purges nothing, and neither does a media change unless it rewrites content references (a replace of a file that documents link to announces a site-wide change).
- **Deploys are not purged reliably.** See [Deploys](#deploys): content files a deploy ships need a CDN purge as a deploy step.

## Deploys

Content files shipped with a deploy are imported into the database when the new code first opens it, but that does not reliably purge the CDN. Only the API handler announces changes: when it starts, it announces a site-wide change for each content version it has not announced yet (`content.announcedVersion` in the site settings), whether its own import or the content loader's brought the version in, and that purges the whole site (`k:site` under `cdn`, `/*` under `next-isr` behind a CDN). The content loader imports without announcing anything. In SvelteKit and Express the API handler starts lazily, on its first request, so when pages are requested first the loader imports the new files silently and nothing is purged until something calls the API. The same holds for Next.js pages behind CloudFront or Cloud CDN. Content files a deploy ships therefore reach CDN-cached pages only after `s-maxage` or the API handler's first request, unless the deploy purges the CDN.

Purge the whole CDN as a deploy step whenever a deploy changes content files, or changes how pages render:

| Provider | Deploy step |
|---|---|
| Amazon CloudFront | invalidate `/*` on the distribution: `aws cloudfront create-invalidation --distribution-id <id> --paths '/*'` |
| Google Cloud CDN | invalidate `/*` on the URL map: `gcloud compute url-maps invalidate-cdn-cache <url-map> --path '/*'` |
| Vercel | nothing: a new deployment starts with an empty CDN cache |

## Which responses a CDN may keep

The rules every adapter applies (`servePageRequest()`):

- Only a `GET` or `HEAD` for a path outside `/api` and `/studio` is a page — however the path is spelled (percent-encoded, in any case, with repeated slashes). Everything else renders outside a scope and gets no headers.
- Only a `200` or a `404` is cached.
- A response that sets a cookie is never cached. Neither is one whose own `Cache-Control` says `private`, `no-store` or `no-cache`: that header is left as the page set it. A page that depends on the visitor's cookie or credentials must say so there.
- Start every content read inside the render (a SvelteKit `load`, the Express `render` callback). A read started before the scope, or streamed after it ends, records no tags, so no purge would reach the page.
- Never read `loader.preview` outside a preview request: that puts a draft into a page the CDN keeps.

SvelteKit specifics:

- Keep `createPageCacheHandle` the outermost handle — first in `sequence()`. An outer hook that appends a `Set-Cookie` after it would bypass the cookie check.
- `kit.paths.base` is not supported: `/base/studio` would be treated as a page.
- A `load` that calls `event.fetch` for another page route runs the hook again, in a nested scope: the inner page's tags never reach the outer one. Read content through the loader instead. Never forward the page's query string (`url.search`) to such a fetch: a preview token forwarded there renders a draft inside a page the CDN caches.
- Experimental remote functions are classified by their page path (`x-sveltekit-pathname`): a remote `GET` query that reads a cookie would be cached as that page. Mark such responses `private`.

Express specifics:

- Pass `req.originalUrl`, not `req.url`: under a mounted router `req.url` loses the mount path and the query string that carries a preview token.
- Return every header the page sets — a cookie above all — from `render`, and set them from the helper's result. A header set on `res` inside `render` is invisible to the rules.

## Editor preview

**Next.js** uses draft mode: `sitePreview: 'draft-mode'`, a cookie, and Next renders the page per request (see [server-next.md](../server-next.md#editor-preview)).

**SvelteKit and Express** use signed links: pass `sitePreview: 'signed-url'` to the API handlers. An editor's `GET /api/preview?collection=pages&slug=about` answers `307` to `/about?krantho-preview=<token>` — a token valid for ten minutes, bound to that path, signed with `auth.jwtSecret` (see [api.md](../api.md#site-preview)). The page request verifies it (`verifyPreviewRequest()`), reads every document and its JSON-LD from the current version, draft included, and answers `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer` — so the token never leaks through a link on the preview page and the CDN never keeps it. Lists on a preview page still show published documents.

Without `KRANTHO_JWT_SECRET` the API and the pages share the process's ephemeral secret (`resolveJwtSecret()`), which is enough when one process serves both, as in development. Set it on every deployment with more than one instance or with serverless functions: otherwise a link signed by one instance renders the published page on another.

## Choosing

- **Next.js on Vercel:** `next-isr`.
- **Next.js behind CloudFront or Cloud CDN:** `next-isr` with the provider set.
- **Several Next.js instances without a shared platform cache:** `next-isr` with `cache.shared: 'database'` and the cache handler in `next.config.ts`.
- **SvelteKit or Express behind any of the three CDNs:** `cdn` with the provider set, `createPageCacheHandle` or `renderCachedPage`, and `sitePreview: 'signed-url'`.
- **No CDN, or pages that differ per visitor:** `none`.

The examples demonstrate every `cdn` provider with the same code: `examples/sveltekit-shadcn`, `examples/sveltekit-tailwind` and `examples/react-ssr` (their READMEs, and `pnpm run verify:cache` in each). `examples/nextjs-shadcn` and `examples/nextjs-mui` set the shared cache handler when `KRANTHO_CACHE_SHARED=database` is set. Every variable is listed in [configuration.md](../configuration.md#page-cache).
