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
pnpm add @krantho/static @krantho/config @krantho/schema @krantho/ui-react @krantho/seo zod
```

`pnpm create krantho` with **Static site (Next.js, GitHub Pages)** sets it up for you.

## createStaticSite

```ts title="lib/krantho.ts"
import { createStaticSite } from '@krantho/static'
import { initServerLoader } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

export const site = createStaticSite({ config, collections })
initServerLoader(site.loader, site.rendering)
```

It takes the configuration and collections the server takes, and `images`, how the image copies are shown (see Images). It returns:

| Member | What it is |
|---|---|
| `loader` | The content loader pages read through: the live version of each document, and each page's JSON-LD composed from the `seo` section of the configuration. Pass it to `initServerLoader()` |
| `params(collection, locale?)` | One `{ slug }` for each published document of the collection, for `generateStaticParams` |
| `sitemapXml()` | `sitemap.xml`: every published, indexable page, dated by its file's last commit (see Requirements) |
| `llmsTxt()` | `llms.txt`: the site's name and summary, then each published, indexable page under its collection's heading, with a link and its description |
| `robotsTxt()` | `robots.txt`, allowing every crawler and naming the sitemap |
| `basePath` | The path of `site.baseUrl` (`/docs-site`), or `''` at a host's root |
| `rendering` | How pages render their markdown: `basePath`, `resolveUrl` (see Links between files), `atNotation` (`content.atNotation`) and `images` (see Images). Pass it to `initServerLoader()` |
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
- a collection with pages has no `path`, or one that does not end in `/`: each page is written as a folder, and the sitemap, llms.txt and canonical URLs must name the address it is served at. Write `path: '/docs/:slug/'`.

Pages are dated by their files' last git commit. Without the repository's full history, such as a shallow CI checkout, the build warns once and dates them by modification time: check out with `fetch-depth: 0`.

## Links between files

`site.rendering.resolveUrl` lets a folder of markdown read the same on GitHub and on the site. A URL written relative to a document's file is rewritten when the page renders:

| Written in `docs/setup.md` | Rendered (site at `/docs-site`) |
|---|---|
| `[Apps](apps.md#limits)` | `/docs-site/apps/#limits` |
| `[Home](README.md)`, with `indexFile: 'README.md'` | `/docs-site/` |
| `![Flow](images/flow.png)` | `/docs-site/images/flow.png` |

The same holds for the `src` and `href` of raw `<img>` and `<a>` tags, such as `<img src="images/flow.png" width="340">`. A link to a markdown file goes to that document's page, in whichever collection reads the file. Any other file inside the collection's directory is served from the site's root, so copy it into `public/` at the same path (`public/images/flow.png`). Absolute URLs, URLs that start with `/` or `#`, and files outside the collection's directory are left as written. `createLinkResolver(collections)` builds the same resolver for a site of your own.

## Images

`prepareImages()` gives each image in `public/` AVIF and WebP copies at the widths the krantho server serves its media at: each preset in `media.image.presets` narrower than the image (48, 96, 256, 512 and 1024 pixels by default), and the image's own width, capped at `media.image.maxWidth`. The copies are encoded at `media.image.quality.avif` and `.webp`, and written with a manifest to `public/_krantho/images/`; keep that folder out of git. A copy is made again when its image changes or those settings do, and the copies of a removed image are deleted. PNG, JPEG and WebP files are copied; SVG and GIF are served as they are.

```ts
import { prepareImages } from '@krantho/static/images'

await prepareImages({ config: kranthoConfig }) // { images: 12, written: 0 }
```

Call it before the pages render: the scaffolded `next.config.ts` calls it on `next build` and `next dev` (see Next.js settings). `createStaticSite()` reads the manifest, and each markdown image with copies renders as a `<picture>`: a `<source>` per format with its `srcset`, and the image itself as the fallback, with its width and height so the page does not shift as it loads. A width written in the markdown, `<img src="images/flow.png" width="340">`, is kept, the height follows the image's proportions, and the browser picks a copy for that width (`sizes="340px"`). Images decode off the main thread, and every image after a page's first loads lazily.

For every other image, the browser picks a copy by how wide it is shown, `100vw` unless you say otherwise. Give the width of your content column so a phone or a narrow column gets a smaller copy:

```ts title="lib/krantho.ts"
export const site = createStaticSite({
  config,
  collections,
  images: { sizes: '(min-width: 800px) 736px, 100vw' },
})
```

The copies are made when `next build` or `next dev` starts; an image added while `next dev` runs gets its copies on the next start.

`images.publicDir` names another folder than `public/`, for both `prepareImages()` and `createStaticSite()`.

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
import { prepareImages } from '@krantho/static/images'
import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants'
import kranthoConfig from './krantho.config'

export default async function config(phase: string): Promise<NextConfig> {
  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER) {
    await prepareImages({ config: kranthoConfig })
  }
  return {
    output: 'export',
    basePath: basePathOf(resolveConfig(kranthoConfig, process.env).site.baseUrl),
    trailingSlash: true,
    images: { unoptimized: true },
    serverExternalPackages: ['@krantho/static', '@krantho/server'],
  }
}
```

The configuration is a function of Next's phase, so the image copies are made only when the site is built or served in development. `serverExternalPackages` keeps the server out of the bundle: it loads its optional packages (other databases, media stores) only when a configuration asks for them, and a bundler would look for them all.
