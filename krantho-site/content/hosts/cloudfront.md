---
title: Amazon CloudFront
description: Put Amazon CloudFront in front of a krantho site. Each page stays at the edge until a content change purges it, by cache tag for SvelteKit and Express and by path for Next.js.
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
order: 1
docs-page: deploy-cdn
status: published
---

CloudFront sits in front of the server that runs your site: a Node server for SvelteKit or Express, or `next start` for Next.js, in a container or on a VM. Krantho sets the cache headers on every page and purges CloudFront when content changes. The application code is the same as for any other CDN; the environment names the provider.

## Set up

- **Origin.** Run the site as a Node server. One server can keep SQLite on a persistent disk; several need Postgres.
- **Cache policy.** Honor the origin's cache headers, with a Minimum TTL of 0 so a `private` or `no-store` response is never stored, and a Maximum TTL of at least the page's `s-maxage`.
- **Cache tag header.** Set the distribution's cache tag header to the same name as `KRANTHO_CACHE_CDN_TAG_HEADER` (`x-krantho-cache-tag` by default).
- **Purge client.** Add `@aws-sdk/client-cloudfront` to the app. It is loaded only when a purge runs.
- **Credentials.** The AWS SDK's default chain (an instance or task role, for example), allowed `cloudfront:CreateInvalidation`.

## Configure

```bash
# SvelteKit and Express: CloudFront keeps each page, purged by tag
KRANTHO_CACHE_PAGES=cdn
KRANTHO_CACHE_CDN_PROVIDER=cloudfront
KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID=E2EXAMPLE

# Next.js: Next keeps each page, CloudFront caches in front and is purged by path
KRANTHO_CACHE_PAGES=next-isr
KRANTHO_CACHE_CDN_PROVIDER=cloudfront
KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID=E2EXAMPLE

# Optional, for every framework
KRANTHO_CACHE_CDN_S_MAX_AGE_SEC=86400                 # one day, the default
KRANTHO_CACHE_CDN_STALE_WHILE_REVALIDATE_SEC=604800   # one week, the default
```

## Cache

**SvelteKit and Express.** A published page answers with `Cache-Control: public, max-age=0, s-maxage=…, stale-while-revalidate=…`, and its tags in `x-krantho-cache-tag`. CloudFront reads lifetimes only from `Cache-Control`, so the CDN lifetime sits there; browsers ignore `s-maxage` and never keep the page, so a purge reaches every visitor. A publish, an unpublish, a delete, a global or an SEO change sends `CreateInvalidation` with a `#<tag>` item for each tag it touched — one request per invalidation mode, so publishing a page sends two (its document tag and its collection tag) and a global sends one. A save purges nothing.

**Next.js.** CloudFront caches each page as Next's own `Cache-Control` says, in front of Next's page cache. Every live change refreshes Next's cache and purges `/*`: a published document also shows on list pages whose paths krantho cannot know. The CDN's origin is Next's warm cache, so a full purge costs cheap origin hits, not renders.

A purge never fails a write. A failed request is retried once, then logged, and a lost purge is bounded by `s-maxage`. Deploys that change content files or rendering are not purged reliably, so invalidate everything as a deploy step:

```bash
aws cloudfront create-invalidation --distribution-id E2EXAMPLE --paths '/*'
```

## Verify

- **At the origin.** `curl -sI` a page on the server itself. A published page carries `s-maxage` in `Cache-Control` and its tags in `x-krantho-cache-tag`; a signed preview link answers `private, no-store`.
- **At the edge.** Request the page through CloudFront twice. The second response carries CloudFront's `X-Cache: Hit from cloudfront`.
- **A publish.** Publish a change in Studio. An invalidation appears in the distribution's invalidation list, and the next request shows the change.
- **What krantho's tests cover.** They check the headers krantho sends and the exact invalidation requests, against a mocked CloudFront client — not a live distribution. Confirm the behavior on a staging distribution before you rely on it.
- **Limits.** A page carries at most 50 tags. Each invalidation item counts toward CloudFront's limits on invalidations in progress and toward its invalidation pricing.
