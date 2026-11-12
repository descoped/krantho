---
title: Node.js server
description: Run a krantho site as a Node process in a container or on a VM, with SQLite on a disk or Postgres, and pages rendered per request or cached by Next.js.
kind: server
cache-strategy: none
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
order: 3
docs-page: deploy-cdn
status: published
---

Every krantho site can run as a plain Node process: `next start`, a SvelteKit build from `@sveltejs/adapter-node`, or your Express server. It runs in any container or on any VM, with no CDN required. SQLite on a disk is enough for one server; Postgres serves several.

## Set up

- **Build and start.** `next build` then `next start`; `vite build` then `node build` for SvelteKit; your own server with `NODE_ENV=production` for Express.
- **Data.** SQLite keeps everything in one file, `.krantho/content.db` by default. Put `paths.dataDir` on a persistent volume. For several instances, use Postgres.
- **Media.** The local store writes to disk and suits one server with a volume that the framework serves at `media.local.urlPrefix`. Several instances need a disk they all share, or an object store: Vercel Blob, an S3-compatible bucket or Google Cloud Storage.
- **Sign-in.** With `auth.mode` at `none`, every visitor to Studio is an admin. Turn on token or OIDC sign-in before the site serves real traffic; in production the server warns at startup when it is off.

## Configure

```bash
KRANTHO_SITE_BASE_URL=https://example.com   # used by the sitemap, robots.txt and canonical links
KRANTHO_PATHS_DATA_DIR=/data                # the SQLite file on a persistent volume
KRANTHO_JWT_SECRET=...                      # secret, one value for every instance

# Next.js: keep each page until a change invalidates it
KRANTHO_CACHE_PAGES=next-isr

# Next.js on several instances: one page cache in the site's database,
# set for the build and every start (next.config.ts sets the cache handler)
KRANTHO_CACHE_SHARED=database
```

## Cache

**SvelteKit and Express** keep the default `cache.pages: 'none'`. Every request renders the page from reads the content loader keeps for `content.cache.ttlMs` (five minutes by default), so a publish shows within that time. Set `KRANTHO_CONTENT_CACHE_ENABLED=false` to read the database on every request instead. For pages kept at the edge, put [CloudFront](/deploy/cloudfront) or [Cloud CDN](/deploy/cloud-cdn) in front.

**Next.js** with `cache.pages: 'next-isr'` renders each page on its first request and serves it from Next's cache until a change in Studio invalidates what it shows. A publish refreshes the page at once; a change to a global or a list marks the pages that show it stale, served once more while they re-render in the background. `next dev` caches nothing.

Next.js keeps that cache per instance. With several instances behind a load balancer, an invalidation reaches only the instance that took the write, so set `cache.shared: 'database'`: every instance then serves one cache from the site's own SQLite or Postgres database and sees every invalidation. The cache handler opens the database from the environment alone, and the filesystem provider has no database to share. See [Rendering modes](/docs/rendering-modes).

## Verify

- **The server is up.** `curl -s https://example.com/api/capabilities` answers with the site's capabilities, and `/studio` serves Studio.
- **A cached Next.js page.** Request a page twice with `curl -sI`. The second response carries Next's `x-nextjs-cache: HIT`.
- **A publish.** Change a page in Studio and publish it. The next request shows the change — at once with `next-isr`, within `content.cache.ttlMs` with `none`.
- **Startup warnings.** In production the server logs a warning when `auth.mode` is `none`, or when sign-in is on and `KRANTHO_JWT_SECRET` is unset.
