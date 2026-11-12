# Getting Started

Go from zero to rendering markdown content in a krantho application.

## Quick Start

The fastest way to start a new project:

```bash
npx create-krantho my-site
cd my-site
pnpm install
pnpm dev
```

This scaffolds a project with content, schema configuration, and a working dev server. Studio is available at `http://localhost:3000/studio`.

## Prerequisites

- Node.js >= 22.9.0
- pnpm (any recent version; `corepack enable` to activate)

## Manual Installation

Install the packages for your stack:

| Stack | Install command |
|-------|----------------|
| **Next.js + React** | `pnpm add @krantho/config @krantho/schema @krantho/server-next @krantho/ui-react @krantho/seo zod` |
| **Next.js + MUI** | `pnpm add @krantho/config @krantho/schema @krantho/server-next @krantho/ui-react @krantho/ui-mui @krantho/seo zod` |
| **Next.js + Tailwind** | `pnpm add @krantho/config @krantho/schema @krantho/server-next @krantho/ui-react @krantho/ui-tailwind @krantho/seo zod` |
| **SvelteKit** | `pnpm add @krantho/config @krantho/core @krantho/schema @krantho/server-sveltekit @krantho/ui-svelte zod` |

For Next.js projects, `@krantho/ui-react` provides server components. Add `@krantho/ui-mui` or `@krantho/ui-tailwind` if you want styled client components. For SvelteKit, `@krantho/ui-svelte` covers both server and client rendering.

## Create Content

Create a content directory and your first page:

```bash
mkdir -p content/pages
```

Write `content/pages/home.md`:

```markdown
---
title: 'My Site — Welcome'
description: 'Welcome to our site. We build things that matter.'
status: published
meta-description: 'A site powered by krantho content framework.'
hero-heading: 'Build Better Content'
---

# Build Better Content

Krantho turns your markdown into rendered pages with zero boilerplate.

## features

- Server-rendered HTML with semantic CSS classes
- Frontmatter fields accessible as component props
- Section extraction from ## headings

## getting-started

Edit this page in Studio at /studio and publish it to update the live page.
```

`title`, `description` and `status` are the standard fields; other keys use kebab-case (`meta-description`, `hero-heading`, `nav-home`). The markdown body supports `## section-name` headings that become individually addressable sections.

Pages show only published content. A file without a `status` is imported as `published` (`content.defaultStatus.filesystem`); a `draft` file is imported but not shown. Once the page is in the CMS, saving in Studio leaves the live page as it is, Publish makes the current version live, and unpublishing, archiving or deleting the page takes it offline.

## Configure the Loader

Create `krantho.config.ts` at your project root:

```typescript
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'localhost', name: 'My Site', language: 'en', baseUrl: 'http://localhost:3000' },
})
```

Declare the collections in `krantho.collections.ts`, then create the API route, `app/api/[...path]/route.ts`. The route and the page loader both take the collections: whichever a fresh deployment serves first opens the database (SQLite by default) and imports `content/pages` into it:

```typescript
// krantho.collections.ts
import { join } from 'path'
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(process.cwd(), 'content', 'pages'),
  schema: z.object({ title: z.string(), description: z.string() }),
})

export const collections = { pages }
```

```typescript
// app/api/[...path]/route.ts
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE } = createApiRouteHandlers({ config, collections })
```

Create `lib/krantho.ts`. It registers the loader server components read through -- the same configuration, so the same database -- and a helper that turns an unpublished page into a 404:

```typescript
import { notFound } from 'next/navigation'
import { createContentLoader } from '@krantho/server-next'
import { getCMSContent, initServerLoader, NetworkError } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

initServerLoader(createContentLoader({ config, collections }))

/** A page's published content; a document with no published version answers 404 */
export async function requirePublished(collection: string, slug: string): Promise<CMSContent> {
  try {
    return await getCMSContent(collection, slug)
  } catch (error) {
    if (error instanceof NetworkError && error.status === 404) notFound()
    throw error
  }
}
```

Import this file from every page, so the loader is initialized before any CMS component renders.

## Render a Page

Create `app/page.tsx`:

```tsx
import { requirePublished } from '../lib/krantho'
import { CMSTextServer, CMSMarkdownServer } from '@krantho/ui-react/server'

export default async function HomePage() {
  await requirePublished('pages', 'home') // 404 unless published
  return (
    <main>
      <CMSTextServer collection="pages" slug="home" field="hero-heading" variant="h1" />
      <CMSTextServer collection="pages" slug="home" field="description" variant="body1" />
      <CMSMarkdownServer collection="pages" slug="home" section="features" />
    </main>
  )
}
```

Server components read a document by `collection` and `slug`, plus an optional `locale` (default: the site's default locale). `CMSTextServer` reads a single field and renders it as an HTML element. The `variant` prop controls which element is used (`h1` renders `<h1>`, `body1` renders `<p>`) and adds a semantic CSS class like `cms-variant-h1`.

`CMSMarkdownServer` renders the processed HTML for the full page body or a named `## section`. Without the `section` prop, it renders everything.

The rendered output uses semantic CSS classes (`cms-text`, `cms-markdown`, `cms-variant-h1`, `cms-color-primary`). Style these in your global CSS or use `@krantho/ui-tailwind` for automatic Tailwind mapping.

## Add SEO

SEO is opt-in and uses the krantho API route (see [server-next](../server-next.md)). Add a `seo` section to `krantho.config.ts`; the handler seeds it into the SEO configuration on startup:

```typescript
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'localhost', name: 'My Site', language: 'en', baseUrl: 'http://localhost:3000' },
  seo: {
    identity: 'Organization',
    collections: { pages: ['Article'] },
  },
})
```

Render meta tags and JSON-LD from a page:

```tsx
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'

export async function generateMetadata() {
  const seo = await resolveSeoContent('pages', 'home')
  return { title: seo.title, description: seo.description }
}

export default function HomePage() {
  return (
    <main>
      <SeoJsonLd collection="pages" slug="home" />
      {/* page content */}
    </main>
  )
}
```

`SeoJsonLd` renders the page's composed `@graph` as `<script type="application/ld+json">`. Both read in-process through the content loader from `createContentLoader()`, from the document's published version — no request to the site's own API. See the [SEO pipeline guide](./seo-pipeline.md) for archetypes, scopes and enrichment.

## Development Workflow

Start your dev server:

```bash
pnpm dev
```

Edit the page in Studio at `/studio` and publish it. Saving does not change the page. Server-rendered pages cache reads for `content.cache.ttlMs` (5 minutes by default); set `KRANTHO_CONTENT_CACHE_ENABLED=false` in `.env` during development to see a published change on the next page load. Markdown files are imported when the API route initializes; set `KRANTHO_CONTENT_WATCH=true` to sync file edits into the database while the dev server runs.

To add a new page, create `content/pages/about.md` and a route that renders it.

### Cached pages

In production, render each page once and serve it from the cache until Studio changes it. Set `cache: { pages: 'next-isr' }` in `krantho.config.ts`, keep content reads out of the root layout (the build prerenders the 404 page through it), and serve the `pages` collection from one optional catch-all route that the build does not render. Move `app/page.tsx` into it:

```tsx
// app/(site)/[[...slug]]/page.tsx
import { notFound } from 'next/navigation'
import { requirePublished } from '@/lib/krantho'
import { CMSTextServer, CMSMarkdownServer } from '@krantho/ui-react/server'

export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

export default async function ContentPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug: path } = await params
  if (path && path.length !== 1) notFound()
  const slug = path?.[0] ?? 'home'
  await requirePublished('pages', slug)
  return (
    <main>
      <CMSTextServer collection="pages" slug={slug} field="title" variant="h1" />
      <CMSMarkdownServer collection="pages" slug={slug} />
    </main>
  )
}
```

The build never reads the database. Each page renders on its first request; publishing in Studio refreshes exactly the pages that show the change. `next dev` reads the database on every request. See [server-next](../server-next.md#cached-pages) for the route rules and what each change refreshes.

### SvelteKit differences

In SvelteKit, use `@krantho/ui-svelte` instead of `@krantho/ui-react`. Content loading happens in `+page.server.ts` load functions rather than React server components. Create the loader in `src/lib/cms.ts` with `createContentLoader({ config, collections })` from `@krantho/server-sveltekit`, read the published version with `getPublished({ collection, slug })`, render the body with `renderContent()` from `@krantho/core`, and pass the result to your Svelte components as page data (see [server-sveltekit](../server-sveltekit.md#page-content)).

## Studio

Studio is served at `/studio`. It provides a visual interface for content editing, schema management, and SEO configuration. How it is mounted depends on the framework:

- **Next.js** -- a Studio route, `app/studio/[[...slug]]/route.ts`: `export const { GET } = createStudioRouteHandler()` from `@krantho/server-next`.
- **SvelteKit** -- a Studio route, `src/routes/studio/[...path]/+server.ts`: `export const { GET } = createStudioHandler()` from `@krantho/server-sveltekit`.
- **Express** -- mount `createStudioServer(config)` from `@krantho/server-node` for requests under `/studio`.
- **Vite** -- the `kranthoPlugin` from `@krantho/server-node/vite` serves `/studio` by itself.

## Examples

The monorepo includes example projects for different framework and styling combinations:

| Example | Stack | Port |
|---------|-------|------|
| `nextjs-mui` | Next.js + MUI | 4001 |
| `nextjs-shadcn` | Next.js + Tailwind (shadcn pattern) | 4002 |
| `sveltekit-tailwind` | SvelteKit + Tailwind | 4003 |
| `sveltekit-shadcn` | SvelteKit + Tailwind (shadcn pattern) | 4004 |
| `react-ssr` | React SSR (Vite + Express) | 4005 |
| `react-spa` | React SPA (Vite) | 4006 |

Run any example:

```bash
pnpm --filter @krantho/example-nextjs-mui run dev
```

All examples share the same `examples/content/` directory and expose Studio at `/studio`. Each dev script loads the repository root `.env` when it exists.

---

For component API details, see [ui-react](../ui-react.md). For the full architecture, see [architecture](./architecture.md).
