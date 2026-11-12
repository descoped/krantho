# Next.js + shadcn/Tailwind Example

Demonstrates the krantho content model with Next.js 16 and Tailwind CSS v4. This is the reference example the others mirror.

## Getting Started

From the repository root, build the packages once (`pnpm run build`), then:

```bash
cd examples/nextjs-shadcn
pnpm dev
```

The dev script loads the repository root `.env` when it exists. The site's `baseUrl` in `krantho.config.ts` is `http://localhost:4002`.

## Structure

- `krantho.config.ts` — site configuration (data only; every leaf can be overridden from the environment)
- `krantho.collections.ts` — collection definitions, shared by the API route and the page loader
- `krantho.seo/` — SEO seed files, loaded through `seo.configDir`
- `content/` — Shared example content (symlink to `../content/`)
- `app/` — Next.js App Router pages (Server Components), the krantho API route and the Studio route
- `components/` — Tailwind-styled components (shadcn pattern)
- `lib/krantho.ts` — registers the content loader for `@krantho/ui-react/server` components

## Several instances

`krantho.config.ts` keeps `cache.shared` at its default, `none`: each `next start` instance keeps its own page cache. To run several instances of the site with one cache, set `KRANTHO_CACHE_SHARED=database` for the build and for every server start. `next.config.ts` then sets `cacheHandler` to `@krantho/server-next/cache-handler` and `cacheMaxMemorySize` to `0`, and Next keeps its cache in the site's database: a page one instance rendered is served by the others, and a publish through any instance's API reaches all of them. The handler opens the database from the environment alone, so every instance names the same one there (`KRANTHO_PATHS_DATA_DIR` for instances on one host sharing a SQLite file, or `KRANTHO_PERSISTENCE_PROVIDER=postgres` with `KRANTHO_PERSISTENCE_POSTGRES_URL`).

```bash
KRANTHO_CACHE_SHARED=database pnpm run build
KRANTHO_CACHE_SHARED=database pnpm start
```

`docs/server-next.md` describes the handler.
