---
title: "@krantho/core"
description: Load and render markdown content, and the change events, cache tags and CDN headers that keep cached pages fresh.
area: reference
order: 102
level: advanced
prerequisites: [content-model]
next: [package-ui-react]
related: [package-schema, package-persistence, rendering-modes, deploy-cdn, live-editing]
status: published
---

The content engine. It loads markdown, parses YAML frontmatter into `fields`, splits `## headings` into sections and caches the results. It also holds the framework-free parts of page caching: the change events every write announces, the cache tag vocabulary and the CDN header helpers. It has no UI framework dependencies.

## Install

```bash
pnpm add @krantho/core
```

## Load content

The quickest way to read content is `createContentResolver`. It reads markdown files from disk, parses fields and body, and can validate them against a Zod schema. Its second argument, `defaultLocale`, is the locale of a file whose frontmatter names none: pass the site's `site.defaultLocale`.

```ts
import { createContentResolver } from '@krantho/core/content'
import { defineCollection, defineConfig } from '@krantho/schema'
import { z } from 'zod'

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: 'content/pages',
  schema: z.object({ title: z.string(), description: z.string().optional() }),
})

const config = defineConfig({ collections: { pages } })
const content = createContentResolver(config, { defaultLocale: 'en' })

const about = await content.get('pages', 'about')
if (about) {
  console.log(about.fields['title'])
  console.log(about.html)
}

const allPages = await content.list('pages', { status: 'published' })
```

This works in a Next.js `page.tsx`, a SvelteKit `+page.server.ts` or any Node.js context. It needs no server and no database.

## ContentResult

The content engine's `loadContent(slug)` gives you a `ContentResult` (the resolver above returns a similar document, with `fields`, `body`, `html` and `sections`). The parsed YAML lives in `fields` (inside the CMS, frontmatter is called fields). The markdown body is rendered to `html`, and named `## sections` are extracted into a map.

```ts
interface ContentResult {
  fields: Record<string, unknown>
  content: string                   // raw markdown
  html: string                      // rendered HTML
  sections: Record<string, string>  // section name -> HTML
  metadata: ContentMetadata
  loading: boolean
  error: ContentError | null
}
```

Read fields and sections:

```ts
const result = await engine.loadContent('about')
console.log(result.fields['title'])
console.log(result.sections['Why it exists'])
```

## ContentEngine

For more control, use `ContentEngineFactory`. You provide a content loader (any `IPersistenceAdapter` works), and the engine handles caching, markdown processing and @ notation.

```ts
import { ContentEngineFactory } from '@krantho/core'
import { FileSystemAdapter } from '@krantho/persistence-fs'

const loader = new FileSystemAdapter({ contentPath: 'content/pages', defaultLocale: 'en' })
const engine = ContentEngineFactory.create(loader)

const result = await engine.loadContent('about')
```

The cache is off in development by default. In production, results are cached in memory with TTL eviction.

## MarkdownProcessor

The built-in processor converts markdown to HTML, extracts `## sections` and expands @ notation. You can replace it with your own implementation.

```ts
import { ContentEngineFactory, type IMarkdownProcessor } from '@krantho/core'

const custom: IMarkdownProcessor = {
  async parse(content) { return '<p>custom</p>' },
  async extractSections(content) { return {} },
  processAtNotation(content, fields) { return content },
}

const engine = ContentEngineFactory.create(loader, {}, custom)
```

## Render published content

`renderContent(fields, body)` renders a markdown body: it expands `@field` references from `fields`, converts the body to HTML and extracts the `## sections`. It is the same rendering the content engine uses. Server-rendered pages use it on the published documents they read through `createContentLoader` (from the server adapters):

```ts
import { renderContent } from '@krantho/core'

const doc = await loader.getPublished({ collection: 'pages', slug: 'about' })
if (doc) {
  const { html, sections } = await renderContent(doc.fields, doc.body)
}
```

A site served under a path (`https://example.github.io/docs-site`) passes `basePath: '/docs-site'`: links and images in the markdown that start at the site's root, such as `/guide` or `/images/logo.svg`, get the path in front, as do the `src` and `href` of raw `<img>` and `<a>` tags. Absolute and relative URLs are left as written.

`getPublished` returns `null` when the document has nothing published. Its result is a `PublishedContent` (`collection`, `slug`, `locale`, `fields`, `body`, `publishedAt`); the loader implements `IPublishedContentLoader` (`getPublished(ref)`, `listPublished(collection, locale?)`, `listPublishedSummaries(collection, locale?)`, `isPreview()`). `listPublishedSummaries` returns each document without its `body`: a page that only lists documents (a navigation, a card list) reads it. An omitted `locale` is the site's default locale. `isPreview()` is `true` only while an editor previews the page, and `false` for visitors and for any render a cache keeps.

The same loader implements `IPublishedSeoLoader`, the SEO data pages read in-process: `seoProperties(configId)` returns the primary entity's properties of an SEO configuration (`site`, `doc:<collection>/<slug>`, …), and `jsonLd(ref)` returns a page's JSON-LD graph composed from its published version, or `null` when nothing is published. Both are plain data, so `@krantho/core` stays free of the SEO packages. [@krantho/ui-react](/docs/package-ui-react) reads them through `resolveSeoContent()` and `<SeoJsonLd>`.

## Sections

`sections.ts` is the one section model of a body, shared by the content engine, the server, the tools and your page templates. It has no imports, so a browser bundle can import it on its own from `@krantho/core/sections`; the main `@krantho/core` entry exports the same functions.

```ts
import { findSection, joinSections, replaceSection, splitSections } from '@krantho/core/sections'

const split = splitSections(body)
// { lead: 'Text before the first ## heading', sections: [{ heading: 'Problem', markdown: '…' }, …] }

const proof = findSection(split, 'proof') // the first section headed "Proof", compared without case
const edited = joinSections(replaceSection(split, 0, 'A new problem statement.'))
```

| Export | Purpose |
|--------|---------|
| `splitSections(body)` | Split a body into its `lead` (the markdown before the first `##`) and its `sections`, each `{ heading, markdown }` in order |
| `joinSections(split)` | Put a split body back together: the lead, then `## heading` and its markdown per section, separated by one blank line |
| `replaceSection(split, index, markdown)` | The split body with one section's markdown replaced; throws a `RangeError` for an index out of range |
| `findSection(split, heading)` | The first section with this heading, compared without case, or `undefined` |
| `LEAD_SECTION` | `'__lead'`, the name a page uses for the lead when it marks sections |
| `BodySection`, `SplitBody` | The types of a section and of a split body |

A heading is a line that starts with `##` and a space, outside a fenced code block (```` ``` ```` or `~~~`). The heading text is kept as written, without the `##` and any trailing `#`s. Each part is trimmed, so `joinSections(splitSections(body))` gives the body back up to whitespace. Sections that share a heading stay separate in `sections`. The `sections` record of a rendered document is built from the same split: each heading maps to the HTML of the markdown under it, and the first of two sections with the same heading wins.

## Live marks

Studio's Live mode lets an editor edit a page in place. It finds what to edit through attributes that the page's elements carry in an editor's preview, and only there. `marks.ts` builds them. It is pure, so a browser bundle can import it on its own from `@krantho/core/marks`; the main `@krantho/core` entry exports the same names. [Live editing](/docs/live-editing) shows how to mark a page on each stack.

```ts
import { kranthoField, kranthoSection, markAttributes } from '@krantho/core/marks'

// `preview` comes from the content loader: await loader.isPreview()
const doc = { collection: 'features', slug: 'seo', preview: true }

kranthoField(doc, 'title')
// { 'data-krantho-document': 'features/seo', 'data-krantho-field': 'title' }

markAttributes(kranthoSection(doc, 'Approach'))
// ' data-krantho-document="features/seo" data-krantho-section="Approach"'

kranthoField({ ...doc, preview: false }, 'title')
// {}
```

| Export | Purpose |
|--------|---------|
| `kranthoField(doc, field)` | The attributes for the element that renders a field; empty outside a preview |
| `kranthoSection(doc, heading)` | The attributes for the element that renders a `##` section, by its heading as written, or the lead (`LEAD_SECTION`); empty outside a preview |
| `markAttributes(marks)` | The marks as attribute text for a server template, escaped; `''` when there are none |
| `markBodySections(html, body, doc)` | A rendered body with its lead and each `##` section wrapped in a `<div style="display:contents">` that carries the section's marks |
| `DOCUMENT_MARK`, `FIELD_MARK`, `SECTION_MARK` | The attribute names: `data-krantho-document`, `data-krantho-field`, `data-krantho-section` |
| `MarkedDocument` | `{ collection, slug, preview? }`: the document a value belongs to, and whether the render is a preview |
| `KranthoMarks` | The attributes to spread on an element |

Every mark names its document as `<collection>/<slug>`, because a page also shows other documents, such as cards and globals, whose fields share names. `markBodySections` pairs the nth `<h2` of the HTML with the nth heading of the markdown body. When the counts differ, for example because of a raw HTML heading or a `##` inside a blockquote, it returns the HTML unmarked. Outside a preview every helper leaves the markup as it is, so visitors get the same HTML whether a page marks or not.

`ContentData`, the content the client components in `@krantho/ui-react` read, has an optional `document` (a `MarkedDocument`). A host that preloads content for them fills it, so they can mark what they render.

## @ notation

When krantho renders a body (the content engine, `renderContent()`), an `@field` reference is replaced with the value of that field of the same document. A reference to a field the document lacks stays as written. `content.atNotation` switches it for the API's content engine (default `true`); `renderContent()` takes an `atNotation` option (default `true`). A static site passes `content.atNotation` to its pages through `site.rendering` ([@krantho/static](/docs/package-static)), so `false` keeps a body's `@name` as written.

`processAtNotation()` is a separate helper for link shorthand: it expands `@changelog` to a page link and `@content-graph.png` to an image. The content engine does not call it; use it on markdown you process yourself.

```ts
import { processAtNotation } from '@krantho/core'

const md = 'Read the @changelog and see the @content-graph.png'
const expanded = processAtNotation(md)
// 'Read the [changelog](/changelog) and see the ![Content Graph](/images/content-graph.png)'
```

## Client-side loading

In the browser, `ClientFetchLoader` loads content over HTTP.

```ts
import { ContentEngineFactory, ClientFetchLoader } from '@krantho/core'

const loader = new ClientFetchLoader('/content/pages')
const engine = ContentEngineFactory.create(loader, { cacheEnabled: true })
const result = await engine.loadContent('about')
```

## Utility functions

| Function | Purpose |
|----------|---------|
| `renderContent(fields, body, options?)` | Render a markdown body to HTML and `## sections`, with @ notation |
| `splitFrontmatter(data, defaultLocale, defaultStatus?)` | Separate system fields (`status`, `locale`) from content fields; a file that names no locale gets `defaultLocale` |
| `variantToTag(variant)` | Map a semantic variant (`h2`, `body1`) to an HTML tag |
| `ContentEngineUtils.safeLoadContent(engine, slug)` | Load content with error handling (never throws) |
| `ContentEngineUtils.extractField(fields, field)` | Extract a field value as a string |

## Error handling

Content errors carry typed codes:

```ts
interface ContentError {
  code: 'NOT_FOUND' | 'PARSE_ERROR' | 'NETWORK_ERROR' | 'CACHE_ERROR' | 'VALIDATION_ERROR'
  message: string
  details?: Record<string, unknown>
}
```

The engine never throws. Errors come back in `ContentResult.error` with a code, a message and optional details.

## Change events

Every committed write announces a `ContentChange`. You receive them through `onContentChange` on the server handler (see [@krantho/server](/docs/package-server#handler-options)).

```ts
// The shape of ContentChange, exported as a type from @krantho/core
type ContentChange =
  | { kind: 'document'; collection: string; slug: string; locale?: string; live: boolean }
  | { kind: 'seo'; configId?: string }   // one SEO configuration, or all of them
  | { kind: 'media'; id: string }
  | { kind: 'site' }                     // checkpoint restore, bundle import, startup import
```

`live` is `false` for a save, which leaves the published page as it is, and `true` for a publish, unpublish, archive or delete. On the filesystem adapter, which keeps no history, a save to a published file is live at once and announces `live: true`. A `ContentChangeListener` is called once per committed write, and may return a promise.

## Cache tags

Cached pages are refreshed by tag. Each page read registers the tags of what it read, and `invalidationsFor(change)` maps a change to the tags it invalidates. A cached page is kept until something it shows changes, and then only that page is refreshed. Page caching itself is set up by `cache.pages`; see [Rendering modes](/docs/rendering-modes) and [Deploy behind a CDN](/docs/deploy-cdn).

| Read | Tags it registers |
|------|-------------------|
| One document | `documentReadTags(collection, slug)`: `SITE_TAG` and `documentTag(collection, slug)` |
| A collection list | `listReadTags(collection)`: `SITE_TAG` and `collectionTag(collection)` |
| An SEO configuration | `seoReadTags(configId)`: `SITE_TAG`, `seoTag()` and `seoTag(configId)` |
| A page's JSON-LD | `jsonLdTags(collection, slug)`: `SITE_TAG`, the document (which holds its own SEO in its versioned metadata), `seoTag()`, and the site, collection and URL-pattern (`k:seo:route`, which any `route:` configuration change marks stale) configurations |

`SITE_TAG` (`k:site`) is on every read, so a site-wide change refreshes every page. Tags are lowercase printable ASCII with no comma or space, at most 120 bytes; a longer tag is shortened with a hash.

```ts
import { documentPath, invalidationsFor } from '@krantho/core'

// What a change invalidates, and how
invalidationsFor({ kind: 'document', collection: 'pages', slug: 'about', live: true })
// [{ tags: ['k:d:pages:about'], mode: 'expire' }, { tags: ['k:c:pages'], mode: 'stale' }]

// Where a document is rendered: its collection's `path`, else `pages` at the root
// (`home` is `/`), `globals` nowhere, other collections under their name
documentPath({ name: 'pages' }, 'home')                          // '/'
documentPath({ name: 'features' }, 'seo')                        // '/features/seo'
documentPath({ name: 'globals' }, 'navigation')                  // null
documentPath({ name: 'hosts', path: '/deploy/:slug' }, 'vercel') // '/deploy/vercel'
documentPath({ name: 'docs', path: '/docs/:slug' }, 'index')     // '/docs'
documentPath({ name: 'faq', path: false }, 'hosting')            // null
```

`documentPath()` takes a collection from `defineCollection()` — or any `{ name, path }` — and is the one answer to where a document renders: the sitemap, the draft preview, the Next.js re-render after a publish and a page's JSON-LD all use it. `rendersPages(collection)` says whether a collection has pages at all.

`expire` is for the document an editor just changed: the next request renders it fresh. `stale` is for broad changes (a collection, a global, the site, an SEO configuration other than a document's): the next request gets the old page while it renders again. A save that leaves the live version as it is, and a media change, invalidate nothing. Pages show the live version, and they embed a media URL, never the asset record.

## CDN cache headers

Pure functions that build the response headers of a page a CDN caches, and of an editor's preview. `@krantho/server` applies them for you under `cache.pages: 'cdn'`; call them yourself only when you serve pages some other way.

```ts
import { cdnCacheHeaders, previewHeaders } from '@krantho/core'

cdnCacheHeaders({
  tags: ['k:site', 'k:d:pages:about'],
  provider: 'gcp',                  // 'vercel' | 'cloudfront' | 'gcp'
  sMaxAgeSec: 86400,
  staleWhileRevalidateSec: 604800,
  tagHeader: 'x-krantho-cache-tag', // read only for 'cloudfront'
})
// {
//   'Cache-Control': 'public, max-age=0, must-revalidate',
//   'CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
//   'Cache-Tag': 'k:site,k:d:pages:about',
// }

previewHeaders()
// { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
```

The page is never cached in the browser (`max-age=0`), so a purge reaches every visitor. Each provider gets its lifetime and tags in its own headers:

| `provider` | Lifetime | Tag header |
|------------|----------|------------|
| `vercel` | `Vercel-CDN-Cache-Control` | `Vercel-Cache-Tag` |
| `cloudfront` | `s-maxage` inside `Cache-Control` (CloudFront reads lifetimes only from there) | the `tagHeader` you pass |
| `gcp` | `CDN-Cache-Control` | `Cache-Tag` |

A page with no tags gets no tag header. `pageTagBudget(tags, max = 50)` fits the tags into the strictest per-response limit across these CDNs. It drops duplicates; beyond the budget, document tags give way to their collection's tag, and then the rest is cut. `k:site` is always kept.

## Site paths

`resolveSitePath(path, base)` resolves `path` the way a browser resolves it against `base`. It returns the `URL`, or `null` when the result leaves `base`'s origin, does not parse, or could be read as another host (a decoded path starting with `//`, or an encoded backslash). The site preview uses it so a preview link never points off the site.

```ts
import { resolveSitePath } from '@krantho/core'

resolveSitePath('/features/../about', 'http://localhost')?.pathname // '/about'
resolveSitePath('/..//evil.example', 'http://localhost')             // null
```

## Timestamps

`toUtcTimestamp(written)` reads what a person wrote as a moment and returns it as UTC with a Z, or `null` when it is not a moment. A date alone becomes midnight UTC, a time with an offset becomes UTC, and a time with no zone is read as UTC. `normalizeTimestamps(schema, value)` applies it to every value a JSON Schema declares `format: 'date-time'`. Studio and the API use it, so a timestamp you write in any of these forms is stored the same way.

```ts
import { toUtcTimestamp } from '@krantho/core'

toUtcTimestamp('2026-10-10')                // '2026-10-10T00:00:00Z'
toUtcTimestamp('2026-10-10T11:30:00+02:00') // '2026-10-10T09:30:00Z'
toUtcTimestamp('2026-02-30')                // null
```

## Next steps

- Render content with React components: [@krantho/ui-react](/docs/package-ui-react)
- Define content schemas: [@krantho/schema](/docs/package-schema)
- Choose a persistence backend: [@krantho/persistence](/docs/package-persistence)
