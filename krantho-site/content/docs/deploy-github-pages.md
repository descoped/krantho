---
title: Deploy to GitHub Pages
description: Build a krantho site from its markdown to static files and publish it to GitHub Pages on every push, with its structured data, sitemap and llms.txt.
area: deploy
order: 30
level: beginner
stacks: [next]
next: [package-static]
related: [package-static, persistence, installation, deploy-vercel]
status: published
---

A static krantho site is markdown in your repository, built to plain files. Next.js writes every page at build time, with the same structured data, sitemap and llms.txt a full krantho site serves, and a GitHub Actions workflow publishes the files to GitHub Pages. There is no database, no API and no Studio: you edit the markdown and push.

It suits project documentation and other sites whose authors work in the repository. A site whose editors work in Studio needs a server; see [Deploy to Vercel](/docs/deploy-vercel).

## Create the site

```bash
pnpm create krantho my-docs
```

Choose **Static site (Next.js, GitHub Pages)** as the framework. The project uses the package manager you ran the scaffolder with: `npx create-krantho my-docs` gives an npm project, whose workflow runs `npm ci` and `npm run build`. The project has:

| File | What it does |
|---|---|
| `content/docs/*.md` | One page per file. `index.md` is the home page; `writing.md` is served at `/writing/` |
| `krantho.config.ts` | The site's name and address, the filesystem provider and the structured data |
| `krantho.collections.ts` | The `docs` collection: `title`, `description`, `group` and `order` |
| `lib/krantho.ts` | `createStaticSite()` and the sidebar's reading order |
| `app/` | The layout, the pages, `sitemap.xml`, `llms.txt` and `robots.txt` |
| `next.config.ts` | The static export, served under the path of the site's address |
| `.github/workflows/pages.yml` | Builds the site and publishes it on every push to `main` |

Run `pnpm run dev` and edit a file in `content/docs`; `pnpm run build` writes the site to `out/`.

## Turn on GitHub Pages

Push the project to GitHub. Then, once, in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. A repository admin can do the same from the command line:

```bash
gh api -X POST repos/<owner>/<repository>/pages -f build_type=workflow
```

The next push to `main` publishes the site at `https://<owner>.github.io/<repository>/`. On GitHub Free, Pages publishes from public repositories; the paid plans add private ones, and the site itself is public either way.

## The workflow

```yaml title=".github/workflows/pages.yml"
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - id: pages
        uses: actions/configure-pages@v6
      - run: pnpm run build
        env:
          KRANTHO_SITE_BASE_URL: ${{ steps.pages.outputs.base_url }}
      - uses: actions/upload-pages-artifact@v5
        with:
          path: out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- `configure-pages` reports the address Pages serves the site at, and the build takes it as `KRANTHO_SITE_BASE_URL`, the site's `site.baseUrl`. Canonical URLs, the sitemap and the structured data name that address.
- `fetch-depth: 0` checks out the whole history: each page is dated by its file's last commit. A shallow checkout dates every page by the checkout, and the build says so.
- `pnpm/action-setup` reads the pnpm version from `packageManager` in `package.json` (`"packageManager": "pnpm@12.16.1"`), which the scaffolder writes. A project set up by hand needs it too. An npm project runs `npm ci` and has no such step.

> [!CAUTION]
> Leave `configure-pages` without `static_site_generator`. With it, the action rewrites a `next.config.js` and writes a second, empty one beside a `next.config.ts`.

## How it is wired

The site reads its markdown through `createStaticSite()` from [@krantho/static](/docs/package-static):

```ts title="lib/krantho.ts"
import { createStaticSite } from '@krantho/static'
import { initServerLoader } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

export const site = createStaticSite({ config, collections })
initServerLoader(site.loader, site.rendering)
```

The configuration reads the markdown files and caches nothing:

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: {
    domain: 'localhost',
    name: 'my-docs',
    description: 'Documentation for my-docs.',
    language: 'en',
    baseUrl: 'http://localhost:3000',
  },
  persistence: { provider: 'filesystem' },
  cache: { pages: 'none' },
  seo: { identity: 'WebSite', collections: { docs: ['TechArticle'] } },
})
```

Each page is written as a folder (`writing/index.html`), so the collection's path ends in a slash, `path: '/:slug/'`. The sitemap and each page's canonical URL then name the address the page is served at. The page route lists one page per published file:

```tsx title="app/[slug]/page.tsx"
import { site } from '../../lib/krantho'

export const dynamicParams = false

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return (await site.params('docs')).filter((page) => page.slug !== 'index')
}
```

`next.config.ts` exports the site and serves it under the path of its address:

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

## Links and images

A project site is served under `/<repository>`. `next/link` adds that path to the site's own links, and krantho adds it to links and images in your markdown that start at the site's root: `[Setup](/setup/)` and `![Diagram](/diagram.png)` work at `/<repository>/` and at a domain of your own alike. Put images in `public/`. Absolute URLs are left as written.

Links between your markdown files work too, so the same folder reads well on GitHub: `[Setup](setup.md#install)` goes to the setup page, and `![Diagram](images/diagram.png)` to `/images/diagram.png`, which the site serves from `public/images/diagram.png`. An image sized in HTML, `<img src="images/diagram.png" width="340">`, works the same way. See [Links between files](/docs/package-static#links-between-files).

## Publish a repository's existing docs

The site can live in a folder of a project's repository, such as `site/`, and read the project's `docs/`; the [dedupd](https://github.com/descoped/dedupd) repository is an example. Point the collection at that folder, and read `README.md` as its home page:

```ts title="site/krantho.collections.ts"
const docs = defineCollection({
  name: 'docs',
  source: 'filesystem',
  directory: join(process.cwd(), '..', 'docs'),
  indexFile: 'README.md',
  path: '/:slug/',
  // ...
})
```

- Set `paths.contentDir: '../docs'` in `krantho.config.ts`, so the pages are dated by the folder's git history.
- If the docs write `@name` as text, set `content: { atNotation: false }`: otherwise `@title` in a body is replaced with the page's title.
- Quote a frontmatter `description` that holds `: `, as in `description: "Setup: what you need"`. Unquoted, it is not valid YAML.
- In the workflow, run the steps in the site's folder with `defaults.run.working-directory: site`, and point the actions at it: `package_json_file: site/package.json` for `pnpm/action-setup`, `cache-dependency-path: site/pnpm-lock.yaml` for `setup-node`, and `path: site/out` for `upload-pages-artifact`.

## A domain of your own

Set the domain under **Settings → Pages → Custom domain**, or with `gh api -X PUT repos/<owner>/<repository>/pages -f cname=docs.example.com`. A `CNAME` file in the site is ignored when Pages publishes from a workflow. Point the domain at GitHub Pages:

- a subdomain: a `CNAME` record to `<owner>.github.io`;
- an apex domain: `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`, and `AAAA` records to `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153` and `2606:50c0:8003::153`.

Verify the domain for your account or organization first, so no one else can claim it. The site is then served at the domain's root, so run the workflow again: the next build takes the new address and no path. Pages provides the HTTPS certificate.

## Search engines

The build writes `sitemap.xml`, `llms.txt` and `robots.txt` from the published pages. `robots.txt` allows every crawler and names the sitemap. Crawlers read it only at a host's root, so on a project site, where it is served at `/<repository>/robots.txt`, it has no effect: submit the sitemap in the search engines' webmaster tools instead. At a domain of your own, crawlers find it.

## Limits

GitHub Pages serves files only: no redirects, no custom headers and no server code. A site may be up to 1 GB, and a deployment times out after 10 minutes. Pages is not for commercial sites such as shops or SaaS products; check GitHub's terms for yours.

`out/` is plain files, so the same build deploys to any static host. Set `KRANTHO_SITE_BASE_URL` to the address it serves the site at.
