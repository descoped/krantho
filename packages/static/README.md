# @krantho/static

Build a krantho site to static files: markdown in the repository is the content, every page is
written at build time with its structured SEO, and the sitemap and llms.txt come from the same
content. The output deploys to GitHub Pages or any host that serves files. There is no database,
no API and no Studio.

```bash
pnpm add @krantho/static @krantho/config @krantho/schema @krantho/ui-react @krantho/seo zod
```

```ts
// lib/krantho.ts
import { createStaticSite } from '@krantho/static'
import { initServerLoader } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

export const site = createStaticSite({ config, collections })
initServerLoader(site.loader, { basePath: site.basePath })
```

```ts
// app/docs/[slug]/page.tsx
export const dynamicParams = false
export function generateStaticParams() {
  return site.params('docs')
}
```

- `site.loader` reads the live version of each document, and composes each page's JSON-LD from the
  `seo` section of the configuration.
- `site.params(collection)` lists one page per published document.
- `site.sitemapXml()`, `site.llmsTxt()` and `site.robotsTxt()` return the files' bodies. Crawlers
  read robots.txt only at the host's root: a site served under a path submits its sitemap to the
  search engines instead.
- `site.basePath` is the path of `site.baseUrl` (`/docs-site`), or `''` at the host's root.
  `next.config.ts` reads it without loading the server: `basePathOf()` from
  `@krantho/static/base-path`.

The configuration must use `persistence.provider: 'filesystem'` and `cache.pages: 'none'`, and each
collection with pages declares a path ending in `/` (`/docs/:slug/`), the address Next's
`trailingSlash` export serves the page at. Pages are dated by their files' last git commit: check
out with `fetch-depth: 0` in CI.

Documentation: [Static sites on GitHub Pages](https://krantho.com/docs/deploy-github-pages).
