# krantho on SvelteKit

## Contents

- Files
- vite.config.ts
- API and Studio
- Page cache hook
- Content loader
- A page
- Sitemap and robots.txt
- Adapter

Grounded in `examples/sveltekit-shadcn` of the krantho repository. SvelteKit 2, Svelte 5, Vite.

## Files

```
krantho.config.ts
krantho.collections.ts
vite.config.ts                         # keep server packages external
svelte.config.js                       # adapter-node, or adapter-vercel on Vercel
src/hooks.server.ts                    # page cache rules and signed preview
src/lib/cms.ts                         # the content loader and render helpers
src/routes/api/[...path]/+server.ts    # the krantho API
src/routes/studio/[...path]/+server.ts  # the Studio SPA
src/routes/+layout.server.ts           # globals (navigation, footer)
src/routes/+page.server.ts             # home
src/routes/<collection>/+page.server.ts, [slug]/+page.server.ts
src/routes/sitemap.xml/+server.ts, robots.txt/+server.ts
content/<collection>/<slug>.md
```

## vite.config.ts

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  // better-sqlite3 uses __filename, which breaks inside Vite's ESM SSR bundle:
  // load the Node-only packages through Node's resolver at runtime
  ssr: {
    external: [
      'better-sqlite3',
      '@krantho/persistence-sqlite',
      '@krantho/persistence',
      '@krantho/core',
      '@krantho/schema',
      '@krantho/api',
      '@krantho/server-sveltekit',
    ],
  },
})
```

## API and Studio

```ts
// src/routes/api/[...path]/+server.ts
import { createApiHandlers } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'
import { collections } from '../../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiHandlers({
  config,
  collections,
  // Editors preview drafts through a short-lived link signed with auth.jwtSecret
  sitePreview: 'signed-url',
})
```

```ts
// src/routes/studio/[...path]/+server.ts
import { createStudioHandler } from '@krantho/server-sveltekit'

export const { GET } = createStudioHandler()
```

Signed preview links are signed and verified with `auth.jwtSecret`. Without
`KRANTHO_JWT_SECRET` each process uses one ephemeral secret of its own: enough on one dev
server, but with several instances or serverless functions a link signed by one renders the
published page on another, so set one value everywhere.

## Page cache hook

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit'
import { createPageCacheHandle } from '@krantho/server-sveltekit'
import config from '../krantho.config'

export const handle: Handle = createPageCacheHandle({ config })
```

- With `cache.pages: 'none'` it adds no headers. With `KRANTHO_CACHE_PAGES=cdn` and
  `KRANTHO_CACHE_CDN_PROVIDER` it marks each published page cacheable at the CDN, tagged with
  every document it read, and a change purges those tags. No code change between the two.
- Keep it outermost, first in `sequence()`, so it sees every header another hook adds.
- Read content inside `load`, through the loader. Never `event.fetch` another page route, and
  never read the loader's `preview` view in a hook.
- `kit.paths.base` is not supported.

## Content loader

```ts
// src/lib/cms.ts
import { renderContent } from '@krantho/core'
import type { PublishedContent } from '@krantho/core'
import type { MarkedDocument } from '@krantho/core/marks'
import { createContentLoader } from '@krantho/server-sveltekit'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

const loader = createContentLoader({ config, collections })

export interface PageContent {
  slug: string
  fields: Record<string, unknown>
  html: string
  /** The markdown `html` renders, for marking a whole body */
  body: string
  sections: Record<string, string>
  /** The document, and whether this is an editor's preview: the Live marks apply */
  doc: MarkedDocument
}

async function render(doc: PublishedContent, preview: boolean): Promise<PageContent> {
  const { html, sections } = await renderContent(doc.fields, doc.body)
  const marked = { collection: doc.collection, slug: doc.slug, preview }
  return { slug: doc.slug, fields: doc.fields, html, body: doc.body, sections, doc: marked }
}

/** The published version of a document (its current version in a preview); null when it has none */
export async function loadContent(collection: string, slug: string): Promise<PageContent | null> {
  const [doc, preview] = await Promise.all([loader.getPublished({ collection, slug }), loader.isPreview()])
  return doc ? render(doc, preview) : null
}

/** Every published document in a collection, by `order` */
export async function loadCollection(collection: string): Promise<PageContent[]> {
  const [docs, preview] = await Promise.all([loader.listPublished(collection), loader.isPreview()])
  const rendered = await Promise.all(docs.map((doc) => render(doc, preview)))
  return rendered.sort((a, b) => Number(a.fields.order ?? 99) - Number(b.fields.order ?? 99))
}

/** A page's JSON-LD graph from its published version; null when it has none */
export function loadJsonLd(collection: string, slug: string): Promise<Record<string, unknown> | null> {
  return loader.jsonLd({ collection, slug })
}
```

`getPublished({ collection, slug, locale? })` answers `null` when nothing is live;
`listPublished(collection, locale?)` returns the live version of each document.
`isPreview()` is `true` only inside an editor's verified preview request; `doc` carries it to
the Live marks.

## A page

```ts
// src/routes/about/+page.server.ts
import { error } from '@sveltejs/kit'
import { loadContent, loadJsonLd } from '$lib/cms'

export async function load() {
  const page = await loadContent('pages', 'about')
  if (!page) error(404, 'Not found')
  const jsonLd = await loadJsonLd('pages', 'about')
  return { doc: page.doc, fields: page.fields, html: page.html, body: page.body, jsonLd }
}
```

```svelte
<!-- src/routes/about/+page.svelte -->
<script lang="ts">
  import { kranthoField, markBodySections } from '@krantho/core/marks'

  let { data } = $props()
  // Escape "<" so no field value can close the script element
  const jsonLd = $derived(data.jsonLd ? JSON.stringify(data.jsonLd).replace(/</g, '\\u003c') : '')
</script>

<svelte:head>
  <title>{data.fields.title}</title>
  <meta name="description" content={String(data.fields['meta-description'] ?? data.fields.description ?? '')} />
  {#if jsonLd}{@html `<script type="application/ld+json">${jsonLd}</script>`}{/if}
</svelte:head>

<!-- Live marks: present only in an editor's preview, for Studio's Live mode -->
<h1 {...kranthoField(data.doc, 'title')}>{data.fields.title}</h1>
<div class="prose">{@html markBodySections(data.html, data.body, data.doc)}</div>
```

Mark every field and section a page renders, a card with the card's own `doc`
(`kranthoSection(doc, heading)` for a `##` section).

`@krantho/ui-svelte` offers `CMSText`, `CMSMarkdown`, `CMSImage`, `JsonLd`, `BreadcrumbJsonLd`
and `FAQSchema` components that take the values as props, if the project prefers them; pass
`doc` with `field`, `section` or `body` and they mark what they render.

Route collections the krantho way: `pages` at the root, others at `/<collection>/<slug>`
(`src/routes/<collection>/[slug]/`).

## Sitemap and robots.txt

```ts
// src/routes/sitemap.xml/+server.ts
import type { RequestHandler } from '@sveltejs/kit'

// Built from the published content; it reads no tagged content, so keep it uncached at a CDN
export const GET: RequestHandler = async ({ fetch }) => {
  const sitemap = await fetch('/api/seo/sitemap')
  const response = new Response(sitemap.body, sitemap)
  response.headers.set('cache-control', 'no-cache')
  return response
}
```

`robots.txt` is the same with `/api/seo/robots.txt`.

## Adapter

```js
// svelte.config.js — a Node server anywhere; Vercel's adapter when Vercel builds it
const { default: adapter } = await import(
  process.env.VERCEL ? '@sveltejs/adapter-vercel' : '@sveltejs/adapter-node'
)

export default { kit: { adapter: adapter() } }
```

`adapter-node` builds `node build`, which runs in any container or VM. Pages embed media as
`/api/media/<id>/image?preset=…`, which the API serves from the store; the example sets
`media.local.dir: 'static/uploads'` for the direct file URLs during development.

On a serverless host, pass the platform's `waitUntil` to `createApiHandlers` (on Vercel,
`waitUntil` from `@vercel/functions`) so a CDN purge completes after the response.
