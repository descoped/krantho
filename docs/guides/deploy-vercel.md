# Deploying to Vercel

`krantho-site` — a Next.js app that embeds the krantho CMS — runs on Vercel Functions. GitHub Actions builds it with the Vercel CLI and uploads the prebuilt output. The Vercel project has no Git connection and never builds anything itself. An OpenTofu module in the operator's own repository manages the Vercel project, its domains and environment, the Sign in with Vercel app and the Neon Postgres database.

```
release vX.Y.Z ──────► .github/workflows/deploy-site.yml
                          vercel pull   (project settings)
                          vercel build  (krantho-site/vercel.json: workspace install + build)
                          vercel deploy --prebuilt
                                              │
krantho.com ──► Vercel Functions (Next.js) ──► Neon Postgres (pooled)
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

This keeps krantho.com within the free (Hobby) plan's allowances: visits are served from the CDN, a publish costs one render per changed page, and a deploy one render per page. An unchanged re-render writes nothing to the ISR store.

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

`.github/workflows/deploy-site.yml` runs when a release is published — production, or preview for a pre-release — or by hand for a preview of any ref or a production deploy of a release tag. A release tag is `vMAJOR.MINOR.PATCH` (semver.org), the version every `package.json` in the repository carries; the workflow refuses any other tag (see `.claude/rules/releases.md`).

| Kind | Name | Value |
|------|------|-------|
| Secret | `VERCEL_TOKEN` | A Vercel token named `github-actions-deploy`, scoped to the team (not the project — a project-scoped token cannot read the project settings `vercel pull` needs) |
| Variable | `VERCEL_ORG_ID` | The team ID |
| Variable | `VERCEL_PROJECT_ID` | The project ID |

Releasing:

```bash
pnpm run release:version check v0.7.7
node krantho-site/scripts/check-release-entry.mjs v0.7.7
gh release create v0.7.7 --target main --title v0.7.7 --notes "…"
```

The job summary and the release notes record the deployment URL. To roll back, promote an earlier deployment with `vercel promote <url>`.

Previews (the workflow run by hand with `environment: preview`) get a `*.vercel.app` URL behind Vercel's standard deployment protection, and cannot complete Sign in with Vercel: the app redirects only to the production callback.

## Infrastructure

| Resource | What it manages |
|----------|-----------------|
| `vercel_project.site` | The project: no Git connection, Root Directory `krantho-site`, Node 24, fluid compute, functions in `fra1`, standard deployment protection. Imported from the dashboard |
| `vercel_project_domain` | `krantho.com` (production) and `www.krantho.com`, which redirects to it with a 301. Imported |
| `vercel_oauth_app` + client secret | The Sign in with Vercel app `krantho admin`, callback `https://krantho.com/api/auth/callback`. Imported; tofu generates the client secret |
| `vercel_project_environment_variables` | The runtime environment below |
| `vercel_blob_store` | The media library's public Blob store, with the media variables in their own resource (`media.tf`) |

The module and the stack that calls it are the operator's own, outside this repository. The stack supplies the team, domains, region, admin emails, `import` blocks for what the dashboard created, credentials and state backend. State holds the generated secrets (OAuth client secret, JWT secret) and the database URL, so it stays out of git, in an encrypted remote backend with locking. DNS for `krantho.com` is managed outside this repository.

The calling stack passes the module these values, from its own secret store (mode 600 or a secret manager, never this repository or the root `.env`):

| Variable | Where it comes from |
|----------|---------------------|
| `VERCEL_API_TOKEN` | A Vercel account token scoped to the team (Account Settings → Tokens); read by the `vercel` provider |
| `postgres_url` | The Neon pooled connection string (host contains `-pooler`), from the Neon store page |
| `media_blob_token` | The media Blob store's read-write token, copied once from its page |
| `llm_openai_api_key`, `llm_anthropic_api_key` | The site's language model keys, one per provider. They are credentials only: the provider is chosen in Studio or with `KRANTHO_LLM_PROVIDER` |

The database is Neon from the Vercel Marketplace (`aws-eu-central-1`, next to the functions). The integration owns it, not this stack; tofu only passes its pooled URL to the site. The deploy token (`VERCEL_TOKEN` GitHub secret) is created in the dashboard and is not managed here either.

Every runtime variable below is managed by tofu: change one in the module's `environment.tf` and apply, never with `vercel env` or the dashboard. Changes reach the next deployment.

```bash
tofu init
tofu plan -out=site.tfplan
tofu apply site.tfplan
```

`apply` and `destroy` take a saved plan or a resource named with `-target`; apply them that way, never a bare `apply` or `-auto-approve`.

### Runtime environment

Set by tofu for Production and Preview:

| Variable | Value |
|----------|-------|
| `KRANTHO_PERSISTENCE_PROVIDER` | `postgres` |
| `KRANTHO_PERSISTENCE_POSTGRES_URL` | The Neon pooled connection string (secret) |
| `KRANTHO_PERSISTENCE_POSTGRES_PREPARE` | `false` — the pooler does not support prepared statements |
| `KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS` | `2` |
| `KRANTHO_PERSISTENCE_POSTGRES_IDLE_TIMEOUT_SEC` | `20` |
| `KRANTHO_AUTH` | `oidc` |
| `OIDC_ISSUER_URL` | `https://vercel.com` |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | From the Sign in with Vercel app (secret) |
| `OIDC_REDIRECT_URI` | `https://krantho.com/api/auth/callback` |
| `KRANTHO_JWT_SECRET` | 64 random characters (secret); one value for every instance |
| `KRANTHO_ADMIN_EMAILS` | The administrators |
| `KRANTHO_AUTH_SESSION_SECURE` | `always` |
| `KRANTHO_AUTH_OIDC_STUDIO_ENTRY` | `redirect` — `/studio` signs in through Vercel and answers 404 to anyone refused |
| `KRANTHO_CONTENT_CACHE_ENABLED` | `false` — functions share no memory, so the API reads the database on every request; pages are cached by Vercel instead |

The canonical site URL comes from `site.baseUrl` in `krantho.config.ts`. Pages read content and SEO in-process, so no variable points them at the site's own API.

The schema migrations run whenever an instance first opens the database: the API handler, the pages' content loader (`createContentLoader`) and, with `cache.shared: 'database'`, the shared cache handler (`openPageCacheStore`) each open it, whichever a request reaches first. Instances that cold-start together serialize on a Postgres advisory lock, so each migration is applied once.

## Media

A function's filesystem is read-only and not shared between instances, so the `local` media store does not work on Vercel: uploads need an object store. Any of the remote stores works (see [media.md](media.md)); Vercel Blob keeps everything in one Vercel account.

1. Create a **public** Blob store, in the same region as the functions (`access = "public"` on `vercel_blob_store` when the project is managed by tofu). krantho writes public objects only.
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

1. **Vercel.** In the team's Settings → Apps → the app → General → **Sign-In Access**, choose **Members of the team**. Vercel then refuses anyone outside the team with `access_denied`. The provider does not manage this setting, so set it once in the dashboard.
2. **krantho.** Emails in `KRANTHO_ADMIN_EMAILS` create their account on first sign-in and become administrators.

With `KRANTHO_AUTH_OIDC_STUDIO_ENTRY=redirect` and `createStudioRouteHandler({ config })` in `app/studio/[[...slug]]/route.ts`, visiting `/studio` without a session goes to Vercel: someone signed in to Vercel who has approved the app comes straight back into Studio, and anyone either gate refuses gets a 404. A visitor not signed in to Vercel sees Vercel's login page first, since Vercel offers no silent sign-in check.

Vercel checks team membership when a user signs in. Removing someone from the team does not end a krantho session they already hold; it ends when the session expires.

## Content from the repository

Collections in `krantho-site` are filesystem-mastered: `content/pages/*.md` and `content/globals/*.md` are imported into the database when the API handler or the pages' content loader opens an **empty** database. On Postgres the database persists across deployments, so:

- **The first deployment imports the content.** The import runs on the first request that opens the database through the API handler or the pages' content loader.
- **Later edits to the `.md` files are not re-imported.** Once the database has content, the import is skipped. After the first deploy, edit content in Studio, or reset the database to re-import from the repository.

A collection whose directory is missing from the function bundle is logged at import time (`[import] Skipping <collection>: directory not found: …`).

## SEO enrichment

AI enrichment (`POST /api/seo/enrich`) runs as a background job after the response is sent. The job is handed to the platform's `waitUntil`, which `@krantho/server-next` wires to Next.js `after()`, so the instance keeps running it after the response. The job status is held in memory on the instance that runs the job, so a status poll that lands on another instance answers 404 even while the job runs.
