---
title: Content and page templates
description: How a krantho site is built — a collection per page type whose schema is the Studio form, a page template per route that reads published content, and designed sections the collection declares for the body's headings. krantho.com is the worked example.
area: concepts
order: 20
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [content-model]
next: [rendering-modes, studio]
related: [first-page, content-authoring, live-editing, package-ui-react, package-schema]
status: published
---

A krantho site is built from two kinds of templates. A **content template** is a collection: the page type an editor fills in. A **page template** is a component on a route: how that page type looks. Editors own the words and the values; your code owns the layout. There is no page builder in between.

## Content templates

Give each page type its own collection, and let its schema name what the design needs. A feature page on krantho.com has a title, a one-line benefit, an icon and a link to its docs page — so its collection says exactly that:

```ts title="krantho.collections.ts"
import { join } from 'path'
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

const dir = (name: string): string => join(process.cwd(), 'content', name)
const ref = (collection: string) => z.string().describe(`ref:${collection}`)

/** Capabilities: cards on the landing page and a page each */
const features = defineCollection({
  name: 'features',
  source: 'filesystem',
  directory: dir('features'),
  path: '/features/:slug',
  sections: ['Problem', 'Approach', 'Proof', 'Limits'],
  schema: z.object({
    title: z.string(),
    description: z.string(),
    benefit: z.string(),
    order: z.number().default(99),
    icon: z.enum([
      'content',
      'admin',
      'seo',
      'cache',
      'media',
      'database',
      'skills',
      'config',
      'frameworks',
    ]),
    'proof-sample': z.string().optional(),
    'docs-page': ref('docs').optional(),
  }),
})
```

The schema is the form in `/studio`: `benefit` is a text input, `icon` a select that only offers icons the design has, `order` a number, `docs-page` a picker over the docs collection. A value the design cannot render never reaches it, because the API rejects it on save. [Content model](/docs/content-model#how-fields-become-the-admin-form) lists how each Zod type becomes a control.

Prefer specific fields over generic ones. `benefit` and `icon` tell an editor what to write and tell the page template what it gets. A generic `blocks` array would move layout decisions into Studio, where nothing checks them.

## Page templates

A page template is a server component on a route. It reads the published version of one or more documents and renders them. Wire the loader once:

```ts title="lib/krantho.ts" stack="next"
import { notFound } from 'next/navigation'
import { createContentLoader } from '@krantho/server-next'
import { getCMSContent, initServerLoader, NetworkError } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

// Pages read the database the API route opens
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

```ts title="src/lib/cms.ts" stack="sveltekit"
import { renderContent } from '@krantho/core'
import type { MarkedDocument } from '@krantho/core/marks'
import { createContentLoader } from '@krantho/server-sveltekit'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

const loader = createContentLoader({ config, collections })

/** The published version of a document, rendered; null when it has none */
export async function loadContent(collection: string, slug: string) {
  const [doc, preview] = await Promise.all([
    loader.getPublished({ collection, slug }),
    loader.isPreview(),
  ])
  if (!doc) return null
  const { html, sections } = await renderContent(doc.fields, doc.body)
  // The document and whether this is an editor's preview, for the Live marks
  const marked: MarkedDocument = { collection, slug, preview }
  return { fields: doc.fields, html, sections, body: doc.body, doc: marked }
}
```

```ts title="src/lib/cms.ts" stack="express"
import { renderContent } from '@krantho/core'
import type { MarkedDocument } from '@krantho/core/marks'
import { createContentLoader } from '@krantho/server-node'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

const loader = createContentLoader({ config, collections })

/** The published version of a document, rendered; null when it has none */
export async function loadContent(collection: string, slug: string) {
  const [doc, preview] = await Promise.all([
    loader.getPublished({ collection, slug }),
    loader.isPreview(),
  ])
  if (!doc) return null
  const { html, sections } = await renderContent(doc.fields, doc.body)
  // The document and whether this is an editor's preview, for the Live marks
  const marked: MarkedDocument = { collection, slug, preview }
  return { fields: doc.fields, html, sections, body: doc.body, doc: marked }
}
```

The loader and the API route resolve the same configuration and open the same database, so a page reads exactly what Studio published. A draft never reaches a visitor's page; a document with no published version answers 404. Only an editor's preview reads the current version, and `loader.isPreview()` says when a render is one.

Then write one page template per route. In Next.js, a list page reads the collection with `getAllCMSSummaries('features')` (the fields without the body; `getAllCMSContent` when the list shows the body) and a detail page reads one document by its slug; it sets metadata with `resolveSeoContent()` and emits the page's JSON-LD with `<SeoJsonLd>` — see [Add SEO](/docs/add-seo). In SvelteKit, a route's `+page.server.ts` calls `loadContent` in its `load` function; an Express server calls it from the render of each page.

## Designed sections

Fields hold short, structured values. Longer prose belongs in the body, divided by `##` headings. A page template can promise a design for particular headings — a **section contract**:

- A designed section gets its own treatment: the `Problem` of a feature page in a quiet band, its `Proof` beside a code sample.
- Any other section renders as ordinary prose, so an editor can add one without breaking the page.
- A missing section is left out, with no empty frame.

Declare the designed sections on the collection, in order, with `sections` in `defineCollection()` — as the `features` collection above does. The page template reads them from the collection, so the template and the content template cannot drift apart: `collections.features.sections`. `defineCollection()` rejects an empty or repeated name (case aside), and `GET /api/collections` lists each collection's `sections`, so other clients see the same list.

Pages receive the body's sections as `content.sections`, keyed by heading text and rendered to HTML:

```tsx title="app/(site)/features/[[...slug]]/page.tsx"
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { kranthoField, kranthoSection } from '@krantho/core/marks'
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import { collections } from '@/krantho.collections'
import { requirePublished } from '@/lib/krantho'
import { FeatureList } from './list'

// `/features` lists the features, `/features/<slug>` shows one
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface FeatureProps {
  params: Promise<{ slug?: string[] | undefined }>
}

// The sections the collection declares: these headings get a designed treatment, in this order
const DESIGNED = collections.features.sections

/** The feature a path names, or null for the list */
async function featureSlug({ params }: FeatureProps): Promise<string | null> {
  const { slug } = await params
  if (slug === undefined) return null
  const [name] = slug
  if (slug.length !== 1 || name === undefined) notFound()
  return name
}

export async function generateMetadata(props: FeatureProps): Promise<Metadata> {
  const slug = await featureSlug(props)
  if (slug === null) return { title: 'Features' }
  const seo = await resolveSeoContent('features', slug)
  return { title: seo.title, description: seo.description }
}

export default async function Features(props: FeatureProps) {
  const slug = await featureSlug(props)
  if (slug === null) return <FeatureList />
  const feature = await requirePublished('features', slug)
  const { fields, sections } = feature
  const designed = DESIGNED.filter((title) => sections[title])
  const other = Object.keys(sections).filter((title) => !DESIGNED.includes(title))
  return (
    <article>
      <SeoJsonLd collection="features" slug={slug} />
      <h1 {...kranthoField(feature, 'title')}>{String(fields['title'])}</h1>
      <p className="benefit" {...kranthoField(feature, 'benefit')}>
        {String(fields['benefit'])}
      </p>
      {designed.map((title) => (
        <section key={title} className={`feature-${title.toLowerCase()}`} {...kranthoSection(feature, title)}>
          <h2>{title}</h2>
          <div dangerouslySetInnerHTML={{ __html: sections[title] ?? '' }} />
        </section>
      ))}
      {other.map((title) => (
        <section key={title} className="prose" {...kranthoSection(feature, title)}>
          <h2>{title}</h2>
          <div dangerouslySetInnerHTML={{ __html: sections[title] ?? '' }} />
        </section>
      ))}
    </article>
  )
}
```

The `kranthoField` and `kranthoSection` spreads mark each field and section the template renders, with the document it belongs to. They add attributes only in an editor's preview, where Studio's Live mode uses them to edit the page in place; visitors get the same HTML without them. [Live editing](/docs/live-editing) covers marking on every stack.

The declaration states what the template designs; nothing requires a document to have every section. Keep the headings plain words, and tell editors in a short note what each one is for.

`content.sections` holds the first section of each heading, rendered. To work with the markdown instead — your own markdown pipeline, a section's position, or a lead before the first heading — split the body with the section helpers from `@krantho/core` (also browser-safe as `@krantho/core/sections`):

```ts
import { findSection, splitSections } from '@krantho/core'
import { collections } from '@/krantho.collections'

/** A feature body: its lead, its designed sections in order, and the rest as prose */
export function featureBody(body: string) {
  const { lead, sections } = splitSections(body)
  const designed = collections.features.sections.flatMap((heading) => findSection(sections, heading) ?? [])
  const other = sections.filter((section) => !designed.includes(section))
  return { lead, designed, other }
}
```

`splitSections()` returns the `lead` and each section as `{ heading, markdown }`; a `##` inside a fenced code block is not a heading. `findSection()` matches a heading without regard to case. [@krantho/core](/docs/package-core#sections) lists the helpers.

## Routes that keep builds from the database

Give every page template the same route shape: a dynamic segment whose `generateStaticParams` returns nothing, and `revalidate = false`. A list and its detail pages share one optional catch-all, as in the sample above: `app/(site)/features/[[...slug]]/page.tsx` serves `/features` without a slug and `/features/<slug>` with one. A list page on a route of its own, `app/(site)/features/page.tsx`, has no dynamic segment, so `next build` would prerender it and read the database. With `cache.pages: 'next-isr'`:

- `next build` prerenders no content page, so the build never opens the database.
- Each page renders on its first request and stays cached until a change in Studio invalidates it.
- The root layout reads no content. Read globals such as the navigation in a route-group layout, `app/(site)/layout.tsx`.

[Rendering modes](/docs/rendering-modes#cached-until-changed-isr) explains the cache and the alternatives, including SvelteKit and Express pages cached at a CDN.

Tell krantho where each collection's pages live with `path` in `defineCollection()`: a pattern such as `'/features/:slug'` (the document `index` renders at `/features`), a fixed path such as `'/'` for a landing page kept in a collection of its own, or `false` for a collection with no pages of its own, such as code samples. Without a `path`, `pages` documents render at the site root (`home` at `/`) and every other collection at `/<collection>/<slug>`. The sitemap, the draft preview, the re-render after a publish and the page's JSON-LD derive a document's URL from it.

> [!CAUTION]
> Krantho never reads your routes, only `path`. A collection served somewhere its `path` does not name still renders, but its sitemap entries, preview links and JSON-LD URLs point at the wrong page, so change the two together. The sitemap lists the published documents of every collection with pages: declare `path: false` on a collection whose documents only appear inside other pages, and it stays out. A document whose `robots-index` field is `false` is left out too; declare the field in the collection's schema, since fields the schema does not name are dropped on save.

## krantho.com as the worked example

This site runs on krantho the way your site would. Its content templates are collections in `krantho.collections.ts`, seeded from markdown files and edited in `/studio`; its page templates are server components under `app/(site)/`. Each collection's `path` names the page template column below, and the site's own links are built from the same `path` through `documentPath()`.

| Content template | Page template | Designed sections |
|---|---|---|
| `globals` (`navigation`, `announcement`, `footer`) | the shell, `app/(site)/layout.tsx` | — |
| `landing` (one document, `home`) | `/` | Install, Problem, How it works, Capabilities, “Your stack, your host”, For editors, Fit, Questions, Get started |
| `features` | `/features`, `/features/<slug>` | Problem, Approach, Proof, Limits |
| `stacks` | `/stacks`, `/stacks/<slug>` | Install, Wire, Render, Deploy |
| `hosts` | `/deploy`, `/deploy/<slug>` | Set up, Configure, Cache, Verify |
| `docs` | `/docs`, `/docs/<slug>` | free; `##` headings form the table of contents |
| `snippets` | embedded in other pages | the code is the body |
| `faq` | question blocks on product and docs pages | the answer is the body |
| `glossary` | `/docs/glossary` | — |
| `releases` | `/changelog`, `/changelog/<slug>` | Added, Changed, Fixed |
| `pages` | `/<slug>` | free |

A few choices worth copying:

- **One sample, many pages.** A code sample is a `snippets` document. A docs page embeds it with a `{{sample:<name>}}` paragraph, and the landing page renders the same document, so a sample is corrected once.
- **References as slugs.** `docs-page` on a feature holds a docs slug, picked in Studio. A page template reads that document with a second read. The site's `maybe()` helper returns nothing for a document with no published version, so the template can leave the link out rather than break it.
- **A site-specific markdown pipeline.** krantho.com renders bodies with its own pipeline — stack tabs, callouts, sample embeds — so it splits the raw body with `splitSections()` instead of using `content.sections`, and each page template reads its designed sections from its collection's `sections`.
- **Shown, not claimed.** Every page ends with **How this page is made**: the page template's file, the documents it renders with their fields, and the JSON-LD krantho generated. Open it at the bottom of this page.

## Next steps

- [Rendering modes](/docs/rendering-modes) — how pages are cached and kept fresh.
- [Your first page](/docs/first-page) — build a page template step by step.
- [Studio](/docs/studio) — where editors fill your content templates.
