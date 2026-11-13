# @krantho/static

Build a krantho site to static files. A site reads its markdown at build time through the same
content loader a server-rendered site uses, and writes every page, its JSON-LD and its SEO files
once. There is no database, no API and no Studio. The user documentation is
[krantho.com/docs/package-static](https://krantho.com/docs/package-static) and
[Deploy to GitHub Pages](https://krantho.com/docs/deploy-github-pages).

## Why a package

A static site runs krantho by its own rules: the filesystem provider only, the live version only
with no preview and no cache, every page listed at build, and the sitemap, robots.txt and llms.txt
written as files. Those rules live here, framework-neutral: Next's `generateStaticParams` and
SvelteKit's `entries()` take the same slug list. The work it relies on lives in the packages a
server-rendered site shares:

| Package | What a static site uses |
|---|---|
| `@krantho/server` | `createContentLoader()`; `createAdapter()`, whose filesystem adapter dates files by their last commit (`gitDateLookup`, read once per directory per process); `memorySeoConfig()`, the `seo` section held in memory |
| `@krantho/api` | `buildSitemapUrls()`, `serializeSitemapXml()`, `buildDefaultRobotsBody()`, `buildLlmsTxt()` over a `SeoFileSource` |
| `@krantho/core` | `renderContent(..., { basePath })`, through `initServerLoader(loader, { basePath })` in `@krantho/ui-react` |

## API

```ts
import { createStaticSite } from '@krantho/static'
import { basePathOf } from '@krantho/static/base-path'

const site = createStaticSite({ config, collections })
site.loader                     // ContentLoader: pages, and JSON-LD from the seo section
await site.params('docs')       // [{ slug }] for each published document
await site.sitemapXml()         // sitemap.xml
await site.llmsTxt()            // llms.txt
site.robotsTxt()                // robots.txt
site.basePath                   // basePathOf(site.baseUrl): '/repo' or ''
site.config                     // the resolved KranthoConfig
```

`createStaticSite()` resolves the configuration with `loadConfig()` (the instance the loader shares)
and throws a `KranthoConfigError` listing each issue when `persistence.provider` is not
`filesystem`, `cache.pages` is not `none`, or a collection with pages has a `path` that does not end
in `/`. The trailing slash keeps the URLs krantho writes (sitemap, llms.txt, JSON-LD, canonical)
the same as the folders Next's `trailingSlash: true` export writes.

`params()` throws for an unknown collection. The first `params()` or file build warns once when
`paths.contentDir` has no git history (`contentVersion()` is null): pages are then dated by file
modification time.

The SEO files open their own filesystem adapter through `createAdapter()`; the loader keeps its
store private. Both read the same files, and the git dates are read once per process.

`@krantho/static/base-path` exports only `basePathOf()`, with no imports, so `next.config.ts` can
load it (Next loads the config with `require`; the export map has a `default` condition).

## Next.js

`serverExternalPackages: ['@krantho/static', '@krantho/server']`: bundled, `@krantho/server`'s
dynamic imports of optional packages (Postgres, the media stores, `@vercel/functions`, the
CloudFront client) fail to resolve.

## Tests

`packages/static/test/static-site.test.ts`: the base path, the configuration checks, the page list,
the sitemap and llms.txt from a git repository with known commit dates, the JSON-LD from the `seo`
section, and the history warning. `scripts/check-static-site.sh` builds a `create-krantho`
static site from the packed packages and checks the files it writes.
