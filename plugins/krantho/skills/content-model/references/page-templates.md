# Page templates

## Contents

- The route map
- The ISR route shape (Next.js)
- Reading content
- Sections as a contract
- Live marks
- Draft preview
- Not found
- SvelteKit and Express

A page template is a route plus a component that reads published documents and renders them.
The templates in `../templates/next/` are Next.js App Router server components; the same shapes
translate to SvelteKit `load` functions and Express renderers (end of this file).

## The route map

Write it down before the schemas. krantho derives a document's path with `documentPath()`:
`pages` at the root (`home` is `/`), `globals` nowhere, every other collection at
`/<collection>/<slug>`. The sitemap, **Open on site** and the page refresh after a publish
use that path, so route to match it.

| Route | Collection | Template |
|---|---|---|
| `/` | `landing/home` (singleton) or `pages/home` | landing |
| `/<slug>` | `pages` | standalone page |
| `/features`, `/features/<slug>` | `features` | list → detail |
| `/docs`, `/docs/<slug>` | `docs` | docs index and page |
| `/releases`, `/releases/<slug>` | `releases` | changelog |
| `/glossary` | `glossary` | one combined page |
| — | `globals`, `snippets`, `faq` | read by layouts and other templates |

List pages (`/features`, `/docs`, `/releases`, `/glossary`) are not documents, so krantho's
sitemap does not know them. Give each a `pages` document of the same slug (`pages/features`)
holding its title, description and intro: the sitemap then lists `/features`, editors can
change the intro, and the more specific `features/` route still renders it.

A landing singleton's conventional path is `/landing/home`. Redirect it to `/` so previews and
the post-publish refresh land on the real page:

```ts
// next.config.ts
async redirects() {
  return [{ source: '/landing/:slug*', destination: '/', permanent: false }]
},
```

## The ISR route shape (Next.js)

With `cache: { pages: 'next-isr' }` pages are rendered on first request and kept until the
Studio changes what they read; the build never reads the database. Every content route:

- is an optional catch-all (`[[...slug]]`) so the list and the detail share one route file;
- exports `revalidate = false` and a `generateStaticParams` that returns `[]`;
- rejects paths it does not know with `notFound()`;
- awaits `params` (a promise in Next.js 16).

The root layout reads no content; globals are read in `app/(site)/layout.tsx`.

## Reading content

From `@krantho/ui-react/server`, after `lib/krantho.ts` registered the loader:

- `getCMSContent(collection, slug)` — the published document: `fields`, `html` (the rendered
  body), `sections` (heading text → HTML), `rawContent` (the markdown). Throws a 404
  `NetworkError` when nothing is published; `requirePublished()` turns that into `notFound()`.
- `getAllCMSContent(collection)` — every published document; sort it yourself (`order`, then
  `title`).
- `resolveSeoContent(collection, slug)` — title, description, Open Graph and Twitter values for
  `generateMetadata`.
- `<SeoJsonLd collection slug />` — the JSON-LD graph, placed in each page.

Wrap field access in small typed helpers (`text`, `list`, `num` in `templates/next/lib/content.ts`):
fields are `Record<string, unknown>`.

## Sections as a contract

When a template places sections, declare them on the collection, in order, and read them in
the template from there:

```ts
const landing = defineCollection({
  name: 'landing',
  // …
  sections: ['Problem', 'Fit'],
  schema: z.object({ /* … */ }),
})
```

```tsx
const problem = page.sections['Problem'] ?? ''
// or, for every designed section in order: collections.landing.sections
```

`defineCollection()` rejects an empty or repeated name, and `GET /api/collections` lists each
collection's `sections` for other clients. `page.sections` maps each heading, exactly as
written, to its HTML (the first, when two share a heading). For the markdown of each section —
your own markdown pipeline, the lead before the first heading, or matching headings without
regard to case — use `splitSections()` and `findSection()` from `@krantho/core` (browser-safe as
`@krantho/core/sections`). A `##` inside a fenced code block is not a heading.

A missing section renders nothing; a section outside the list renders as prose if the template
shows it. Keep section names stable; renaming one in content hides it.

## Live marks

Studio's Live mode edits a page in place from the site's own preview. It finds what to edit
through attributes the page's elements carry in an editor's preview, and only there; visitors
never get them. Every page template marks what it renders:

- **Fields:** spread `kranthoField(doc, 'title')` on the element that shows the field.
- **Sections:** spread `kranthoSection(doc, heading)` on the element that shows a `##` section
  (the heading as written; the lead is `LEAD_SECTION`, `'__lead'`).
- **A whole body:** `markBodySections(doc.html, doc.rawContent, doc)` wraps the lead and each
  section in a `display: contents` element that carries its mark, only in a preview.
- **Cards, globals, references:** mark with *that* document, not the page's. Every mark names
  its document (`<collection>/<slug>`), so fields that share names never mix.

```tsx
import { kranthoField, kranthoSection, markBodySections } from '@krantho/core/marks'

<h1 {...kranthoField(doc, 'title')}>{text(doc, 'title')}</h1>
<Html html={doc.sections['Problem']} as="section" marks={kranthoSection(doc, 'Problem')} />
<Html html={markBodySections(doc.html, doc.rawContent, doc)} />
```

The helpers come from `@krantho/core/marks`; add `@krantho/core` to a Next.js site's
dependencies. A `CMSContent` (`getCMSContent`, `getAllCMSContent`) carries `collection`, `slug`
and `preview`, so pass it as it is. `CMSTextServer`, `CMSImageServer` and `CMSMarkdownServer`
mark themselves. In SvelteKit and Express, the load helper returns
`doc: { collection, slug, preview: await loader.isPreview() }` and the markdown `body`; the
`@krantho/ui-svelte` components take `doc` with `field`, `section` or `body`, and own markup
spreads the same helpers (`markAttributes()` for HTML strings). Styles on a body that use
`>` or `:first-child` can match differently in a preview, where the wrappers sit between the
container and its elements; prefer descendant selectors. Docs: https://krantho.com/docs/live-editing

## Draft preview

In Next.js Studio's **Open on site** turns on draft mode; every read then goes through the
preview: single documents and their JSON-LD come from the current version, unpublished changes
included, uncached, and lists stay the live documents. `loader.isPreview()` (and
`CMSContent.preview`) is `true` there. Show a banner in the site layout while
`draftMode().isEnabled`. A site that sets a `Content-Security-Policy` `frame-ancestors` (or
`X-Frame-Options`) must allow `'self'`, since Live mode frames the preview from Studio.

## Not found

- A detail route whose document has no published version answers 404 (`requirePublished`).
- A list route renders an empty state, not a 404, when the collection is empty.
- An unknown path depth (`/features/a/b`) is a 404.

## SvelteKit and Express

The collections are unchanged. Each page template becomes a `load` function (SvelteKit) or a
render step (Express) over the loader from `createContentLoader({ config, collections })`, with
`renderContent(fields, body)` from `@krantho/core` for `html` and `sections`:

```ts
// src/routes/features/[slug]/+page.server.ts
import { error } from '@sveltejs/kit'
import { loadContent, loadJsonLd } from '$lib/cms'

export async function load({ params }) {
  const feature = await loadContent('features', params.slug)
  if (!feature) error(404, 'Not found')
  return { ...feature, jsonLd: await loadJsonLd('features', params.slug) }
}
```

```ts
// src/routes/features/+page.server.ts
import { loadCollection } from '$lib/cms'

export async function load() {
  return { features: await loadCollection('features') }
}
```

The `start` skill's `references/sveltekit.md` and `references/express.md` have the `cms.ts`
helpers these use; they return `doc` and `body` for the Live marks, so pass them to the page. Caching there is `cache.pages: 'cdn'` with the page cache hook; there is no
route shape to follow, but every read must happen inside `load` (or the Express render step).
