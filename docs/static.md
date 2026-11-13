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
| `@krantho/core` | `renderContent(..., { basePath, resolveUrl, atNotation })`, through `initServerLoader(loader, site.rendering)` in `@krantho/ui-react`; `slugOfFile()`/`fileNameOf()`, which read a collection's `indexFile` |

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
site.rendering                  // { basePath, resolveUrl, atNotation } for initServerLoader()
site.config                     // the resolved KranthoConfig
```

`createStaticSite()` resolves the configuration with `loadConfig()` (the instance the loader shares)
and throws a `KranthoConfigError` listing each issue when `persistence.provider` is not
`filesystem`, `cache.pages` is not `none`, or a collection with pages has no `path` or one that does not end
in `/`. The trailing slash keeps the URLs krantho writes (sitemap, llms.txt, JSON-LD, canonical)
the same as the folders Next's `trailingSlash: true` export writes.

`params()` throws for an unknown collection. The first `params()` or file build warns once when
`paths.contentDir` has no git history (`contentVersion()` is null): pages are then dated by file
modification time.

The SEO files open their own filesystem adapter through `createAdapter()`; the loader keeps its
store private. Both read the same files, and the git dates are read once per process.

`site.rendering.resolveUrl` is `createLinkResolver(collections)` (`link-resolver.ts`, also exported).
It maps a URL written relative to a document's file — the document's collection `directory` — so a
folder of docs reads the same on GitHub and on the site:

- to a file another collection reads as a document (`setup.md#run`, the collection's `indexFile`):
  that document's `documentPath()` plus the query and anchor;
- to any other file inside the collection directory (`images/flow.png`): its path from that
  directory, root-relative (`/images/flow.png`), which the site serves from `public/`.

Absolute, protocol-relative, root-relative and anchor-only URLs, a markdown file that is not a
document or has no page, and a file outside the collection directory are left as written. The base
path is added after the resolver. `site.rendering.atNotation` is `content.atNotation`.

`@krantho/static/base-path` exports only `basePathOf()`, with no imports, so `next.config.ts` can
load it (Next loads the config with `require`; the export map has a `default` condition).

## Next.js

`serverExternalPackages: ['@krantho/static', '@krantho/server']`: bundled, `@krantho/server`'s
dynamic imports of optional packages (Postgres, the media stores, `@vercel/functions`, the
CloudFront client) fail to resolve.

## Tests

`packages/static/test/link-resolver.test.ts`: each kind of URL the resolver rewrites or leaves.
`packages/static/test/static-site.test.ts`: the base path, a `README.md` index file, rendered relative links, the configuration checks, the page list,
the sitemap and llms.txt from a git repository with known commit dates, the JSON-LD from the `seo`
section, and the history warning. `scripts/check-static-site.sh` builds a `create-krantho`
static site from the packed packages and checks the files it writes.
