---
title: Your first page
description: Create a markdown content file and render it with krantho.
area: get-started
order: 30
level: beginner
stacks: [next]
prerequisites: [installation]
next: [add-seo]
related: [content-model, templates, rendering-modes, studio, package-ui-react]
status: published
---

This guide walks you through creating a content file, configuring the loader and rendering your first page in a Next.js app. Complete [Installation](/docs/installation) first.

> [!NOTE]
> This page uses Next.js. SvelteKit and Express wire the same pieces — a configuration, the collections, an API route and a content loader — through their own adapters; see [@krantho/server](/docs/package-server) and [Rendering modes](/docs/rendering-modes).

## Create a content file

Create the content directory and a markdown file for your home page:

```bash
mkdir -p content/pages
```

```markdown title="content/pages/home.md"
---
title: 'My Site - Welcome'
description: 'A site powered by krantho content framework.'
status: published
hero-heading: 'Build Better Content'
---

Welcome to our site. We build things that matter.

# Build Better Content

Krantho turns your markdown into rendered pages with zero boilerplate.

## features

- Server-rendered HTML with semantic CSS classes
- Frontmatter fields accessible as component props
- Section extraction from ## headings
```

Frontmatter keys use kebab-case for multi-word names. The `title`, `description` and `status` fields are standard on every page. The markdown body supports `## section-name` headings that become individually addressable sections.

Pages show only published content. A file without a `status` counts as `published`; a `draft` file is imported but not shown.

## Configure the loader

Create `krantho.config.ts` at your project root:

```typescript title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'localhost', name: 'My Site', language: 'en', baseUrl: 'http://localhost:3000' },
})
```

Declare the collections in `krantho.collections.ts`, then create the API route. The route and the page loader both take the collections: whichever a fresh deployment serves first opens the database (SQLite by default) and imports `content/pages` into it. The schema lists every field the page reads — unknown author fields are rejected, so declare `hero-heading`. The root `status` seed directive controls initial publication and is never an author schema field.

```typescript title="krantho.collections.ts"
import { join } from 'path'
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(process.cwd(), 'content', 'pages'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    'hero-heading': z.string().optional(),
  }),
})

export const collections = { pages }
```

```typescript title="app/api/[...path]/route.ts"
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE } = createApiRouteHandlers({ config, collections })
```

To serve Studio at `/studio`, add one more route. Passing the configuration lets `/studio` send visitors to the OpenID Connect sign-in first when you set `auth.oidc.studioEntry: 'redirect'` (see [Studio guide](/docs/studio#gate-admin-behind-sign-in)); without it, Studio shows its own sign-in page when sign-in is on:

```typescript title="app/studio/[[...slug]]/route.ts"
import { createStudioRouteHandler } from '@krantho/server-next'
import config from '../../../krantho.config'

export const { GET } = createStudioRouteHandler({ config })
```

Create `lib/krantho.ts`. It points server components at the same database and adds a helper that answers 404 for a page that is not published:

```typescript title="lib/krantho.ts"
import { notFound } from 'next/navigation'
import { createContentLoader } from '@krantho/server-next'
import { getCMSContent, initServerLoader, NetworkError } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

initServerLoader(createContentLoader({ config, collections }))

export async function requirePublished(collection: string, slug: string): Promise<CMSContent> {
  try {
    return await getCMSContent(collection, slug)
  } catch (error) {
    if (error instanceof NetworkError && error.status === 404) notFound()
    throw error
  }
}
```

Import this file from your pages so the loader initializes before any CMS component renders.

Load krantho's server packages from `node_modules` instead of bundling them, as the scaffolder and the example apps do:

```typescript title="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', '@krantho/server', '@krantho/server-next'],
}

export default nextConfig
```

## Render the page

Create the home page:

```tsx title="app/page.tsx"
import { requirePublished } from '../lib/krantho'
import { CMSTextServer, CMSMarkdownServer } from '@krantho/ui-react/server'

export default async function HomePage() {
  await requirePublished('pages', 'home')
  return (
    <main>
      <CMSTextServer collection="pages" slug="home" field="hero-heading" variant="h1" />
      <CMSTextServer collection="pages" slug="home" field="description" variant="body1" />
      <CMSMarkdownServer collection="pages" slug="home" section="features" />
    </main>
  )
}
```

Server components find a page by `collection` and `slug`. `CMSTextServer` reads a single frontmatter field and renders it as an HTML element. The `variant` prop controls which tag is used: `h1` renders `<h1>`, `body1` renders `<p>`.

`CMSMarkdownServer` renders processed HTML for the full page body or a named `## section`. Without the `section` prop, it renders everything.

## Start the dev server

```bash
pnpm dev
```

Open `http://localhost:3000`. You see your heading, intro text and the features list rendered from markdown.

Open Studio at `http://localhost:3000/studio`, find the page under **Site** and edit it. **Save draft** stores a new version and leaves the live page as it is; **Publish** makes the saved version live, and the status chip then reads **Live**. Unpublishing, archiving or deleting the page takes it offline. Live mode, the editor's first mode, shows the page with your saved changes in it (Next.js draft mode), and **Open on site** opens it in a tab, while visitors keep the published page.

Server-rendered pages cache reads for `content.cache.ttlMs` (5 minutes by default). Set `KRANTHO_CONTENT_CACHE_ENABLED=false` in `.env` while developing to see a published change on the next page load. Markdown files are imported when the API route or the loader first opens the database. Set `KRANTHO_CONTENT_WATCH=true` to sync file edits into the database while the dev server runs: the API route watches the files once it has started, on its first request.

## Cache pages in production

In production, render each page once and serve it from the cache until Studio changes it. Set `cache: { pages: 'next-isr' }` in `krantho.config.ts`, move `app/page.tsx` into an optional catch-all route (`app/(site)/[[...slug]]/page.tsx`) whose `generateStaticParams` returns nothing, and keep content reads out of the root layout. The build then never reads the database: each page renders on its first request, and a publish refreshes the pages that read what changed. [Rendering modes](/docs/rendering-modes) has the route shape and the CDN options.

## How it works

The rendered output uses semantic CSS classes such as `cms-text`, `cms-markdown` and `cms-variant-h1`. Style these in your global CSS, or use `@krantho/ui-mui` for Material UI styling. [Semantic styles](/docs/semantic-styles) lists the classes.

Each `CMSTextServer` call is an async React Server Component. It reads the published version of the page in-process, through the content loader, from the database the API route uses — no request to the site's own API — and returns a plain HTML element.
