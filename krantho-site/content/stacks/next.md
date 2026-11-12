---
title: Krantho for Next.js
description: Add content management, an admin and Schema.org structured data to a Next.js App Router project. Pages are server components that read published content, cached until an editor changes it.
framework: next
tagline: Server components read published content in-process, and each page stays cached until an editor changes what it shows.
packages:
  - '@krantho/next'
  - '@krantho/server-next'
  - '@krantho/ui-react'
ui-packages:
  - '@krantho/ui-react'
  - '@krantho/ui-mui'
  - '@krantho/ui-tailwind'
order: 1
docs-page: first-page
status: published
---

Krantho runs inside your Next.js App Router project. The API and Studio are two route handlers; your pages are server components that read published content from the same database, in the same process. Your routes, components and styling stay yours.

## Install

One bundle, `@krantho/next`, pulls in the Next.js adapter, the React server components, Studio, the local media store and the SEO package. pnpm lets your code import only the packages you list yourself, so also add the ones your files import by name. SQLite is the default store and needs no database server.

{{sample:install}}

The packages are not on npm yet; this is the install the first release will use. [Project status](/docs/project-status) explains how to run krantho from source today.

## Wire

Two route handlers connect krantho to the app: the API at `/api/*` and Studio at `/studio`. A small module, `lib/krantho.ts`, points server components at the database the API opens.

{{sample:api-route}}

{{sample:content-loader}}

The API route and the loader both take the collections, so whichever a fresh deployment serves first opens the database and imports the markdown content into it. In `next.config.ts`, list krantho's server packages in `serverExternalPackages`, and rewrite `/robots.txt` and `/sitemap.xml` to the API, which builds both from the published content.

## Render

A page is a server component. It reads the published version of a document, so a saved draft never changes what visitors see. `requirePublished` answers 404 for a page with no published version, and `<SeoJsonLd>` renders the page's Schema.org graph.

{{sample:render-page}}

`@krantho/ui-react/server` also provides `CMSTextServer` and `CMSMarkdownServer` for a single field or a named `##` section, and `resolveSeoContent()` for `generateMetadata`. Live mode and **Open on site** in Studio open the page in Next.js draft mode, so an editor sees the draft on the page itself while visitors keep the published version.

## Deploy

With `cache.pages: 'next-isr'`, each page renders on its first request and is served from Next's cache until a change in Studio invalidates what it shows. The content routes are dynamic segments whose `generateStaticParams` returns nothing, so the build never reads the database.

{{sample:cache-pages}}

- **On Vercel**, cached pages are served from Vercel's CDN, and Next's own invalidation reaches it: there is no purge to set up. Content lives in Postgres and uploads in an object store. See [Deploy to Vercel](/docs/deploy-vercel).
- **On your own servers** (`next start` in a container or on a VM), the same setting works as it is. Several instances share one page cache through the site's database with `cache.shared: 'database'`.
- **Behind Amazon CloudFront or Google Cloud CDN**, name the CDN in the environment. Every live change then refreshes Next's cache and purges `/*` at the CDN. See [Deploy behind a CDN](/docs/deploy-cdn).
