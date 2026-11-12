---
title: "@krantho/ui-react"
description: React server components, server utilities and hooks for rendering published krantho content in Next.js and React apps.
area: reference
order: 112
level: intermediate
stacks: [next, express]
prerequisites: [first-page]
next: [add-seo]
related: [templates, rendering-modes, package-server, package-seo, semantic-styles, live-editing]
status: published
---

React bindings for krantho. Server components and server utilities read published content, SEO meta tags and JSON-LD for server rendering and React Server Components; client components and hooks render in the browser.

## Install

```bash
pnpm add @krantho/ui-react
```

Peer dependency: `react >= 19.0.0`.

## Server components

Async components that load content at render time, with no client JavaScript and no loading states. Import them from `@krantho/ui-react/server`.

Server components take a `collection` and a `slug`, plus an optional `locale` (default: the site's default locale).

```tsx
import { CMSTextServer, CMSMarkdownServer, CMSImageServer } from '@krantho/ui-react/server'

export default async function Page() {
  return (
    <>
      <CMSTextServer collection="features" slug="seo" field="title" variant="h1" />
      <CMSTextServer collection="features" slug="seo" field="benefit" variant="body1" />
      <CMSMarkdownServer collection="features" slug="seo" />
      <CMSImageServer collection="pages" slug="about" field="hero-image" width={1200} height={600} />
    </>
  )
}
```

Render one `## section` of a content file:

```tsx
<CMSMarkdownServer collection="features" slug="seo" section="Limits" />
```

### Live marks

In an editor's preview, the server components mark what they render for Studio's Live mode: `CMSTextServer` and `CMSImageServer` their field, `CMSMarkdownServer` its section, or the lead and every `##` section of a whole body. Visitors get the same markup as without the marks. Where a page renders a value itself, mark the element with the helpers from `@krantho/core/marks`. The `CMSContent` that `getCMSContent` returns carries `collection`, `slug` and `preview`, so it can be passed to them as it is:

```tsx
import { kranthoField, markBodySections } from '@krantho/core/marks'
import { getCMSContent } from '@krantho/ui-react/server'

export async function Feature({ slug }: { slug: string }) {
  const feature = await getCMSContent('features', slug)
  return (
    <article>
      <h1 {...kranthoField(feature, 'title')}>{String(feature.fields['title'] ?? '')}</h1>
      <div dangerouslySetInnerHTML={{ __html: markBodySections(feature.html, feature.rawContent, feature) }} />
    </article>
  )
}
```

[Live editing](/docs/live-editing) covers marking on every stack.

### Published content only

Server components and server utilities read the published version of a document. Saving a document leaves the live page as it is, publishing makes the current version live, and unpublishing, archiving or deleting the document takes it offline. `getCMSContent` throws a `NetworkError` with status `404` when a document has nothing published, so a page can answer 404:

```ts title="lib/krantho.ts"
import { notFound } from 'next/navigation'
import { getCMSContent, NetworkError } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'

export async function requirePublished(collection: string, slug: string): Promise<CMSContent> {
  try {
    return await getCMSContent(collection, slug)
  } catch (error) {
    if (error instanceof NetworkError && error.status === 404) notFound()
    throw error
  }
}
```

An editor's preview is the one exception. When an editor opens the page's draft preview — Live mode or **Open on site** in Studio — the Next.js page renders in draft mode, and `getCMSContent`, the server components and `SeoJsonLd` read the document's current version, unpublished changes included, uncached; `CMSContent.preview` is then `true`. Collection lists still show published documents. [Deploy behind a CDN](/docs/deploy-cdn) explains how previews work on each framework.

### Caching

Reads through the content loader are cached in-process per `content.cache` (5 minutes by default). Two page cache strategies replace that cache:

- `cache.pages: 'next-isr'`: every read goes through the Next.js data cache, tagged with what it read. A rendered page stays cached until a content change invalidates one of its tags.
- `cache.pages: 'cdn'`: the CDN caches the pages, and the loader reads uncached, so the render after a purge reads the new version.

[Rendering modes](/docs/rendering-modes) shows the page routes each strategy needs.

## Client components

Components that load content in the browser. Import them from `@krantho/ui-react`. They fetch markdown files over HTTP from `<contentPath>/pages/<slug>.md` (the `contentPath` from `CMSProvider`, `/content` by default), so they read the files you serve, not the published version in the database.

```tsx
import { CMSText, CMSMarkdown, CMSImage } from '@krantho/ui-react'

<CMSText slug="about" field="title" variant="h1" />
<CMSMarkdown slug="about" section="Where it stands" />
<CMSImage slug="about" field="hero-image" width={800} height={400} />
```

Client components mark their field or section in an editor's preview too, from `ContentData.document`. Only content preloaded by the server carries it: see [CMSContentProvider](#cmscontentprovider) and [Live editing](/docs/live-editing#client-rendered-components).

## Hooks

### useContent

Loads content for a slug and returns fields, HTML, sections and loading state.

```tsx
import { useContent } from '@krantho/ui-react'

function ServiceCard({ slug }: { slug: string }) {
  const { fields, loading, error } = useContent(slug)
  if (loading) return <p>Loading...</p>
  return <h2>{String(fields['title'])}</h2>
}
```

### useCMSConfig

Reads the CMS configuration from the nearest `CMSProvider`.

```tsx
import { useCMSConfig } from '@krantho/ui-react'

const config = useCMSConfig()
// { contentPath, assetsPath, imagesPath, ... }
```

## Providers

### CMSProvider

Configures CMS settings for the component tree.

```tsx
import { CMSProvider } from '@krantho/ui-react'

<CMSProvider config={{ contentPath: '/content' }}>
  <App />
</CMSProvider>
```

Client components and `useContent` must render inside a `CMSProvider`.

### CMSContentProvider

Preloads content data to avoid fetch waterfalls. Client components check this context first. Set each entry's `document` to `{ collection, slug, preview }`, with `preview` from the content loader's `isPreview()`, and the client components mark what they render in an editor's preview.

```tsx
import { CMSContentProvider } from '@krantho/ui-react'

<CMSContentProvider data={{ home: homeData, about: aboutData }}>
  <CMSText slug="home" field="title" variant="h1" />
</CMSContentProvider>
```

## SEO metadata

`resolveSeoContent` resolves the SEO meta tags of a page: title, description, image, canonical URL, author, dates, Open Graph and Twitter card. Values come from the document's SEO configuration first, then its content fields, then the site's defaults. It uses `React.cache()` to deduplicate within a request.

```tsx
import { resolveSeoContent } from '@krantho/ui-react/server'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const seo = await resolveSeoContent('pages', slug)
  return {
    title: seo.title,
    description: seo.description,
    alternates: seo.canonical ? { canonical: seo.canonical } : undefined,
    openGraph: {
      title: seo.og?.title,
      description: seo.og?.description,
      images: seo.og?.image ? [seo.og.image] : undefined,
    },
  }
}
```

`resolveSeoContent` and `SeoJsonLd` read SEO configuration and the page's JSON-LD in-process through the content loader from `createContentLoader()`, from the published version of each document. No page calls the site's own API. With a loader that serves no SEO, `resolveSeoContent` falls back to the content fields and `SeoJsonLd` renders nothing.

## JSON-LD structured data

`SeoJsonLd` renders the complete JSON-LD `@graph` for a page: the site's identity entities plus the collection and document entities, in one `<script type="application/ld+json">`. Place one in each page, not in the layout: each page owns its complete graph. `SeoJsonLd` renders nothing when the document has no published version.

```tsx
import { SeoJsonLd } from '@krantho/ui-react/server'

export default async function Page({ params }) {
  const { slug } = await params
  return (
    <>
      <SeoJsonLd collection="pages" slug={slug} />
      {/* page content */}
    </>
  )
}
```

## Next.js App Router setup

Initialize the server loader in `lib/krantho.ts` (next to `requirePublished` above), then use server components in pages that import it. The loader opens the database on its first read, not at import time.

```ts title="lib/krantho.ts"
import { createContentLoader } from '@krantho/server-next'
import { initServerLoader } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

// Same database as the API route: both open it from the resolved config.
initServerLoader(createContentLoader({ config, collections }))
```

```tsx title="app/[slug]/page.tsx"
import { CMSTextServer, CMSMarkdownServer, resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import { requirePublished } from '@/lib/krantho'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const seo = await resolveSeoContent('pages', slug)
  return { title: seo.title, description: seo.description }
}

export default async function Page({ params }) {
  const { slug } = await params
  await requirePublished('pages', slug)
  return (
    <>
      <SeoJsonLd collection="pages" slug={slug} />
      <CMSTextServer collection="pages" slug={slug} field="title" variant="h1" />
      <CMSMarkdownServer collection="pages" slug={slug} />
    </>
  )
}
```

This page renders on each request. To keep pages cached until their content changes (`cache.pages: 'next-isr'`), give the route `revalidate = false` and a `generateStaticParams` that returns `[]`, so the build never reads the database. See [Rendering modes](/docs/rendering-modes).

## Server utilities

| Function | Purpose |
|----------|---------|
| `initServerLoader(loader)` | Set the content loader for server components (`createContentLoader({ config, collections })`) |
| `getCMSContent(collection, slug, options?)` | The published version of a document; a 404 `NetworkError` when nothing is published (wrapped in `React.cache`) |
| `getCMSSlugs(collection, locale?)` | Slugs of the published documents in a collection (wrapped in `React.cache`) |
| `getAllCMSContent(collection, options?)` | Every published document in a collection (wrapped in `React.cache`) |
| `getAllCMSSummaries(collection, options?)` | Every published document in a collection without its body, for navigation and card lists; nothing is rendered (wrapped in `React.cache`) |
| `loadContent({ collection, slug, locale? })` | A lower-level read, not cache-wrapped |
| `resolveSeoContent(collection, slug, locale?)` | SEO meta tags for a page (wrapped in `React.cache`) |
| `resolveJsonLd(collection, slug, locale?)` | The page's JSON-LD graph, or `null` (wrapped in `React.cache`) |

## Next steps

- Add structured data with archetypes: [@krantho/seo](/docs/package-seo)
- Define content schemas: [@krantho/schema](/docs/package-schema)
- Set up the server handler: [@krantho/server](/docs/package-server)
