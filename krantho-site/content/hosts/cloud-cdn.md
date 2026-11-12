---
title: Google Cloud CDN
description: Put Google Cloud CDN in front of a krantho site. Each page stays at the edge until a content change purges it, by cache tag for SvelteKit and Express and by path for Next.js.
kind: cdn
cache-strategy: cdn
frameworks:
  - Next.js
  - SvelteKit
  - Express
databases:
  - SQLite
  - Postgres
media-stores:
  - Local disk
  - Vercel Blob
  - S3-compatible
  - Google Cloud Storage
order: 2
docs-page: deploy-cdn
status: published
---

Cloud CDN sits in front of the server that runs your site — on Cloud Run, GKE or Compute Engine, behind a load balancer and its URL map. Krantho sets the cache headers on every page and invalidates the URL map when content changes. The application code is the same as for any other CDN; the environment names the provider.

## Set up

- **Origin.** Run the site as a Node server: a SvelteKit or Express server, or `next start`. One server can keep SQLite on a persistent disk; several need Postgres.
- **Backend service.** Enable Cloud CDN on the backend service behind the URL map, in a cache mode that honors the origin's headers.
- **Credentials.** On Google Cloud, krantho takes a token for the runtime's service account from the metadata server. The account needs `compute.urlMaps.invalidateCache`. Elsewhere, set `KRANTHO_CACHE_CDN_GCP_ACCESS_TOKEN`.
- **Nothing to install.** The purge client calls the Compute Engine API with plain `fetch`.

## Configure

```bash
# SvelteKit and Express: Cloud CDN keeps each page, purged by tag
KRANTHO_CACHE_PAGES=cdn
KRANTHO_CACHE_CDN_PROVIDER=gcp
KRANTHO_CACHE_CDN_GCP_PROJECT=my-project
KRANTHO_CACHE_CDN_GCP_URL_MAP=my-url-map

# Next.js: Next keeps each page, Cloud CDN caches in front and is purged by path
KRANTHO_CACHE_PAGES=next-isr
KRANTHO_CACHE_CDN_PROVIDER=gcp
KRANTHO_CACHE_CDN_GCP_PROJECT=my-project
KRANTHO_CACHE_CDN_GCP_URL_MAP=my-url-map
```

## Cache

**SvelteKit and Express.** A published page answers with `Cache-Control: public, max-age=0, must-revalidate` for the browser, the CDN lifetime in `CDN-Cache-Control`, and its tags in `Cache-Tag`. The browser never keeps the page, so a purge reaches every visitor. A publish, an unpublish, a delete, a global or an SEO change calls `invalidateCache` on the URL map for the tags it touched, up to 10 tags per request. A save purges nothing.

**Next.js.** Cloud CDN caches each page as Next's own `Cache-Control` says, in front of Next's page cache. Every live change refreshes Next's cache and invalidates `/*`: a published document also shows on list pages whose paths krantho cannot know. The CDN's origin is Next's warm cache, so a full purge costs cheap origin hits, not renders.

A purge never fails a write. A failed request is retried once, then logged, and a lost purge is bounded by `s-maxage` (one day by default). Deploys that change content files or rendering are not purged reliably, so invalidate everything as a deploy step:

```bash
gcloud compute url-maps invalidate-cdn-cache my-url-map --path '/*'
```

## Verify

- **At the origin.** `curl -sI` a page on the server itself. A published page carries `CDN-Cache-Control` and `Cache-Tag`; a signed preview link answers `private, no-store`.
- **At the edge.** Request the page through the load balancer twice. A response served from the cache carries an `Age` header, and the load balancer's request logs record the cache hit.
- **A publish.** Publish a change in Studio. Cloud CDN lists the cache invalidation for the URL map, and the next request shows the change.
- **What krantho's tests cover.** They check the headers krantho sends and the exact invalidation requests, against stubbed Cloud CDN and metadata-server calls — not a live URL map. Confirm the behavior on a staging setup before you rely on it.
- **Limits.** A page carries at most 50 tags, and Cloud CDN caps a response's tag header at 4 KiB. The tag budget caps the count, not the bytes, so long collection and slug names can reach the byte limit first.
