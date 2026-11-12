---
title: Deploy behind a CDN
description: Cache krantho pages at Amazon CloudFront, Google Cloud CDN or Vercel, purged when their content changes, with the same application code for every provider.
area: deploy
order: 20
level: advanced
stacks: [next, sveltekit, express]
prerequisites: [rendering-modes]
next: [configuration]
related: [deploy-vercel, media, studio, package-server, package-core]
status: published
---

A krantho site can have the CDN in front of it keep every page until a content change purges it. The application code is the same for every CDN: the environment picks the provider at deploy time, and no provider is preferred.

## Topologies

| Framework | `KRANTHO_CACHE_PAGES` | Who caches pages | How a change reaches them |
|---|---|---|---|
| SvelteKit, Express | `cdn` | the CDN, by the page's CDN headers | a CDN purge by cache tag |
| Next.js behind CloudFront or Cloud CDN | `next-isr` | the CDN, by Next's own `Cache-Control`, in front of Next's page cache | Next's invalidation, then a CDN purge of `/*` |
| Next.js on Vercel | `next-isr` (CDN provider unset or `vercel`) | Vercel's CDN | Next's invalidation; no separate purge (see [Deploy to Vercel](/docs/deploy-vercel#page-cache)) |

With the default `KRANTHO_CACHE_PAGES=none` nothing is cached at the CDN and nothing is purged, whatever `KRANTHO_CACHE_CDN_PROVIDER` says. `cdn` requires a provider; the configuration fails at startup without one.

Several Next.js instances behind one CDN share Next's cache through the site's database with `KRANTHO_CACHE_SHARED=database` (see [Rendering modes](/docs/rendering-modes#several-instances)); the CDN purge is unchanged.

SvelteKit serves pages through `createPageCacheHandle` in `src/hooks.server.ts`, and Express through `renderCachedPage` (see [Rendering modes](/docs/rendering-modes#cached-at-a-cdn)). The example sites `sveltekit-shadcn`, `sveltekit-tailwind` and `react-ssr` are wired this way, and `pnpm run verify:cache` in each checks every provider's headers against the built server.

## The providers

| | Amazon CloudFront | Google Cloud CDN | Vercel |
|---|---|---|---|
| `KRANTHO_CACHE_CDN_PROVIDER` | `cloudfront` | `gcp` | `vercel` |
| Required settings | `KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID` | `KRANTHO_CACHE_CDN_GCP_PROJECT`, `KRANTHO_CACHE_CDN_GCP_URL_MAP` | none |
| Optional settings | `KRANTHO_CACHE_CDN_TAG_HEADER` (default `x-krantho-cache-tag`) | `KRANTHO_CACHE_CDN_GCP_ACCESS_TOKEN` (secret) | none |
| Headers on a page | `Cache-Control: public, max-age=0, s-maxage=…, stale-while-revalidate=…`, tags in the tag header | `CDN-Cache-Control`, `Cache-Tag` | `Vercel-CDN-Cache-Control`, `Vercel-Cache-Tag` |
| Tag purge | `CreateInvalidation` with a `#<tag>` item per tag | `invalidateCache` on the URL map, up to 10 tags per request | `invalidateByTag` or `dangerouslyDeleteByTag` |
| Path purge (Next.js) | `CreateInvalidation` with `/*` | `invalidateCache` with `path: '/*'` | not needed |
| Install in the app | `@aws-sdk/client-cloudfront` | nothing | `@vercel/functions` |
| Credentials | the AWS SDK's default chain, allowed `cloudfront:CreateInvalidation` | a metadata-server token for the runtime's service account (allowed `compute.urlMaps.invalidateCache`), or the configured access token | none: purges run inside a Vercel function |
| From the host | a cache policy that honors origin cache headers with Minimum TTL 0 (so a `private` or `no-store` response is never stored) and a Maximum TTL of at least `s-maxage`; the distribution's cache tag header set to the same name as `KRANTHO_CACHE_CDN_TAG_HEADER` | a backend service with Cloud CDN enabled behind the URL map, in a cache mode that honors origin headers | the site deployed on Vercel |

```bash title=".env"
# Amazon CloudFront
KRANTHO_CACHE_PAGES=cdn
KRANTHO_CACHE_CDN_PROVIDER=cloudfront
KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID=E2EXAMPLE

# Google Cloud CDN
KRANTHO_CACHE_PAGES=cdn
KRANTHO_CACHE_CDN_PROVIDER=gcp
KRANTHO_CACHE_CDN_GCP_PROJECT=my-project
KRANTHO_CACHE_CDN_GCP_URL_MAP=my-url-map

# Vercel
KRANTHO_CACHE_PAGES=cdn
KRANTHO_CACHE_CDN_PROVIDER=vercel
```

Two settings apply to every provider. `KRANTHO_CACHE_CDN_S_MAX_AGE_SEC` (default `86400`, one day) is how long the CDN keeps a page that no purge reaches first. `KRANTHO_CACHE_CDN_STALE_WHILE_REVALIDATE_SEC` (default `604800`, one week) is how long after that it may serve the page while it fetches a fresh one.

The purge clients are optional dependencies, loaded when a purge runs. Until the app installs the one its provider needs, every purge fails and is logged; pages are still cached and expire after `s-maxage`.

A change to a single document deletes its page at the CDN; a change to a list, a global or the whole site marks pages stale. Vercel honors both. CloudFront and Cloud CDN only delete, so both delete there.

Every cached page answers with `max-age=0`, so the browser never keeps it and a purge reaches every visitor. Vercel and Cloud CDN read the CDN lifetime from their own header, beside `Cache-Control: public, max-age=0, must-revalidate`. CloudFront reads lifetimes only from `Cache-Control`, so there the lifetime is `s-maxage` in `Cache-Control` itself; browsers ignore `s-maxage`, and CloudFront honors `stale-while-revalidate`.

### How the providers are verified

krantho's tests check what krantho sends: the response headers for each provider (the example sites' `verify:cache` scripts run the real servers), and the exact purge requests (a mocked CloudFront client whose input is typed by the AWS SDK, stubbed Cloud CDN and metadata-server calls, a mocked `@vercel/functions`). They do not run against a live CloudFront distribution or Cloud CDN URL map. How the CDN stores, expires and invalidates what krantho sends follows each provider's documentation.

> [!CAUTION]
> Before relying on a provider in production, confirm on a staging distribution that a page is served from the CDN cache and that a publish invalidates it.

### Provider limits

- **Tag budget.** A page carries at most 50 tags, the strictest limit across the three providers. Beyond it, a page's document tags give way to their collection's tag, then the rest is cut; the site tag is always kept. Each tag is lowercase and at most 120 bytes.
- **Cloud CDN** also caps a response's tag header at 4 KiB. The budget caps the count, not the bytes: a page near the budget with long collection and slug names can exceed it. Without a configured access token, a token is fetched from the metadata server and reused until shortly before it expires.
- **CloudFront.** The cache policy must honor origin cache headers with Minimum TTL 0: with a Minimum TTL above 0 CloudFront stores even `private` and `no-store` responses — previews and responses that set a cookie. A page stays cached for its `s-maxage`, capped by the policy's Maximum TTL. The client signs for `us-east-1`, where CloudFront's global API lives; the China partition is not supported. Each purge sends one invalidation holding all its items, not split into batches. A change purges once per invalidation mode, so publishing a document, such as a feature page, sends two invalidations, one for its document tag and one for its collection tag; a global sends one. Each item counts against CloudFront's limits on invalidations in progress and toward its invalidation pricing.
- **Vercel.** Purges work only inside a Vercel function and do nothing elsewhere, so a local server with `KRANTHO_CACHE_CDN_PROVIDER=vercel` sends the headers but purges nothing. Vercel purges by tag only; a path purge is ignored, with one logged warning. The SvelteKit examples build with Vercel's adapter when `VERCEL` is set; a local build with `VERCEL=1` needs a Node version that adapter supports (20, 22 or 24).

## Purges

- **A purge never fails a write.** A failed request is retried once, immediately, then logged. A lost purge is bounded by `KRANTHO_CACHE_CDN_S_MAX_AGE_SEC` (default one day).
- **Purges run after the response.** Next.js keeps them alive with `after()`. A SvelteKit or Express server that keeps running (`node build`, a container, a VM) completes them. On a serverless host they are fire-and-forget and may be cut off when the function ends: pass the platform's `waitUntil` in the handler options — on Vercel, `waitUntil` from `@vercel/functions` (see [SvelteKit on Vercel](/docs/deploy-vercel#sveltekit-on-vercel)).
- **What purges.** A publish, unpublish or delete of a document or a global; an SEO configuration; a site-wide change. A save purges nothing — an edit, a restore or an import into a collection — and neither does a media change unless it rewrites content references (a replace of a file that documents link to announces a site-wide change).
- **Deploys are not purged reliably.** See [Deploys](#deploys) below.

## Deploys

Content files shipped with a deploy are imported into the database when the new code first opens it — every file into an empty database, or the changed files when the deploy ships a newer content manifest (see [Content from the repository](/docs/deploy-vercel#content-from-the-repository)). That does not reliably purge the CDN. The API handler announces a site-wide change after its own startup import, and that purges the whole site (the site tag under `cdn`, `/*` under `next-isr` behind a CDN). The content loader runs the same import without announcing anything, though. In SvelteKit and Express the API handler starts lazily, on its first request, so when a page is requested first the loader imports the new files silently and nothing is purged. The same holds for Next.js pages behind CloudFront or Cloud CDN. Content files a deploy ships therefore reach CDN-cached pages only after `s-maxage`, unless the deploy purges the CDN.

Purge the whole CDN as a deploy step whenever a deploy changes content files, or changes how pages render:

| Provider | Deploy step |
|---|---|
| Amazon CloudFront | invalidate `/*` on the distribution: `aws cloudfront create-invalidation --distribution-id <id> --paths '/*'` |
| Google Cloud CDN | invalidate `/*` on the URL map: `gcloud compute url-maps invalidate-cdn-cache <url-map> --path '/*'` |
| Vercel | nothing: a new deployment starts with an empty CDN cache |

## Keep cached pages correct

- Only a `GET` or `HEAD` outside `/api` and `/studio` is cached, and only a `200` or `404`.
- A response that sets a cookie, or whose own `Cache-Control` says `private`, `no-store` or `no-cache`, is never cached. A page that depends on the visitor's cookie or credentials must say so in its `Cache-Control`.
- Read content inside the page render — a SvelteKit `load`, the Express `render` callback. A read made earlier, or streamed after the response, records no tags, and no purge would reach the page.
- `/sitemap.xml` and `/robots.txt` read no tagged content: serve them from the krantho API with `Cache-Control: no-cache`, as the examples do.

### SvelteKit

- Keep `createPageCacheHandle` the outermost handle, first in `sequence()`. An outer hook that adds a `Set-Cookie` after it bypasses the cookie check.
- `kit.paths.base` is not supported: `/base/studio` would be treated as a page.
- Don't `event.fetch` another page route from a `load`: its tags never reach the outer page, and forwarding the page's query string to it can render a draft inside a cached page. Read through the content loader instead.
- Experimental remote functions are classified by their page's path: a remote `GET` query that reads a cookie must answer `Cache-Control: private`, or it is cached as that page.

### Express

- Pass `req.originalUrl`, not `req.url`.
- Return every header the page sets from `render`, and set them from the helper's result. A cookie set on `res` inside `render` is invisible to the helper.

## Preview drafts

Next.js previews through draft mode. SvelteKit and Express preview through a signed link: pass `sitePreview: 'signed-url'` to the API handlers. Live mode and **Open on site** in Studio's editor send the editor to `/about?krantho-preview=<token>` — valid for ten minutes, for that page only. The page renders the current draft with `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`, so the CDN never keeps it and the token never leaks through a link. Lists on a preview page still show published documents.

Set `KRANTHO_JWT_SECRET` to one value on every instance of a deployment that previews. Without it each process signs and verifies with an ephemeral secret of its own: a link works when the same process renders the page, as on one development server, but a link signed by one instance renders the published page on another.
