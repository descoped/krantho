# krantho-site

The krantho website, built with krantho. Dogfooding the full content framework pipeline.

## Setup

The site lives in the krantho repository and runs on the workspace's own packages, so it always shows the code as it is.

```bash
# From monorepo root
pnpm install

# Run the site (loads the monorepo root .env if present)
cd krantho-site
pnpm dev
```

## Content Model

- **pages** — filesystem-mastered static pages (home, about, features, pricing)
- **globals** — site-wide navigation and footer fields
- **blog** — filesystem-mastered articles in `content/blog/` (no articles yet)

Filesystem content is imported into the database on first startup (SQLite locally, Postgres in production); pages render the published version of each document from that database through `createContentLoader()` in `lib/krantho.ts`, where `requirePublished(collection, slug)` answers 404 for a page with no published version. A draft save in Studio leaves the live page as it is; Publish makes it live.

## Configuration

- `krantho.collections.ts` — collection definitions with Zod schemas, shared by the API route and the page loader
- `krantho.config.ts` — site identity; every other leaf takes its default or an environment override (see `docs/configuration.md`)
- `content/seo/site-config.json` — input for the `@krantho/tools` SEO pipeline
- `vercel.json` and `next.config.ts` — Vercel build and function bundling; see `docs/guides/deploy-vercel.md`
