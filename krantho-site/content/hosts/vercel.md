---
title: Vercel
description: Run a krantho site on Vercel Functions, with pages served from Vercel's CDN until a change invalidates them, content in Postgres and uploads in an object store.
kind: platform
cache-strategy: next-isr
frameworks:
  - Next.js
  - SvelteKit
databases:
  - Postgres
media-stores:
  - Vercel Blob
  - S3-compatible
  - Google Cloud Storage
order: 4
docs-page: deploy-vercel
status: published
---

Vercel runs a krantho site as functions. A function has a read-only filesystem and shares no memory with other instances, so three things differ from a single server: content lives in Postgres, uploads go to an object store, and every instance signs sessions with one shared secret. SQLite stays the default for local development.

## Set up

- **Database.** Create a Postgres database in or near the functions' region, and add `@krantho/persistence-postgres` and `postgres` to the app. Schema migrations run on the first request that opens the database; instances that cold-start together wait on a Postgres advisory lock, so each migration runs once.
- **Media.** Create a public Vercel Blob store and add `@krantho/media-vercel-blob`. An S3-compatible bucket or Google Cloud Storage works too.
- **Next.js.** In `next.config.ts`, add the content files and the Studio build to `outputFileTracingIncludes`, since krantho reads them at runtime where Next's file tracing cannot see them. Give the API route `maxDuration = 60` for the first boot.
- **SvelteKit.** Build with `@sveltejs/adapter-vercel`, add `@vercel/functions`, and pass its `waitUntil` to `createApiHandlers` so purges finish after the response.

Krantho is not on npm yet, so a deployment today builds from a checkout of the repository. [Project status](/docs/project-status) has the details.

## Configure

Set these in the project's environment variables. Secrets stay there, never in `krantho.config.ts`.

```bash
# Every framework
KRANTHO_PERSISTENCE_PROVIDER=postgres
KRANTHO_PERSISTENCE_POSTGRES_URL=postgres://user:password@host/db   # secret
KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS=2      # each instance opens its own pool
KRANTHO_PERSISTENCE_POSTGRES_PREPARE=false          # behind a transaction pooler
KRANTHO_MEDIA_PROVIDER=vercel-blob
KRANTHO_MEDIA_VERCEL_BLOB_TOKEN=...                 # secret
KRANTHO_MEDIA_MAX_SIZE=4194304                      # below Vercel's 4.5 MB body limit
KRANTHO_JWT_SECRET=...                              # secret, one value for every instance

# Next.js
KRANTHO_CACHE_PAGES=next-isr
KRANTHO_CONTENT_CACHE_ENABLED=false

# SvelteKit
KRANTHO_CACHE_PAGES=cdn
KRANTHO_CACHE_CDN_PROVIDER=vercel
```

## Cache

**Next.js.** The first visit to a page renders it in a function, and Vercel stores the result. Later visits are served from Vercel's CDN, with no function invocation and no database read. A publish in Studio invalidates the page's cache tags, Vercel carries the invalidation to every region, and the API route requests the page once so the editor's next reload finds it rendered. A change to a global or a collection list marks the pages that show it stale: each is served once more and re-rendered in the background. No CDN purge is needed, and Vercel already shares the cache between instances.

**SvelteKit.** Each page answers with `Vercel-CDN-Cache-Control` and `Vercel-Cache-Tag`, naming everything it read. A live change purges those tags through `@vercel/functions`. Purges run only inside a Vercel function.

A new deployment starts with an empty cache. Request every page once after each production deploy, so no visitor waits for a first render:

```bash
# Warm the page cache from the sitemap
SITE_URL=https://example.com
curl -fsS "$SITE_URL/sitemap.xml" | sed -n 's:.*<loc>\(.*\)</loc>.*:\1:p' |
  while read -r url; do curl -s -o /dev/null -w "%{http_code} $url\n" "$url"; done
```

## Verify

- **A cached page.** Request a Next.js page twice with `curl -sI`. The second response carries `x-vercel-cache: HIT`.
- **A publish.** Change a page in Studio, publish it, and reload. The page shows the change on the next request.
- **The first boot.** Function logs name any collection directory missing from the bundle (`[import] Skipping <collection>: directory not found`), and in production the server warns at startup when sign-in is on and `KRANTHO_JWT_SECRET` is unset.
- **Limits to know.** Uploads pass through the API function, so Vercel's 4.5 MB request limit applies. Preview deployments read their own environment: give Preview its own database and store when production data matters.
