# @krantho/example-nextjs-mui

A Next.js 16 example app demonstrating the krantho content model with Material UI.

## What it demonstrates

- The krantho API route (`app/api/[...path]/route.ts`) and Studio route (`app/studio/`), configured from `krantho.config.ts`
- Server Components that render content with `CMSTextServer` / `CMSMarkdownServer` from `@krantho/ui-react/server`, reading the SQLite database set up in `lib/krantho.ts`
- Layout content from the `globals` collection and `## section` extraction
- Material UI components throughout: AppBar, Typography, Grid, Paper, Card, Button, etc.
- `sx` prop styling with MUI's theme system (no Tailwind or utility classes)
- SEO meta tags and JSON-LD with `resolveSeoContent()` and `<SeoJsonLd>`
- Shared content symlinked from `../content/`

## Running

From the repository root, build the packages once (`pnpm run build`), then:

```bash
cd examples/nextjs-mui
pnpm dev
```

The dev script loads the repository root `.env` when it exists. The site's `baseUrl` in `krantho.config.ts` is `http://localhost:4001`.

## Content

Content lives in `content/` (symlinked to `../content/`). Markdown files are imported into the SQLite database on startup; their YAML frontmatter becomes `fields`.

## Several instances

`krantho.config.ts` keeps `cache.shared` at its default, `none`: each `next start` instance keeps its own page cache. To run several instances of the site with one cache, set `KRANTHO_CACHE_SHARED=database` for the build and for every server start. `next.config.ts` then sets `cacheHandler` to `@krantho/server-next/cache-handler` and `cacheMaxMemorySize` to `0`, and Next keeps its cache in the site's database: a page one instance rendered is served by the others, and a publish through any instance's API reaches all of them. The handler opens the database from the environment alone, so every instance names the same one there (`KRANTHO_PATHS_DATA_DIR` for instances on one host sharing a SQLite file, or `KRANTHO_PERSISTENCE_PROVIDER=postgres` with `KRANTHO_PERSISTENCE_POSTGRES_URL`).

```bash
KRANTHO_CACHE_SHARED=database pnpm run build
KRANTHO_CACHE_SHARED=database pnpm start
```

`docs/server-next.md` describes the handler.
