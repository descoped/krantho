---
name: start
description: >
  Adds krantho — a CMS library with an admin and structured SEO — to a new or existing Next.js,
  SvelteKit or Express/Vite project, and gets it running. Use when someone wants to "add krantho",
  "set up krantho", "install the CMS", scaffold a krantho site, wire the krantho API and Studio
  routes, connect page rendering to krantho content, choose SQLite or Postgres, pick a media store,
  turn on page caching, or deploy a krantho site. Covers krantho.config.ts, krantho.collections.ts,
  the API and /studio routes, the in-process content loader, persistence, media, page caching,
  authentication and hosting, per framework.
compatibility: krantho 1.x; Claude Code
metadata:
  krantho-version: 1.0.1
  docs: https://krantho.com/docs/installation
---

# Add krantho to a project

## Contents

- Status — read this first
- Workflow
- Packages
- Configuration
- Collections
- Persistence
- Media
- Page caching
- Authentication
- Content during development
- Verify
- Mistakes to avoid

krantho is a library inside the app, not a service beside it. A krantho site has five parts, the
same on every framework:

| Part | File (Next.js) | What it does |
|---|---|---|
| Configuration | `krantho.config.ts` | Data only: site identity, persistence, media, cache, auth, SEO seed. Resolved once: defaults, then the file, then the environment |
| Content templates | `krantho.collections.ts` | Collections with Zod schemas; each schema is the form an editor fills in `/studio` |
| API route | `app/api/[...path]/route.ts` | The REST API Studio and tools use; opens the database, imports content, runs migrations |
| Studio route | `app/studio/[[...slug]]/route.ts` | Serves the Studio SPA at `/studio` |
| Page loader | `lib/krantho.ts` | Lets pages read the published version of each document in-process, from the same database |

Pages are ordinary framework routes (page templates) that read content through the loader. There
is no page builder: content is fields plus a markdown body, and layout stays in your code.

## Status — read this first

krantho is released: `create-krantho` and every `@krantho/*` package are on npm, and the code
is in the public `descoped/krantho` repository. All packages share one version.

The default SQLite store runs on `better-sqlite3`, whose install step pnpm 10 and npm 12 skip
until it is allowed: run `pnpm approve-builds` (or `npm approve-scripts --allow-scripts-pending`)
and allow it. A site on Postgres only does not need it.

## Workflow

1. **Inspect the project.** Read `package.json`: `next` → Next.js, `@sveltejs/kit` → SvelteKit,
   `express` or `vite` without a meta-framework → Express/Vite. Note the package manager, the
   TypeScript setup, the existing routes, and where content lives today. For a new project, ask
   which framework, or suggest `npx create-krantho`.
2. **Load the stack reference** and follow it for every file:
   - Next.js (App Router): `${CLAUDE_SKILL_DIR}/references/next.md`
   - SvelteKit 2: `${CLAUDE_SKILL_DIR}/references/sveltekit.md`
   - Express with Vite (server-rendered React, or an SPA): `${CLAUDE_SKILL_DIR}/references/express.md`
3. **Add the packages** (below), **write `krantho.config.ts`** and **`krantho.collections.ts`**.
4. **Wire the API route, the Studio route and the page loader** for the stack.
5. **Model the content.** Start with the collections the site needs; the `content-model` skill
   designs content templates and page templates together.
6. **Run it and check** (see Verify). Then choose persistence, media, caching and auth for the
   target host with `${CLAUDE_SKILL_DIR}/references/hosting.md`.

Keep changes to what the user asked. An existing site keeps its routes and styling; krantho
supplies the content they read.

## Packages

One bundle per framework pulls in the server adapter, Studio, the local media store and SEO.
pnpm does not let code import a transitive dependency by name, so also add every package your
own files import.

```bash
# Next.js
pnpm add @krantho/next @krantho/server-next @krantho/ui-react @krantho/config @krantho/schema zod
# SvelteKit (@krantho/core for renderContent in load functions)
pnpm add @krantho/sveltekit @krantho/server-sveltekit @krantho/core @krantho/config @krantho/schema zod
# Express / Vite / Node, plus the UI package the pages use
pnpm add @krantho/node @krantho/server-node @krantho/core @krantho/config @krantho/schema zod
```

Postgres adds `@krantho/persistence-postgres postgres`. A remote media store adds its package:
`@krantho/media-vercel-blob`, `@krantho/media-s3` or `@krantho/media-gcs`.

## Configuration

```ts
// krantho.config.ts
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: {
    domain: 'example.com',
    name: 'Example',
    language: 'en',
    baseUrl: 'https://example.com',
  },
})
```

- Data only. Collections, plugins and hooks are code and live in their own modules.
- Every leaf except the structured ones (such as `seo.collections`) can be overridden by an
  environment variable; secrets (database URL, API keys, `KRANTHO_JWT_SECRET`) belong in the
  environment only. Read `resolveConfig(config, process.env)` in app code, never `process.env`
  for krantho settings. The full list is at https://krantho.com/docs/configuration.
- `site.baseUrl` drives canonical links, the sitemap and robots.txt; set
  `KRANTHO_SITE_BASE_URL` per deployment.

## Collections

```ts
// krantho.collections.ts
import { join } from 'node:path'
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(process.cwd(), 'content', 'pages'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    status: z.enum(['draft', 'published']).default('published'),
  }),
})

export const collections = { pages }
```

- One module, imported by both the API route and the page loader: whichever a fresh deployment
  serves first opens the database and imports the same content.
- The object key must equal the collection `name`.
- `source: 'filesystem'` imports `content/<name>/<slug>.md` into an empty database; after that
  the database is the source of truth and editors work in `/studio`.
- krantho routes documents by convention: `pages` at the site root (`home` at `/`), every other
  collection at `/<collection>/<slug>`, `globals` nowhere. The sitemap, **Open on site** and
  cache refresh after a publish all assume it, so route pages the same way.

## Persistence

| Provider | Select | Use for |
|---|---|---|
| SQLite (default) | nothing to set; file at `.krantho/content.db` | development, and a single server with a persistent disk |
| Postgres | `KRANTHO_PERSISTENCE_PROVIDER=postgres`, `KRANTHO_PERSISTENCE_POSTGRES_URL` | serverless hosts, several instances, managed databases |
| Filesystem | `persistence: { provider: 'filesystem' }` | prototypes only: markdown files are the store; no version history, no media library |

Schema migrations run automatically when an instance first opens the database. Add `.krantho/`
to `.gitignore`. Everything works on both databases.

## Media

Off until `media.provider` is set: `local` (disk, served by the framework from
`media.local.dir`, default `public/uploads` at `/uploads`), `vercel-blob`, `s3` (also R2 and
MinIO) or `gcs`. Media needs SQLite or Postgres. Serverless hosts need a remote store. Pages
embed `/api/media/<id>/image?preset=lg`, which follows a replaced image.

## Page caching

`cache.pages` picks how rendered pages are cached:

- `none` (default): every request renders; reads are cached for `content.cache.ttlMs` (5 min).
- `next-isr` (Next.js): each page is rendered on first request and kept until a change in the
  admin invalidates it. Page routes need the ISR shape — see `references/next.md`.
- `cdn` (SvelteKit, Express): pages carry CDN cache headers and tags; a change purges the CDN
  named by `cache.cdn.provider` (`vercel`, `cloudfront`, `gcp`).

## Authentication

With the default `auth.mode: 'none'` anyone who reaches `/studio` can edit — fine on a
developer machine only. Before a site serves traffic:

- **Token:** `KRANTHO_AUTH=token`, `KRANTHO_API_TOKEN=<shared secret>`,
  `KRANTHO_JWT_SECRET=<random, same on every instance>`. Editors sign in with the token.
- **OIDC:** `KRANTHO_AUTH=oidc` with `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`,
  `OIDC_REDIRECT_URI=https://<domain>/api/auth/callback`, `KRANTHO_ADMIN_EMAILS` for the first
  admin, and `KRANTHO_JWT_SECRET`.

Never write secrets into `krantho.config.ts` or commit `.env`.

## Content during development

- Markdown files import only into an empty database. Delete `.krantho/` to re-import from
  files, or set `KRANTHO_CONTENT_WATCH=true` to sync file edits while the dev server runs.
- Set `KRANTHO_CONTENT_CACHE_ENABLED=false` in development to see a published change on the
  next page load.

## Verify

1. Start the dev server. Open `/api/capabilities` (JSON), `/api/docs` (the API reference) and
   `/studio` (Studio; it answers 503 with a hint when the Studio build is missing).
2. Open a page. A document with no published version answers 404, never a blank page.
3. Edit a document in `/studio`, **Save draft**, then **Publish**, and reload the page.
4. Run the project's own typecheck and build.

## Mistakes to avoid

- Reading content in the Next.js root layout: the build prerenders 404 through it and cannot
  reach the database. Read globals in a route-group layout.
- Fetching the site's own `/api` from pages. Pages read in-process through the loader.
- Two collection modules, or collections defined inline in the route: the loader and the API
  must share one.
- Bundling server packages: keep `better-sqlite3` and the krantho server packages external
  (`serverExternalPackages` in Next.js, `ssr.external` in Vite).
- SQLite or local media on a serverless host: the filesystem there is read-only and per
  instance. Use Postgres and a remote media store.
