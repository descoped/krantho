# Hosting a krantho site

## Contents

- A single server with SQLite
- Postgres
- Content from the repository
- Media stores
- Vercel with Next.js
- Vercel with SvelteKit
- A CDN in front of your own server
- Several Next.js instances without Vercel

Pick the row that matches the target, then apply its section. Settings are environment
variables unless noted; every one is listed at https://krantho.com/docs/configuration.

| Target | Database | Media | Page cache |
|---|---|---|---|
| One server or container with a persistent disk | SQLite (default) | `local` | `none`, or `cdn` behind CloudFront / Cloud CDN; Next.js: `next-isr` |
| Several instances (containers, VMs) | Postgres | `s3`, `gcs` or `vercel-blob` | Next.js: `next-isr` + `cache.shared: 'database'`; others: `cdn` |
| Vercel, Next.js | Postgres | `vercel-blob` (or `s3`, `gcs`) | `next-isr` |
| Vercel, SvelteKit | Postgres | `vercel-blob` | `cdn` with provider `vercel` |

Always, for anything that serves real traffic:

- `KRANTHO_SITE_BASE_URL` — the public URL; canonical links, the sitemap and robots.txt use it.
- `KRANTHO_JWT_SECRET` — one random value shared by every instance. Without it each process
  signs with its own ephemeral secret: sessions break across instances and restarts, and a
  signed preview link fails on any instance but the one that signed it.
- Sign-in: `KRANTHO_AUTH=token` with `KRANTHO_API_TOKEN`, or `KRANTHO_AUTH=oidc` with the
  `OIDC_*` variables and `KRANTHO_ADMIN_EMAILS`. The default `none` leaves `/studio` open.

## A single server with SQLite

- The database is `.krantho/content.db` under the working directory (`KRANTHO_PATHS_DATA_DIR`,
  `KRANTHO_PERSISTENCE_SQLITE_PATH`). Put it on a persistent volume and back it up.
- `media: { provider: 'local' }` writes to `media.local.dir` on the same volume.
- Run one process. SQLite runs in WAL mode and handles concurrent reads on one machine; it is not
  shared between machines.

## Postgres

```bash
pnpm add @krantho/persistence-postgres postgres
```

| Variable | Value |
|---|---|
| `KRANTHO_PERSISTENCE_PROVIDER` | `postgres` |
| `KRANTHO_PERSISTENCE_POSTGRES_URL` | connection string (secret) |
| `KRANTHO_PERSISTENCE_POSTGRES_PREPARE` | `false` behind a transaction pooler (PgBouncer, a pooled Neon URL) |
| `KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS` | small on serverless, such as `2` (every instance opens its own pool) |
| `KRANTHO_PERSISTENCE_POSTGRES_IDLE_TIMEOUT_SEC` | such as `20` on serverless |

Migrations run when an instance first opens the database; instances that start together wait on
a Postgres advisory lock, so each migration is applied once.

## Content from the repository

- Collections with a `directory` import their markdown files when a site opens an **empty**
  database — on the first request, API or page.
- Later changes to the files are **not** re-imported: after the first deploy the database is the
  source of truth and editors work in Studio.
- To ship file changes to an existing database, write a content manifest with a higher version:
  `generateManifest(defineConfig({ collections }), <version>)` from `@krantho/server` (with
  `defineConfig` from `@krantho/schema`) writes `content/manifest.json`. On the next start krantho
  takes a checkpoint, imports new files, updates changed files whose database copy is still
  unedited, and records a conflict — keeping the database copy — where an editor changed it.
- Serverless bundles must include the content files (see Vercel below).

## Media stores

| Provider | Package | Required settings |
|---|---|---|
| `local` | `@krantho/media-local` | `KRANTHO_MEDIA_LOCAL_DIR` (default `public/uploads`) |
| `vercel-blob` | `@krantho/media-vercel-blob` | `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN`; a public Blob store |
| `s3` | `@krantho/media-s3` | `KRANTHO_MEDIA_S3_BUCKET`, `KRANTHO_MEDIA_S3_REGION`; `KRANTHO_MEDIA_S3_ENDPOINT` + `KRANTHO_MEDIA_S3_PUBLIC_URL` for R2 or MinIO; keys or the AWS default chain |
| `gcs` | `@krantho/media-gcs` | `KRANTHO_MEDIA_GCS_BUCKET`; `KRANTHO_MEDIA_GCS_CREDENTIALS` or the metadata server |

Uploads pass through the API; on Vercel cap them below the 4.5 MB request limit
(`KRANTHO_MEDIA_MAX_SIZE=4194304`).

## Vercel with Next.js

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@krantho/server', '@krantho/server-next'],
  // Files krantho reads at runtime, invisible to Next's file tracing
  outputFileTracingIncludes: {
    '/**': ['./content/**/*'],
    '/studio/**': ['./node_modules/@krantho/studio/dist/**/*'],
  },
  async rewrites() {
    return [
      { source: '/robots.txt', destination: '/api/seo/robots.txt' },
      { source: '/sitemap.xml', destination: '/api/seo/sitemap' },
    ]
  },
}

export default nextConfig
```

- In a pnpm workspace (running from source), set the Vercel project's Root Directory to the app,
  add `outputFileTracingRoot` pointing at the workspace root, and trace Studio from
  `../packages/studio/dist/**/*`.
- `export const maxDuration = 60` in the API route: headroom for the first boot.
- `cache: { pages: 'next-isr' }` with the ISR route shape. Vercel keeps the rendered pages at
  its CDN; a publish invalidates them in every region. Leave `KRANTHO_CACHE_CDN_PROVIDER` unset
  and `cache.shared` at `none`.
- `KRANTHO_CONTENT_CACHE_ENABLED=false`: each function instance would otherwise keep its own
  API read cache.
- A deploy starts with an empty page cache: request each URL in the sitemap once afterwards.
- Preview deployments read their own environment; give Preview its own database and Blob store
  if it must not write to production.

## Vercel with SvelteKit

- `@sveltejs/adapter-vercel` (the example's `svelte.config.js` picks it when `VERCEL` is set).
- `KRANTHO_CACHE_PAGES=cdn`, `KRANTHO_CACHE_CDN_PROVIDER=vercel`, and `@vercel/functions` in
  the app; pass its `waitUntil` to `createApiHandlers` so purges finish.

## A CDN in front of your own server

For SvelteKit and Express, `KRANTHO_CACHE_PAGES=cdn` plus the provider:

| | CloudFront | Cloud CDN | Vercel |
|---|---|---|---|
| `KRANTHO_CACHE_CDN_PROVIDER` | `cloudfront` | `gcp` | `vercel` |
| Required | `KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID` | `KRANTHO_CACHE_CDN_GCP_PROJECT`, `KRANTHO_CACHE_CDN_GCP_URL_MAP` | — |
| Add to the app | `@aws-sdk/client-cloudfront` | nothing | `@vercel/functions` |
| From the host | a cache policy that honors origin headers (minimum TTL 0), cache tag header = `KRANTHO_CACHE_CDN_TAG_HEADER`, `cloudfront:CreateInvalidation` | a backend service with Cloud CDN; `compute.urlMaps.invalidateCache` | deploy on Vercel |

`KRANTHO_CACHE_CDN_S_MAX_AGE_SEC` (default one day) bounds how long a page stays cached if a
purge is lost. Files a deploy ships are imported without a purge when a page opens the database
first, so purge the CDN as part of the deploy.

A self-hosted Next.js app keeps `next-isr` and names CloudFront or Cloud CDN in
`KRANTHO_CACHE_CDN_PROVIDER`; krantho then purges every path on a change.

## Several Next.js instances without Vercel

`KRANTHO_CACHE_SHARED=database` and the `cacheHandler` from `@krantho/server-next/cache-handler`
in `next.config.ts` (see `next.md`), so every instance shares the page cache and sees every
invalidation. The handler reads the database settings from the environment only.
