---
title: "@krantho/static"
description: Build a krantho site from its markdown to static files, with each page's structured data, the sitemap and llms.txt.
area: reference
order: 113
level: intermediate
stacks: [next]
prerequisites: [deploy-github-pages]
related: [deploy-github-pages, package-server, package-ui-react, persistence]
status: published
---

The static mode of krantho. A site reads its markdown files at build time and writes every page, its structured data and its SEO files once. It has no database, no API and no Studio. [Deploy to GitHub Pages](/docs/deploy-github-pages) shows a whole site.

## Install

```bash
pnpm add @krantho/static @krantho/ui-react @krantho/seo zod
```

`npx create-krantho` with **Static site (Next.js, GitHub Pages)** sets it up for you.

## createStaticSite

```ts title="lib/krantho.ts"
import { createStaticSite } from '@krantho/static'
import { initServerLoader } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

export const site = createStaticSite({ config, collections })
initServerLoader(site.loader, { basePath: site.basePath })
```

It takes the configuration and collections the server takes, and returns:

| Member | What it is |
|---|---|
| `loader` | The content loader pages read through: the live version of each document, and each page's JSON-LD composed from the `seo` section of the configuration. Pass it to `initServerLoader()` |
| `params(collection, locale?)` | One `{ slug }` for each published document of the collection, for `generateStaticParams` |
| `sitemapXml()` | `sitemap.xml`: every published, indexable page, dated by its file's last commit |
| `llmsTxt()` | `llms.txt`: the site's name, then a link and description for each published page |
| `robotsTxt()` | `robots.txt`, allowing every crawler and naming the sitemap |
| `basePath` | The path of `site.baseUrl` (`/docs-site`), or `''` at a host's root |
| `config` | The resolved configuration |

Serve each file from a route written once at build:

```ts title="app/sitemap.xml/route.ts"
import { site } from '../../lib/krantho'

export const dynamic = 'force-static'

export async function GET(): Promise<Response> {
  return new Response(await site.sitemapXml(), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })
}
```

## Requirements

`createStaticSite()` throws a `KranthoConfigError` naming each problem when:

- `persistence.provider` is not `filesystem`: the markdown files are the content;
- `cache.pages` is not `none`: every page is rendered once, at build;
- a collection with pages has a path that does not end in `/`: each page is written as a folder, and the sitemap, llms.txt and canonical URLs must name the address it is served at. Write `path: '/docs/:slug/'`.

Pages are dated by their files' last git commit. Without the repository's full history, such as a shallow CI checkout, the build warns once and dates them by modification time: check out with `fetch-depth: 0`.

## basePathOf

```ts
import { basePathOf } from '@krantho/static/base-path'

basePathOf('https://owner.github.io/docs-site') // '/docs-site'
basePathOf('https://docs.example.com') // ''
```

The path a site is served under, from its address. `next.config.ts` takes it as `basePath`; it is imported from `@krantho/static/base-path`, which loads nothing else, so the configuration does not load the server.

## Next.js settings

```ts title="next.config.ts"
import { resolveConfig } from '@krantho/config'
import { basePathOf } from '@krantho/static/base-path'
import type { NextConfig } from 'next'
import kranthoConfig from './krantho.config'

const nextConfig: NextConfig = {
  output: 'export',
  basePath: basePathOf(resolveConfig(kranthoConfig, process.env).site.baseUrl),
  trailingSlash: true,
  images: { unoptimized: true },
  serverExternalPackages: ['@krantho/static', '@krantho/server'],
}

export default nextConfig
```

`serverExternalPackages` keeps the server out of the bundle: it loads its optional packages (other databases, media stores) only when a configuration asks for them, and a bundler would look for them all.
