---
title: Add SEO
description: Add Schema.org structured data and meta tags to your site.
area: get-started
order: 40
level: beginner
stacks: [next]
prerequisites: [first-page]
next: [content-model]
related: [package-seo, seo-pipeline, studio, rendering-modes]
status: published
---

This guide adds Schema.org JSON-LD and meta tags to your site. It builds on [Your first page](/docs/first-page): the API route (`app/api/[...path]/route.ts`) and the content loader that `lib/krantho.ts` registers for the helpers both seed the SEO configuration into the database.

The one-install bundles (`@krantho/next`, `@krantho/sveltekit`, `@krantho/node`) already include `@krantho/seo`. On a modular install, add it:

```bash
pnpm add @krantho/seo
```

## Seed archetypes from code

Add a `seo` section to `krantho.config.ts`. The first request seeds it into the SEO configuration, whether it reaches the API route or a page, so the first page a fresh database renders already carries the archetypes. With the default `seo.seedMode: 'seed'`, rows already in the database are kept, so edits made in Studio survive a restart.

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: {
    domain: 'krantho.com',
    name: 'Krantho',
    language: 'en',
    baseUrl: 'https://krantho.com',
    logo: 'https://krantho.com/brand/mark.svg',
    description: 'A CMS library for content sites built in your own codebase.',
  },
  seo: {
    identity: 'Organization',
    collections: { docs: ['Article', 'BreadcrumbList'] },
  },
})
```

- `site` is the site's identity, set once: the organization's name, URL, logo, description, `alternateName` and `sameAs` profile links come from here, and every value can be set from the environment (`KRANTHO_SITE_LOGO` …).
- `identity` is the Schema.org type that describes the whole site.
- `collections` maps a collection name to the document types its entries publish.
- `configDir` seeds the same scopes from YAML files, one per entity, when a type list is not enough. krantho.com does that with `configDir: './krantho.seo'`, which also gives its site entities their properties.

After first boot, edit both in Studio under **Structure › Scopes & archetypes**: **Site entities** and **Collection archetypes**. The `site` values from `krantho.config.ts` show there read-only; change them in the configuration.

The server checks this configuration when it starts. A type Schema.org does not have or has retired stops it, with an error naming the setting; a value a search engine recommends but the site does not set, such as a logo, is logged as a warning. Run the same check before a build:

```bash
pnpm run seo validate --config
```

`pnpm run seo validate --all` goes further and checks the graph of every published page, exiting non-zero on errors; [@krantho/seo](/docs/package-seo#checked-at-start-and-before-a-build) lists every place the checks run, including after a deploy.

## Render meta tags and JSON-LD

`@krantho/ui-react/server` provides two helpers:

```tsx title="app/(site)/docs/[slug]/page.tsx"
import { requirePublished } from '../../../../lib/krantho'
import {
  CMSTextServer,
  CMSMarkdownServer,
  resolveSeoContent,
  SeoJsonLd,
} from '@krantho/ui-react/server'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const seo = await resolveSeoContent('docs', slug)
  return { title: seo.title, description: seo.description }
}

export default async function DocsPage({ params }: Props) {
  const { slug } = await params
  await requirePublished('docs', slug)
  return (
    <main>
      <SeoJsonLd collection="docs" slug={slug} />
      <CMSTextServer collection="docs" slug={slug} field="title" variant="h1" />
      <CMSMarkdownServer collection="docs" slug={slug} />
    </main>
  )
}
```

- `resolveSeoContent(collection, slug)` returns the title, description, image, canonical URL, Open Graph and Twitter fields. Values come from the document's SEO properties first, then its published content fields, then the site defaults.
- `<SeoJsonLd collection slug />` renders the page's composed `@graph` as a `<script type="application/ld+json">` tag. Pass `structure` with the breadcrumb trail the page renders, and the graph states the same trail — see [Page structure](/docs/package-seo#page-structure-and-faq).

Both read in-process through the content loader from `createContentLoader()`, from the document's published version — no request to the site's own API. While an editor previews the page (Live mode or **Open on site** in Studio, Next.js draft mode), they read the draft instead, so the editor sees the draft's title, description and JSON-LD. The document's own SEO settings — what enrichment and **Edit the graph** in Studio's Data mode write — have no versions: the live page uses them as soon as they are saved, with no publish.

Use them in each page — every page renders its own meta tags and its own `@graph` — not in the root layout, which Next.js also renders for its 404 page at build time.

With `cache: { pages: 'next-isr' }`, an SEO change saved in Studio refreshes the cached pages that show it, the same way a publish does — see [Rendering modes](/docs/rendering-modes).

## What appears in page source

View source and you see one JSON-LD block holding the site entities and the document entities together. For this site's installation page, a `docs` document at `/docs/installation` (abbreviated):

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://krantho.com/#business",
      "name": "Krantho",
      "logo": "https://krantho.com/brand/mark.svg"
    },
    {
      "@type": "Article",
      "@id": "https://krantho.com/docs/installation/#article",
      "headline": "Installation",
      "author": { "@id": "https://krantho.com/#business" },
      "publisher": { "@id": "https://krantho.com/#business" },
      "dateModified": "2026-09-30T10:12:00.000Z",
      "mainEntityOfPage": "https://krantho.com/docs/installation"
    },
    {
      "@type": "WebPage",
      "@id": "https://krantho.com/docs/installation/#webpage",
      "mainEntity": { "@id": "https://krantho.com/docs/installation/#article" },
      "breadcrumb": { "@id": "https://krantho.com/docs/installation/#breadcrumb" }
    }
  ]
}
</script>
```

Each value has one source. The site entity takes its name, logo and description from the `site` section, unless the site entities in **Structure › Scopes & archetypes** set their own. The Article takes `headline` from `title`, `description` from `meta-description` or `description`, `datePublished` from a `date` field; `datePublished`, `dateModified`, `inLanguage` and `url` come from the document's version and its page, so authors only fill what needs human judgment. With no Person configured, the organization is the author. Studio shows every value with where it comes from — in the editor's Data mode and in **Structure › Graph** — and checks the graph against Schema.org and each search engine's rules. The editor's **Publish** question lists the same errors and warnings for the version it publishes, without ever stopping the publish. `GET /api/seo/resolved/:collection/:slug` returns the same values, each with the scope that set it: the site, the collection, a URL pattern, the document, krantho's computation, or a link to another entity. `GET /api/seo/findings` checks every published page at once and lists the search features each page can appear in.

The document's URL in the graph is its page: the collection's `path` from `defineCollection()`, or without one the site root for `pages` and `/<collection>/<slug>` for other collections — the same URL the sitemap lists (see [Content model](/docs/content-model#edit-details-alongside-the-page)). A document whose collection is declared with `path: false` has no page, and its graph is empty. Declare the fields the graph reads in the collection's schema — `date` or `meta-description` when you use them — since an import keeps only the fields the schema declares.

## Sitemap dates and IndexNow

Each sitemap entry's `lastmod` is when its page last changed: the time an editor last published it in Studio, or — for a page imported from a markdown file and never edited — the file's last git commit. The commit dates come from `content/dates.json`, which your build writes before it compiles the site:

```js title="scripts/content-dates.mjs"
// Run before the framework build: node scripts/content-dates.mjs && next build
import { join } from 'node:path'
import { generateContentDates } from '@krantho/server'

await generateContentDates(join(import.meta.dirname, '..', 'content'))
```

It needs the repository's full history. A CI checkout is shallow by default — set `fetch-depth: 0` on `actions/checkout`, or every file carries the latest commit's date and nothing is written. Add `content/dates.json` to `.gitignore`.

To let Bing and the other IndexNow engines know about changes as they happen, set an IndexNow key — 8 to 128 letters, digits or dashes, such as the output of `openssl rand -hex 16`:

```ts title="krantho.config.ts"
export default defineKranthoConfig({
  seo: { indexNow: { key: '<your key>' } },
})
```

The key is public by design: IndexNow reads it at `https://<your site>/<key>.txt`, so route that address to the API next to `robots.txt` and `sitemap.xml` — in Next.js, `{ source: '/:key([a-zA-Z0-9-]+).txt', destination: '/api/seo/indexnow/:key' }`. krantho then notifies IndexNow when a page is published, unpublished or deleted, and sends every page after the first import. A deploy can submit the whole sitemap with `submitIndexNow` from `@krantho/server`.

## Next steps

- Let the configured LLM fill missing meta descriptions and Schema.org properties with **Fill what's missing** in Studio's **Structure** — see [Studio guide](/docs/studio#structure). Generated document values are saved as drafts; publish them after review.
- Understand how the site, collection, route and document scopes combine — see [@krantho/seo](/docs/package-seo#scope-hierarchy).
- Generate structured data, FAQ markup and `llms.txt` from YAML at build time — see the [SEO pipeline guide](/docs/seo-pipeline).
