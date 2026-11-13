# SvelteKit + shadcn-svelte Example

Demonstrates the **shadcn-svelte component pattern** with SvelteKit 2 and Svelte 5.

This example matches `../sveltekit-tailwind/` in functionality but wraps UI elements in composable, shadcn-style wrapper components (`Card`, `ServiceCard`) instead of using raw Tailwind utility classes directly in route templates.

## Pattern

The shadcn-svelte approach uses plain Svelte 5 components with Tailwind classes — no runtime UI library needed:

- `src/lib/components/ui/card.svelte` — Generic card primitive (border, rounded, shadow)
- `src/lib/components/ServiceCard.svelte` — Composed card for service items

Components use Svelte 5 syntax exclusively: `$props()`, `$derived()`, `{@render}`, `Snippet`.

## Running

From the repository root, build the packages once (`pnpm run build`), then:

```bash
cd examples/sveltekit-shadcn
pnpm dev
```

The dev script loads the repository root `.env` when it exists. The site's `baseUrl` in `krantho.config.ts` is `http://localhost:4004`.

Collections read the shared `../content/` directory; it is imported into SQLite on startup.

## Production server

The example builds with `@sveltejs/adapter-node`: a plain Node server that runs in any container or VM. On Vercel, which runs functions rather than a Node server, `vite.config.ts` passes `@sveltejs/adapter-vercel` to SvelteKit instead — Vercel sets `VERCEL` during its build — so the code is the same on every host.

```bash
pnpm run build
PORT=4004 node build
```

Set `KRANTHO_SITE_BASE_URL` to the public URL of the deployment; the sitemap, robots.txt and canonical links use it. `/sitemap.xml` and `/robots.txt` are answered by the krantho API (`/api/seo/sitemap`, `/api/seo/robots.txt`) with `Cache-Control: no-cache`.

## Page caching

The code is the same for every deployment; the environment chooses the topology. `krantho.config.ts` keeps `cache.pages` at its default, `none`: every request renders the page, from reads the content loader keeps for `content.cache.ttlMs` (5 minutes by default).

`src/hooks.server.ts` serves pages through `createPageCacheHandle`. With `KRANTHO_CACHE_PAGES=cdn` every published page answers with `max-age=0` for the browser, a CDN lifetime (`s-maxage`, `stale-while-revalidate`), and a tag header naming every document it read (`k:d:pages:about`, the globals in the layout, its SEO settings). Publishing a document purges its tags at the CDN, so the page is fresh on the next request. A response that sets a cookie, is not a `200` or `404`, or says `private`, `no-store` or `no-cache` itself is never cached. Keep the handle outermost — first in `sequence()` — if you add hooks.

Pick the CDN in front of the server with `KRANTHO_CACHE_CDN_PROVIDER`. Each provider needs its own settings:

| | Amazon CloudFront | Google Cloud CDN | Vercel |
|---|---|---|---|
| `KRANTHO_CACHE_CDN_PROVIDER` | `cloudfront` | `gcp` | `vercel` |
| Required settings | `KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID` | `KRANTHO_CACHE_CDN_GCP_PROJECT`, `KRANTHO_CACHE_CDN_GCP_URL_MAP` | — |
| Headers on a page | `Cache-Control: public, max-age=0, s-maxage=…, stale-while-revalidate=…` (CloudFront reads lifetimes only from `Cache-Control`), tags in `x-krantho-cache-tag` (`KRANTHO_CACHE_CDN_TAG_HEADER`) | `CDN-Cache-Control`, `Cache-Tag` | `Vercel-CDN-Cache-Control`, `Vercel-Cache-Tag` |
| Purge | `CreateInvalidation` with `#tag` items | `invalidateCache` on the URL map | `invalidateByTag` / `dangerouslyDeleteByTag` |
| Install in the app | `@aws-sdk/client-cloudfront` | nothing | `@vercel/functions` |
| From the host | a cache policy that honours origin cache headers with Minimum TTL 0 (so a `private` or `no-store` response is never stored) and a Maximum TTL of at least `s-maxage`; the distribution's cache tag header set to the tag header name; AWS credentials from the SDK's default chain, allowed `cloudfront:CreateInvalidation` | a backend service with Cloud CDN behind the URL map; a token from the metadata server (a service account allowed `compute.urlMaps.invalidateCache`) or `KRANTHO_CACHE_CDN_GCP_ACCESS_TOKEN` | the site deployed on Vercel, where it builds with `@sveltejs/adapter-vercel` on its own; purges run only inside a Vercel function |

```bash
# Amazon CloudFront
KRANTHO_CACHE_PAGES=cdn KRANTHO_CACHE_CDN_PROVIDER=cloudfront \
  KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID=E2EXAMPLE node build

# Google Cloud CDN
KRANTHO_CACHE_PAGES=cdn KRANTHO_CACHE_CDN_PROVIDER=gcp \
  KRANTHO_CACHE_CDN_GCP_PROJECT=my-project KRANTHO_CACHE_CDN_GCP_URL_MAP=my-url-map node build

# Vercel — in the project's environment variables
KRANTHO_CACHE_PAGES=cdn
KRANTHO_CACHE_CDN_PROVIDER=vercel
```

`KRANTHO_CACHE_CDN_S_MAX_AGE_SEC` (default one day) bounds how long a page stays cached if a purge is lost; `KRANTHO_CACHE_CDN_STALE_WHILE_REVALIDATE_SEC` how long a stale page may be served while it is refreshed. `/sitemap.xml` and `/robots.txt` read no tagged content, so no purge would reach them: they answer `no-cache` and the CDN never keeps them. A page's tags are capped at 50, the strictest common limit; Cloud CDN also caps the tag header at 4 KiB per response. `docs/configuration.md` lists every variable.

## Previewing drafts

The API route sets `sitePreview: 'signed-url'`. An editor's `GET /api/preview?collection=pages&slug=about` redirects to `/about?krantho-preview=<token>`: a link valid for ten minutes, for that page only, that renders the current draft with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`, never cached at the CDN. Lists on a preview page still show published documents.

The token is signed with `KRANTHO_JWT_SECRET`. Set it on every deployment that previews: without it the API signs with an ephemeral secret that the page cannot verify, and a preview link renders the published page.

## Verifying the topologies

```bash
pnpm run build
pnpm run verify:cache
```

`scripts/verify-cache.mjs` starts `node build` on a fresh SQLite data directory for the default configuration and for each provider, and checks the headers on `/about`, that `/sitemap.xml` comes from the API, that a signed preview link renders a draft with `no-store`, and — behind a CDN — that a publish through the API shows on `/about`, tagged with the page's document and JSON-LD reads. It never calls a CDN: the Cloud CDN API is stubbed in-process, and without their SDKs installed the CloudFront and Vercel purges fail and are logged.

## Structure

```
src/
  lib/
    cms.ts                          # Content engine over the SQLite database from krantho.config.ts
    seo.ts                          # Generated SEO files (structured data, llms.txt)
    components/
      ui/card.svelte                # shadcn-style card primitive
      ServiceCard.svelte            # Composed service card
      cms/                          # CMSText, CMSMarkdown, CMSSection
  hooks.server.ts                   # Page cache and signed preview for every page
  routes/
    +layout.server.ts               # Loads the navigation, footer and contact-info globals
    +layout.svelte                  # Header, nav, footer
    +page.server.ts / +page.svelte  # Home
    about/                          # About page
    services/                       # Services page
    api/ admin/                     # krantho API and Studio routes
    sitemap.xml/ robots.txt/        # Answered by the krantho API
scripts/
  verify-cache.mjs                  # Checks every page cache topology against the built server
```
