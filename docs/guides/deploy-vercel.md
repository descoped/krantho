# Deploying to Vercel

`krantho-site`, the Next.js app behind krantho.com, runs on Vercel Functions. GitHub Actions builds it with the Vercel CLI and uploads the prebuilt output; the Vercel project has no Git connection and never builds anything itself. How the production project, its database and its secrets are provisioned is the operator's, outside this repository.

```
release vX.Y.Z ──────► .github/workflows/deploy-site.yml
                          vercel pull   (project settings)
                          vercel build  (krantho-site/vercel.json: workspace install + build)
                          vercel deploy --prebuilt
                                              │
krantho.com ──► Vercel Functions (Next.js) ──► Postgres (pooled)
www.krantho.com ── 301 ──► krantho.com
```

One Vercel project serves the whole app:

| Path | Served by |
|------|-----------|
| `/`, `/about`, … | One ISR route, `app/[[...slug]]/page.tsx`, reading the published version of each page through `createContentLoader({ config, collections })`; each page is cached until Studio changes it |
| `/api/*` | The krantho handler (`app/api/[...path]/route.ts`) |
| `/studio/*` | The Studio SPA (`app/studio/[[...slug]]/route.ts`), read from `@krantho/studio/dist` |
| `/robots.txt`, `/sitemap.xml` | Rewrites to `/api/seo/robots.txt` and `/api/seo/sitemap` |

A function has a read-only filesystem and no memory shared between instances, so production runs on **Postgres**. SQLite stays the local default.

## Page cache

`krantho.config.ts` sets `cache: { pages: 'next-isr' }` (see [server-next.md](../server-next.md#cached-pages)). The build renders no page and never reads the database; `next build` lists the page route as `●` with no paths.

- **First visit** to a page renders it in a function, and Vercel stores the result. Every later visit is served from Vercel's CDN (`x-vercel-cache: HIT`) with no function invocation and no database read.
- **Publishing** in Studio invalidates the page's cache tags in the API function; Vercel propagates the invalidation to every region. The API route then requests the page once, so the editor's next reload shows the change already rendered. A change to a global (navigation) or a collection list marks the pages showing it stale: each is served once more and re-rendered in the background.
- **A deploy** starts with an empty page cache. The workflow's last step fetches `/sitemap.xml` from the production domain and requests every URL in it once, so no visitor waits for a first render. Preview deployments sit behind deployment protection and are not warmed.

Visits are served from the CDN, a publish costs one render per changed page, and a deploy one render per page. An unchanged re-render writes nothing to the ISR store.

This is the Next.js on Vercel topology. Next.js behind CloudFront or Cloud CDN, and SvelteKit or Express behind any of the three CDNs, are in [page-caching.md](page-caching.md).

## The build

The project's **Root Directory** is `krantho-site`, and the workflow runs the Vercel CLI from the repository root. The prebuilt functions reference files in the workspace `node_modules` at the root, so the upload must start there:

- **`krantho-site/vercel.json`** sets the framework to Next.js and installs and builds from the workspace root, since the site links the workspace packages:

  ```json
  {
    "framework": "nextjs",
    "installCommand": "cd .. && pnpm install --frozen-lockfile",
    "buildCommand": "cd .. && pnpm --filter 'krantho-site...' run build"
  }
  ```

- **`krantho-site/next.config.ts`** traces from the workspace root (`outputFileTracingRoot`) and adds the files tracing cannot infer: `content/**` for every route (whichever a fresh database serves first imports it), `packages/studio/dist/**` for the Studio route, and libvips (`@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*`) for the API route, which sharp's native binding loads by its library path, out of tracing's sight (`outputFileTracingIncludes`).
- **`app/api/[...path]/route.ts`** exports `maxDuration = 60`, headroom for first-boot migrations and the content import.

To reproduce the build locally without deploying:

```bash
vercel pull --yes --environment=production
vercel build --prod
```

## GitHub Actions

`.github/workflows/deploy-site.yml` deploys krantho.com to production when a release is published, and a pre-release to preview. Run by hand, it deploys a preview of any ref, or production from a ref whose versioned files carry the latest release's version: a site-only release, for content and site changes between package releases. It reads the Vercel token and the project's identifiers from repository secrets, so none of them appears in a log.

The workflow writes nothing about the deployment itself — its URL, the Vercel account or how to roll it back — to the job summary, the logs or the release notes: those are public. Rolling back is the operator's.

Previews get a `*.vercel.app` URL behind Vercel's standard deployment protection, and cannot complete Sign in with Vercel: the app redirects only to the production callback.

## Runtime environment

The production environment is set on the Vercel project by the operator. A krantho site on Vercel needs, besides its credentials:

| Variable | Value |
|----------|-------|
| `KRANTHO_PERSISTENCE_PROVIDER` | `postgres` |
| `KRANTHO_PERSISTENCE_POSTGRES_PREPARE` | `false` when the connection goes through a pooler that does not support prepared statements |
| `KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS` | Small (`2`): every function instance opens its own pool |
| `KRANTHO_AUTH_SESSION_SECURE` | `always` |
| `KRANTHO_CONTENT_CACHE_ENABLED` | `false` — functions share no memory, so the API reads the database on every request; pages are cached by Vercel instead |

The canonical site URL comes from `site.baseUrl` in `krantho.config.ts`. Pages read content and SEO in-process, so no variable points them at the site's own API.

The schema migrations run whenever an instance first opens the database: the API handler, the pages' content loader (`createContentLoader`) and, with `cache.shared: 'database'`, the shared cache handler (`openPageCacheStore`) each open it, whichever a request reaches first. Instances that cold-start together serialize on a Postgres advisory lock, so each migration is applied once.

## Media

A function's filesystem is read-only and not shared between instances, so the `local` media store does not work on Vercel: uploads need an object store. Any of the remote stores works (see [media.md](media.md)); Vercel Blob keeps everything in one Vercel account.

1. Create a **public** Blob store, in the same region as the functions. krantho writes public objects only.
2. Add `@krantho/media-vercel-blob` to the app's dependencies.
3. Set the environment:

| Variable | Value |
|----------|-------|
| `KRANTHO_MEDIA_PROVIDER` | `vercel-blob` |
| `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` | The store's read-write token (secret) |
| `KRANTHO_MEDIA_MAX_SIZE` | `4194304` (4 MiB) |

krantho passes the token explicitly on every call, so the store does not need `BLOB_READ_WRITE_TOKEN` or a project connection.

**Cap uploads below 4.5 MB.** Uploads go through the API function, and Vercel rejects a request body over 4.5 MB with `413 FUNCTION_PAYLOAD_TOO_LARGE` before krantho sees it. The default `media.maxFileSize` is 10 MiB, so lower it to 4 MiB; Studio then reports an oversized file itself, and a 413 from the platform shows as `File too large for this host`. The same 4.5 MB limit applies to responses, so a very large `preset=full` variant can hit it.

**Images and the CDN.** Pages embed `/api/media/<id>/image?preset=…`. That URL answers an uncached 302 to a versioned URL, which is served with `s-maxage`, so the Vercel CDN caches each variant (`x-vercel-cache: HIT` from the second request on). A replace changes the versioned URL, and the next page view shows the new image with no purge. Every image view still invokes a function for the redirect.

**Free plan.** Blob is included on Hobby within fixed monthly allowances (storage, operations and data transfer). Uploads, replaces and duplicates count as advanced operations; deletes are free. A Hobby account is never billed -- Blob is blocked for 30 days when an allowance is exceeded.

**Preview deployments** read the same environment as production when both targets share the variables, so a preview writes to the same Blob store and the same database.

## Who can sign in

Two gates decide who reaches Studio:

1. **Vercel.** The Sign in with Vercel app's **Sign-In Access** set to **Members of the team** makes Vercel refuse anyone outside the team with `access_denied`.
2. **krantho.** Emails in `KRANTHO_ADMIN_EMAILS` create their account on first sign-in and become administrators.

With `KRANTHO_AUTH_OIDC_STUDIO_ENTRY=redirect` and `createStudioRouteHandler({ config })` in `app/studio/[[...slug]]/route.ts`, visiting `/studio` without a session goes to Vercel: someone signed in to Vercel who has approved the app comes straight back into Studio, and anyone either gate refuses gets a 404. A visitor not signed in to Vercel sees Vercel's login page first, since Vercel offers no silent sign-in check.

Vercel checks team membership when a user signs in. Removing someone from the team does not end a krantho session they already hold; it ends when the session expires.

## Content from the repository

Collections in `krantho-site` are filesystem-mastered. The build writes `content/manifest.json`, and each deployment's first request that opens the database imports new and changed files, deletes the documents of removed ones, and keeps what editors changed in Studio ([server.md](../server.md)). On Postgres the database persists across deployments, so editors' changes outlive a deploy.

A collection whose directory is missing from the function bundle is logged at import time (`[import] Skipping <collection>: directory not found: …`).

## SEO enrichment

AI enrichment (`POST /api/seo/enrich`) runs as a background job after the response is sent. The job is handed to the platform's `waitUntil`, which `@krantho/server-next` wires to Next.js `after()`, so the instance keeps running it after the response. The job status is held in memory on the instance that runs the job, so a status poll that lands on another instance answers 404 even while the job runs.
