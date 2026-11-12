# @krantho/core

UI-agnostic content engine that loads markdown files with YAML frontmatter, parses them into structured `ContentResult` objects, and caches the output with TTL eviction. Zero UI framework imports. Provides the type system, interfaces, and processing pipeline that all other krantho packages build on.

## Context

A CMS core must not know about React, MUI, Svelte, or any rendering layer. If it does, every UI package drags in the wrong framework's types and every adapter couples to implementation details. `@krantho/core` enforces this boundary: it owns content loading, markdown processing, frontmatter extraction, section splitting, caching, and semantic style tokens. UI packages consume `ContentResult` and map `SemanticStyle` to their own primitives.

## Rationale

- **Dependency injection over hard-wired I/O.** `ContentEngine` takes an `IContentLoader`, not a filesystem path. This makes it testable without mocks and lets the same engine run server-side (via `@krantho/persistence-fs`) or client-side (via `ClientFetchLoader` and fetch).
- **One rendering implementation.** `renderContent()` turns fields and a markdown body into HTML and sections. `ContentEngine` uses it, and so do server-rendered pages reading published content through an `IPublishedContentLoader`.
- **Semantic styles, not CSS.** `SemanticStyle` uses tokens like `variant: 'h2'` and `weight: 'bold'` instead of `fontSize: '1.5rem'`. Adapters translate these to framework-specific props.
- **@ notation as a first-class feature.** Content authors write `@services` or `@profile-photo.jpg` in markdown. The processor expands these to links and images before HTML conversion, keeping content files portable.
- **Cache disabled in development.** `DEFAULT_CONFIG.cacheEnabled` is `false` unless `NODE_ENV === 'production'`, so file edits are reflected immediately during development.

## Installation

```bash
pnpm add @krantho/core
```

## Architecture

```
src/
  index.ts                        # Public barrel (explicit named exports)
  types.ts                        # All interfaces, constants, config defaults
  shared-types.ts                 # NetworkError, ContentData
  content-engine.ts               # ContentEngine, ContentEngineFactory, MarkdownProcessor, renderContent, utilities
  content-resolver.ts             # createContentResolver — filesystem-only Tier 1 resolver
  type-guards.ts                  # TypeGuards namespace (runtime validation)
  semantic-style-utils.ts         # variantToTag function
  frontmatter-utils.ts            # splitFrontmatter utility
  sections.ts                     # splitSections, joinSections, replaceSection, findSection (subpath: @krantho/core/sections)
  marks.ts                        # Preview-only Live marks: kranthoField, kranthoSection, markAttributes, markBodySections (subpath: @krantho/core/marks)
  composition/
    index.ts                      # Page composition barrel
    resolve.ts                    # resolvePageContent — multi-slug page assembly
    params.ts                     # resolveParams — route parameter resolution
    types.ts                      # SlugResult, SectionsResult, CollectionResult, etc.
  loaders/
    client-fetch-loader.ts        # IContentLoader via fetch API (browser)
    seo-loader.ts                 # loadSeoJson, loadSeoText (subpath: @krantho/core/seo)
  processors/
    at-notation-processor.ts      # Standalone @ notation expansion
  content-change.ts               # ContentChange, ContentChangeListener
  cache-tags.ts                   # Cache tag vocabulary, read tags, invalidationsFor, documentPath, collectionBasePath, rendersPages, pageCollection (subpath: @krantho/core/cache-tags)
  cache-headers.ts                # cdnCacheHeaders, previewHeaders, pageTagBudget
  site-path.ts                    # resolveSitePath
```

### Subpath Exports

The package has these entry points:

| Import | Entry |
|--------|-------|
| `@krantho/core` | Main barrel — all client-safe exports |
| `@krantho/core/content` | `createContentResolver` — server-only, uses `node:fs` |
| `@krantho/core/sections` | `splitSections`, `joinSections`, `replaceSection`, `findSection`, `LEAD_SECTION` — pure, no imports, browser-safe on its own (also in the main barrel) |
| `@krantho/core/marks` | `kranthoField`, `kranthoSection`, `markAttributes`, `markBodySections`, the mark names, `MarkedDocument`, `KranthoMarks` — pure, imports only `sections.ts`, browser-safe on its own (also in the main barrel) |
| `@krantho/core/cache-tags` | the cache tag vocabulary, `invalidationsFor`, and where documents render (`documentPath`, `collectionBasePath`, `rendersPages`, `pageCollection`) — pure, type-only imports, browser-safe on its own; Studio reads page URLs from it (also in the main barrel) |
| `@krantho/core/seo` | `loadSeoJson`, `loadSeoText` — server-only, uses `node:fs` |

The content resolver and SEO loaders are **not** re-exported from the main barrel to avoid pulling `node:fs` into client bundles.

## API Reference

### Classes

#### `ContentEngine`

```typescript
class ContentEngine implements IContentEngine {
  constructor(
    config: ContentEngineConfig,
    contentLoader: IContentLoader,
    markdownProcessor: IMarkdownProcessor,
  )

  loadContent(slug: string): Promise<ContentResult>
  getConfig(): ContentEngineConfig
  clearCache(): void
  getCacheStats(): CacheStats
}
```

Loads a markdown file by slug, parses frontmatter with `gray-matter`, optionally expands @ notation, converts to HTML with `marked`, extracts `##` sections, and returns a `ContentResult`. Results are cached in-memory with TTL eviction when `cacheEnabled` is true.

The returned `ContentResult` uses **`fields`** (not `frontmatter`) for the parsed YAML data. At the filesystem boundary, frontmatter becomes `fields` — this is the CMS convention throughout the API, Studio, and persistence layers.

#### `ContentEngineFactory`

```typescript
class ContentEngineFactory {
  static create(
    contentLoader: IContentLoader,
    config?: Partial<ContentEngineConfig>,
    markdownProcessor?: IMarkdownProcessor,
  ): IContentEngine
}
```

Factory that merges partial config with `DEFAULT_CONFIG` and defaults to `MarkdownProcessor`. Core does not provide a default loader — consumers must supply one (e.g., `FileSystemAdapter` from `@krantho/persistence-fs`).

#### `MarkdownProcessor`

```typescript
class MarkdownProcessor implements IMarkdownProcessor {
  parse(content: string): Promise<string>
  extractSections(content: string): Promise<Record<string, string>>
  processAtNotation(content: string, fields: Record<string, unknown>): string
}
```

`parse` converts markdown to HTML via `marked`. `extractSections` splits the body with `splitSections()` (see [Sections](#sections)) and returns a map of heading to rendered HTML; a `##` line inside a fenced code block is not a heading, and when two sections share a heading the first is the one the map holds. `processAtNotation` replaces `@key` references with values from the fields record.

#### `ClientFetchLoader`

```typescript
class ClientFetchLoader implements IContentLoader {
  constructor(contentPath: string)
  exists(slug: string): Promise<boolean>
  read(slug: string): Promise<string>
  getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>>
}
```

Browser-side loader that fetches `.md` files over HTTP. Uses `HEAD` requests for `exists` and `getMetadata`.

### Content Resolver

#### `createContentResolver`

```typescript
function createContentResolver(
  config: ResolverConfig,
  options: { defaultLocale: string },
): ContentResolver
```

Creates a Tier 1 content resolver for filesystem-only usage. `defaultLocale` is the locale of a file whose frontmatter declares none: the site's default locale, as set in `krantho.config.ts` as `site.defaultLocale`; the resolver has no fallback of its own. Reads markdown files from the filesystem, parses YAML frontmatter, validates against Zod schemas (if provided), and returns `ResolvedDocument` objects. No server, no API, no database required.

Works in Next.js `page.tsx`, SvelteKit `+page.server.ts`, or any Node.js context.

```typescript
interface ContentResolver {
  get(collection: string, slug: string): Promise<ResolvedDocument | null>
  list(collection: string, options?: ListOptions): Promise<ResolvedDocument[]>
}

interface ResolvedDocument {
  meta: {
    collection: string
    slug: string
    locale: string
    version: 1
    status: string
    source: 'filesystem'
    changedBy: null
    createdAt: string
  }
  fields: Record<string, unknown>
  body: string
  html: string
  sections: Record<string, string>
}
```

The `list` method supports filtering and pagination:

```typescript
interface ListOptions {
  status?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}
```

The resolver config accepts a `Map` of collection definitions. Each collection can optionally specify a `directory` (filesystem path) and a `schema` with a `safeParse` method (compatible with Zod schemas):

```typescript
interface ResolverConfig {
  collections: Map<string, ResolverCollection> | ReadonlyMap<string, ResolverCollection>
}

interface ResolverCollection {
  name: string
  directory?: string | undefined
  schema?: {
    safeParse: (data: unknown) => {
      success: boolean
      data?: unknown
      error?: { issues: Array<{ path: PropertyKey[]; message: string }> }
    }
  } | undefined
}
```

### Functions

#### `renderContent`

```typescript
function renderContent(
  fields: Record<string, unknown>,
  body: string,
  options?: RenderContentOptions,
): Promise<RenderedContent>

interface RenderContentOptions {
  atNotation?: boolean              // substitute @field references from fields (default: true)
  processor?: IMarkdownProcessor    // default: MarkdownProcessor
}
```

Renders a markdown body for display: @-notation substitution from `fields`, HTML, and the `##` sections (`IMarkdownProcessor.extractSections`, the rendering seam). The one implementation of content rendering — `ContentEngine` uses it, and so do server-rendered pages that read published content (`@krantho/ui-react/server`, the SvelteKit examples) and the server's import, file watcher and content migration (with `atNotation: false`), which store the sections it returns.

```typescript
import { renderContent } from '@krantho/core'

const { html, sections } = await renderContent(doc.fields, doc.body)
```

#### Sections

```typescript
import { splitSections, joinSections, replaceSection, findSection, LEAD_SECTION } from '@krantho/core/sections'

interface BodySection {
  readonly heading: string   // the heading text as written, without `##`, trailing `#`s or surrounding spaces
  readonly markdown: string  // the markdown under the heading, up to the next `##`, trimmed
}
interface SplitBody {
  readonly lead: string      // the markdown before the first `##` heading, trimmed
  readonly sections: readonly BodySection[]
}
const LEAD_SECTION = '__lead'

function splitSections(body: string): SplitBody
function joinSections(split: SplitBody): string
function replaceSection(split: SplitBody, index: number, markdown: string): SplitBody
function findSection(split: SplitBody | readonly BodySection[], heading: string): BodySection | undefined
```

The one section model for a document body, shared by the server, the UI packages, Studio and page templates. `sections.ts` is pure, with no imports, so a browser bundle can import `@krantho/core/sections` without pulling in the rest of core.

- **Headings.** A line matching `/^##\s+(.+?)\s*#*\s*$/` outside a fenced code block. A fence opens with ```` ``` ```` or `~~~` and closes with the same marker, at least as long; a `##` line inside one is text.
- **`splitSections`** splits a body into its lead and its sections, in order. Sections that share a heading stay separate.
- **`joinSections`** puts a split body back together: the lead, then `## heading` and its markdown per section, parts separated by one blank line, empty parts dropped. `joinSections(splitSections(body))` gives the body back with its parts trimmed and single blank lines between them.
- **`replaceSection`** returns the split body with the section at `index` holding new (trimmed) markdown; nothing else changes. An index out of range throws `RangeError`.
- **`findSection`** is the lookup by name: the first section whose heading matches, ignoring case.
- **`LEAD_SECTION`** is the name a page uses for the lead when it marks sections.

`MarkdownProcessor.extractSections` and so `renderContent` build `ContentDocument.sections` from `splitSections`. A collection's designed sections -- the headings its page template gives their own treatment -- are declared on the collection (`sections` in `defineCollection()`, see [schema.md](schema.md)).

```typescript
import { findSection, splitSections } from '@krantho/core/sections'

const split = splitSections(doc.body)
const problem = findSection(split, 'problem')?.markdown
const prose = split.sections.filter((s) => s.heading !== 'Problem')
```

#### Marks

```typescript
import {
  DOCUMENT_MARK, FIELD_MARK, SECTION_MARK,
  kranthoField, kranthoSection, markAttributes, markBodySections,
} from '@krantho/core/marks'
import type { KranthoMarks, MarkedDocument } from '@krantho/core/marks'

const DOCUMENT_MARK = 'data-krantho-document'
const FIELD_MARK = 'data-krantho-field'
const SECTION_MARK = 'data-krantho-section'

interface MarkedDocument {
  readonly collection: string
  readonly slug: string
  readonly preview?: boolean | undefined   // whether the render is an editor's preview
}
type KranthoMarks = Readonly<Partial<Record<typeof DOCUMENT_MARK | typeof FIELD_MARK | typeof SECTION_MARK, string>>>

function kranthoField(doc: MarkedDocument | null | undefined, field: string): KranthoMarks
function kranthoSection(doc: MarkedDocument | null | undefined, heading: string): KranthoMarks
function markAttributes(marks: KranthoMarks): string
function markBodySections(html: string, body: string, doc: MarkedDocument | null | undefined): string
```

The attributes Studio's Live mode reads to find which element renders which field or `##` section of which document. They exist only in an editor's preview: every helper returns nothing (`{}`, `''`, or the HTML unchanged) unless `doc.preview` is true, so production HTML never carries them.

- **Document.** Every mark carries `data-krantho-document="<collection>/<slug>"`, the document the value belongs to. A page renders other documents too (cards, globals) whose fields share names; Live mode matches marks by `(document, field)` and `(document, section)`.
- **`kranthoField` / `kranthoSection`** return the attributes to spread on an element (React and Svelte 5 alike). A section is named by its heading as written; the lead is `LEAD_SECTION` (`'__lead'`).
- **`markAttributes`** renders marks as attribute text for a server template (` data-krantho-…="…"`, values escaped for `&`, `"`, `<`, `>`), or `''`.
- **`markBodySections`** wraps a whole rendered body's lead and each section in `<div … style="display:contents">` carrying its section mark; `display: contents` generates no box, so layout is unchanged. The nth `<h2` of the HTML pairs with the nth heading of `splitSections(body)`; when the counts differ (a raw HTML heading, a `##` inside a blockquote) the HTML is returned unmarked. An empty lead gets no wrapper.

`ui-react` and `ui-svelte` components call these; page templates call them on their own markup, in client components too (Studio's Live mode rescans the page for a few seconds after it loads, so marks a client render adds are found). `CMSContent` (ui-react) and the SvelteKit examples' `PageContent.doc` are `MarkedDocument`s; `examples/react-ssr` sets `ContentData.document` instead.

#### `processAtNotation`

```typescript
function processAtNotation(content: string, config?: AtNotationConfig): string

interface AtNotationConfig {
  imagePath?: string | undefined   // default: '/images'
  assetPath?: string | undefined   // default: '/assets'
  linkPath?: string | undefined    // default: '/'
}
```

Standalone @ notation processor. Expands three patterns:
- `@page-name` to `[page-name](/page-name)` (page links)
- `@photo.jpg` to `![Photo](/images/photo.jpg)` (images with auto-generated alt text)
- `@doc.pdf` to `[doc.pdf](/assets/doc.pdf)` (asset links)

Image extensions recognized: `jpg`, `jpeg`, `png`, `gif`, `webp`. Asset extensions: `pdf`, `doc`, `docx`.

#### `splitFrontmatter`

```typescript
function splitFrontmatter(
  data: Record<string, unknown>,
  defaultLocale: string,
  defaultStatus?: string,
): {
  fields: Record<string, unknown>
  status: string
  locale: string
}
```

Separates system fields (`status`, `locale`) from content fields in parsed frontmatter. System fields are extracted into the return value; a file that declares no locale gets `defaultLocale` (the site's default locale; there is no fallback), and one that declares no status gets `defaultStatus`, which falls back to the exported `DEFAULT_FRONTMATTER_STATUS` (`'published'`). All other keys are passed through as `fields`. Used by the content resolver to split YAML data into document meta vs. content fields.

`FileSystemAdapter` passes the values a deployment set as `site.defaultLocale` and `content.defaultStatus.filesystem`, so the filesystem boundary's defaults are configurable without `@krantho/core` depending on `@krantho/config`.

#### `variantToTag`

```typescript
function variantToTag(variant?: string): string
```

Maps a semantic variant string to its corresponding HTML tag. Returns `'p'` as the default when no variant is provided or when the variant is unrecognized.

| Variant | Tag |
|---------|-----|
| `h1`-`h6` | `h1`-`h6` |
| `body1`, `body2` | `p` |
| `caption` | `span` |

### Page Composition

#### `resolvePageContent`

```typescript
function resolvePageContent(
  page: PageDefinition,
  context: ResolveContext,
  params?: Record<string, string>,
): Promise<ResolvedPageContent>

interface ResolveContext {
  loader: IPublishedContentLoader
}

```

Resolves all content references in a page definition (from `@krantho/schema`'s `definePage`) in parallel. Deduplicates slug loads within a single resolution. Handles three content reference types: `slug` (single content file), `sections` (named `##` sections from a file), and `collection` (list of items with filtering/sorting/pagination). Returns a `ResolvedPageContent` map keyed by the names in the page definition.

Every reference names its collection explicitly. The loader reads published documents and lists only, and tracks the corresponding cache dependencies. Document and collection results include metadata; section results contain section name, title and HTML.

#### `resolveParams`

```typescript
function resolveParams(template: string, params?: Record<string, string>): string
```

Resolves dynamic `:param` segments in a template string using provided params. Throws if a referenced param is missing.

```typescript
resolveParams('blog/:slug', { slug: 'my-post' })  // 'blog/my-post'
resolveParams(':slug', { slug: 'hello' })          // 'hello'
resolveParams('home', {})                          // 'home' (no params)
```

### Namespaces

#### `ContentEngineUtils`

```typescript
ContentEngineUtils.safeLoadContent(engine: IContentEngine, slug: string): Promise<ContentResult>
ContentEngineUtils.validateContentResult(result: unknown): result is ContentResult
ContentEngineUtils.extractField(fields: Record<string, unknown>, field: string): string
```

`safeLoadContent` wraps `loadContent` with error handling, returning a `ContentResult` with error details instead of throwing. `validateContentResult` checks that a value has every `ContentResult` property. `extractField` extracts a field value as a string (returns empty string if the field is missing).

### Subpath: `@krantho/core/seo`

Server-only SEO file loaders. Uses `node:fs` synchronously. Default base path is `content/seo/generated` relative to `process.cwd()`.

```typescript
import { loadSeoJson, loadSeoText } from '@krantho/core/seo'

function loadSeoJson<T = Record<string, unknown>>(
  filename: string,
  basePath?: string,
): T | null

function loadSeoText(
  filename: string,
  basePath?: string,
): string | null
```

Both return `null` if the file is missing or unreadable. `loadSeoJson` also returns `null` for invalid JSON. In development mode, a warning is logged when files are missing.

### Cache tags

The vocabulary cached pages are refreshed by: what a page read registers, and what a change invalidates. `@krantho/server-next` tags its Next.js cache reads with it; the server content loader records the same tags into a page request (`runPageRequest()` in `@krantho/server`), and a CDN purges by them.

| Tag | Registered by a read of | Invalidated by |
|---|---|---|
| `SITE_TAG` (`k:site`) | anything: every read carries it | a site-wide change (import, checkpoint restore) |
| `documentTag(collection, slug)` | one document, in every locale | that document going live, unpublished or deleted |
| `collectionTag(collection)` | a collection list | a document in the collection going live, unpublished or deleted |
| `seoTag(configId)`, `seoTag()` | SEO properties, a page's JSON-LD (`jsonLdTags(collection, slug)`) | that SEO configuration's change; `seoTag('route')` (`k:seo:route`, on every page's JSON-LD) for any URL-pattern (`route:`) configuration, marked stale; `seoTag()` for every configuration |

Tags are lowercase printable ASCII with no comma or space, and at most 120 bytes -- a longer one is shortened with a hash -- so they fit every cache target's limits.

Each read registers a fixed set, so every cache tags a read the same way:

| Read | Tags |
|---|---|
| one document | `documentReadTags(collection, slug)` -- `[SITE_TAG, documentTag(collection, slug)]` |
| a collection list | `listReadTags(collection)` -- `[SITE_TAG, collectionTag(collection)]` |
| an SEO configuration | `seoReadTags(configId)` -- `[SITE_TAG, seoTag(), seoTag(configId)]` |
| a page's JSON-LD | `jsonLdTags(collection, slug)` -- the site, the document (which holds its own SEO in its versioned metadata), and the site, collection and URL-pattern (`k:seo:route`) configurations it is composed from |

```typescript
import { documentPath, invalidationsFor } from '@krantho/core'

// What a change invalidates, and how
invalidationsFor({ kind: 'document', collection: 'pages', slug: 'about', live: true })
// [{ tags: ['k:d:pages:about'], mode: 'expire' }, { tags: ['k:c:pages'], mode: 'stale' }]

// Where a document is rendered: its collection's declared `path`, else the default rule
documentPath({ name: 'pages' }, 'home') // '/'
documentPath({ name: 'services' }, 'audit') // '/services/audit'
documentPath({ name: 'globals' }, 'navigation') // null
documentPath({ name: 'hosts', path: '/deploy/:slug' }, 'vercel') // '/deploy/vercel'
documentPath({ name: 'docs', path: '/docs/:slug' }, 'index') // '/docs'
documentPath({ name: 'landing', path: '/' }, 'home') // '/'
documentPath({ name: 'faq', path: false }, 'refunds') // null

// Where a collection's pages live, to label the collection
collectionBasePath({ name: 'pages' }) // '/'
collectionBasePath({ name: 'services' }) // '/services'
collectionBasePath({ name: 'hosts', path: '/deploy/:slug' }) // '/deploy'
collectionBasePath({ name: 'globals' }) // null
```

`documentPath(collection, slug)` is the one answer to "where does this document render": the sitemap, the editor's **Open on site**, the Next.js page refresh and a page's JSON-LD all call it. It takes a `PageCollection` -- `{ name, path? }`, which a `Collection` from `defineCollection()` satisfies -- and reads the `path` the collection declares (`CollectionPath`: a pattern holding `:slug`, where the slug `index` drops the `/:slug` segment; a fixed path every document renders at; or `false` for no pages). Without a `path`, `pages` render at the site root (`home` is `/`), `globals` have no page, and other collections render under their name. `rendersPages(collection)` answers whether a collection has pages at all, without a slug. `pageCollection(collections, name)` looks a collection up by name in a site's collections, and places a name the site does not define by the default rule. See [schema.md](schema.md#definecollectionconfig-collectiont) for the option.

`expire` is for the document an editor just changed: the next request renders it fresh. `stale` is for broad changes -- a collection, a global, the site: the next request is served the old page while it renders again. A save that keeps the live version (`live: false`) and a media change invalidate nothing: pages show the live version, and embed a media URL, never the asset record. `ContentChange` and `ContentChangeListener` are the change events `@krantho/api` announces for every committed write (see [api.md](api.md#content-changes)).

### CDN cache headers

Pure functions that build the response headers of a page a CDN caches, and of an editor's preview. The page cache rules in `@krantho/server` (`servePageRequest()`) apply them; see the [page caching guide](guides/page-caching.md) for the providers.

```typescript
type CdnProvider = 'vercel' | 'cloudfront' | 'gcp'

interface CdnCacheHeaderOptions {
  tags: readonly string[]          // every read that rendered the page
  provider: CdnProvider
  sMaxAgeSec: number               // fresh at the CDN
  staleWhileRevalidateSec: number  // then served stale while it re-renders
  tagHeader: string                // the CloudFront distribution's tag header
}
```

- `cdnCacheHeaders(options)` keeps the page out of the browser (`max-age=0`, so a purge reaches every visitor) and gives the CDN its lifetime, `s-maxage=…, stale-while-revalidate=…`. For `vercel` and `gcp` that is `Cache-Control: public, max-age=0, must-revalidate` plus the CDN's own control header with `public, s-maxage=…, stale-while-revalidate=…` (`Vercel-CDN-Cache-Control` for `vercel`, `CDN-Cache-Control` for `gcp`). CloudFront reads lifetimes only from `Cache-Control`, so for `cloudfront` there is no control header and `Cache-Control` is `public, max-age=0, s-maxage=…, stale-while-revalidate=…` (browsers ignore `s-maxage`; `must-revalidate` would forbid serving stale while revalidating). Every provider also gets the tag header with the budgeted tags, comma-joined (`Vercel-Cache-Tag`, the configured `tagHeader` for `cloudfront`, `Cache-Tag` for `gcp`). No tags, no tag header.
- `pageTagBudget(tags, max = 50)` fits a page's tags into the strictest per-response limit across CDNs. Duplicates are dropped; beyond the budget, document tags give way to their collection's tag (a change to any document in it then refreshes the page), then the rest is cut. `k:site` is always kept.
- `previewHeaders()` returns `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`: an editor's preview is never stored and never indexed.

```typescript
import { cdnCacheHeaders } from '@krantho/core'

const page = {
  tags: ['k:site', 'k:d:pages:about'],
  sMaxAgeSec: 86400,
  staleWhileRevalidateSec: 604800,
  tagHeader: 'x-krantho-cache-tag',
}

cdnCacheHeaders({ ...page, provider: 'gcp' })
// {
//   'Cache-Control': 'public, max-age=0, must-revalidate',
//   'CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
//   'Cache-Tag': 'k:site,k:d:pages:about',
// }

cdnCacheHeaders({ ...page, provider: 'cloudfront' })
// {
//   'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
//   'x-krantho-cache-tag': 'k:site,k:d:pages:about',
// }
```

### Site paths

`resolveSitePath(path, base)` resolves `path` the way a browser resolves it against `base` and returns the `URL`, or `null` when it leaves `base`'s origin, does not parse, or could be read as another host: a path whose decoded form starts with `//` (`/..//host`, and `/../\host`, whose raw backslash the URL parser normalises to `/`) or contains an encoded backslash (`%5C`). The site preview endpoint uses it so a signed link never points off the site.

```typescript
import { resolveSitePath } from '@krantho/core'

resolveSitePath('/services/../about', 'http://localhost')?.pathname // '/about'
resolveSitePath('/..//evil.example', 'http://localhost') // null
```

### Timestamps

`toUtcTimestamp(written)` reads what a person wrote as a moment and returns it as UTC with a Z — `2026-10-10` → `2026-10-10T00:00:00Z`, `2026-10-10T11:30:00+02:00` → `2026-10-10T09:30:00Z`, a time with no zone read as UTC — or `null` when it is not a moment (an impossible date, other text). `normalizeTimestamps(schema, value)` applies it to every value a JSON Schema declares `format: 'date-time'`, through properties, items and `anyOf`/`oneOf`, and leaves everything else as written. `@krantho/schema`'s `validateDocument` calls it before the strict schema.

```typescript
import { toUtcTimestamp } from '@krantho/core'

toUtcTimestamp('2026-10-10') // '2026-10-10T00:00:00Z'
toUtcTimestamp('2026-02-30') // null
```

### Error Handling

#### Error classes

```typescript
class NetworkError extends Error {
  constructor(message: string, public status?: number)
}
```

#### Error cause chain

Errors thrown by the content engine use the standard `Error.cause` property to chain the original error. When `ContentEngine.loadContent()` catches a lower-level error (filesystem, YAML parse, markdown render), the resulting `ContentError` in `ContentResult` includes the original error as `cause`. This preserves the full stack trace for debugging while presenting a clean error code at the surface.

### Constants

```typescript
const DEFAULT_CONFIG: ContentEngineConfig  // cacheEnabled = NODE_ENV === 'production'
const VALID_VARIANTS: readonly ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body1', 'body2', 'caption']
const VALID_COLORS: readonly ['primary', 'secondary', 'error', 'warning', 'info', 'success', 'inherit']
const VALID_ALIGNS: readonly ['left', 'center', 'right', 'justify']
const VALID_WEIGHTS: readonly ['light', 'regular', 'medium', 'bold']
const VALID_SIZES: readonly ['small', 'medium', 'large']
```

### Interfaces

#### `ContentResult`

```typescript
interface ContentResult {
  fields: Record<string, unknown>   // Parsed YAML frontmatter (not "frontmatter")
  content: string                   // Raw markdown (after @ notation processing)
  html: string                      // Full HTML output
  sections: Record<string, string>  // Section name -> HTML
  metadata: ContentMetadata
  loading: boolean
  error: ContentError | null
}
```

#### `ContentMetadata`

```typescript
interface ContentMetadata {
  slug: string
  lastModified: Date
  size: number
  processingTime: number   // Milliseconds
}
```

#### `ContentError`

```typescript
interface ContentError {
  code: 'NOT_FOUND' | 'PARSE_ERROR' | 'NETWORK_ERROR' | 'CACHE_ERROR' | 'VALIDATION_ERROR'
  message: string
  details?: Record<string, unknown>
}
```

#### `SemanticStyle`

```typescript
interface SemanticStyle {
  variant?: (typeof VALID_VARIANTS)[number] | undefined
  color?: (typeof VALID_COLORS)[number] | undefined
  align?: (typeof VALID_ALIGNS)[number] | undefined
  weight?: (typeof VALID_WEIGHTS)[number] | undefined
  size?: (typeof VALID_SIZES)[number] | undefined
}
```

#### `ContentEngineConfig`

```typescript
interface ContentEngineConfig {
  contentPath: string
  cacheEnabled: boolean
  cacheTTL: number         // Milliseconds
  maxCacheSize: number     // Max entries
  enableAtNotation: boolean
}
```

#### `CacheEntry`

```typescript
interface CacheEntry {
  data: ContentResult
  timestamp: number
}
```

#### `CacheStats`

```typescript
interface CacheStats {
  size: number
  hitRate: number
  totalRequests: number
  totalHits: number
  totalMisses: number
}
```

#### `IContentEngine`

```typescript
interface IContentEngine {
  loadContent(slug: string): Promise<ContentResult>
  getConfig(): ContentEngineConfig
  clearCache(): void
  getCacheStats(): CacheStats
}
```

#### `IContentLoader`

```typescript
interface IContentLoader {
  exists(slug: string): Promise<boolean>
  read(slug: string): Promise<string>
  getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>>
  listSlugs?(): Promise<string[]>
}
```

#### `ContentRef`

```typescript
interface ContentRef {
  collection: string
  slug: string
  locale?: string    // omitted: the site's default locale
}
```

#### `PublishedContent`

A document's live (published) version, as server-rendered pages read it.

```typescript
interface PublishedContent {
  collection: string
  slug: string
  locale: string
  fields: Record<string, unknown>
  body: string          // raw markdown body
  publishedAt: Date     // when the live version was written
}
```

#### `IPublishedContentLoader`

The read surface for server-rendered pages. `createContentLoader()` in `@krantho/server` implements it over the configured persistence adapter.

```typescript
interface IPublishedContentLoader {
  /** The live version of a document, or null when nothing is live */
  getPublished(ref: ContentRef): Promise<PublishedContent | null>
  /** The live version of every document in a collection that has one */
  listPublished(collection: string, locale?: string): Promise<PublishedContent[]>
  /** The live version of every document in a collection that has one, without the body */
  listPublishedSummaries(collection: string, locale?: string): Promise<PublishedSummary[]>
  /** Whether the current render is an editor's preview, reading current versions; always false for visitors and for a render a cache keeps */
  isPreview(): Promise<boolean>
}
```

`PublishedSummary` is `Omit<PublishedContent, 'body'>`. A page that only lists documents (a navigation, a card list) reads `listPublishedSummaries`: the adapter answers with the fields and no body (a database selects those columns alone; the filesystem adapter reads the file and drops the body in JavaScript), and nothing is rendered. Like `listPublished`, it lists the live versions in an editor's preview too: a preview's lists show what visitors see, and the preview view differs only in reading uncached.

`isPreview()` is the one preview signal page templates read on every server package: Next.js draft mode in `@krantho/server-next`, the page request scope of a verified signed link in `@krantho/server` (its `preview` view answers `true`). It feeds `MarkedDocument.preview`.

#### `IPublishedSeoLoader`

The pages' SEO, read in-process from the published version. `createContentLoader()` in `@krantho/server` implements it next to `IPublishedContentLoader`.

```typescript
interface IPublishedSeoLoader {
  /** A stored SEO configuration's properties (`site`, `collection:<name>`, `doc:<collection>/<slug>`); empty when none */
  seoProperties(configId: string): Promise<Record<string, unknown>>
  /** A page's JSON-LD graph, composed from its published version; null when nothing is live */
  jsonLd(ref: ContentRef): Promise<Record<string, unknown> | null>
}
```

#### `RenderedContent`

```typescript
interface RenderedContent {
  content: string                   // the body after @-notation substitution
  html: string
  sections: Record<string, string>  // ## sections, keyed by heading
}
```

#### `IMarkdownProcessor`

```typescript
interface IMarkdownProcessor {
  parse(content: string): Promise<string>
  extractSections(content: string): Promise<Record<string, string>>
  processAtNotation(content: string, fields: Record<string, unknown>): string
}
```

#### `ContentData`

```typescript
interface ContentData {
  fields: Record<string, unknown>
  content: string
  html: string
  sections: Record<string, string>
  loading: boolean
  error: NetworkError | null
  /** The document this content is, for preview-only Live marks; a host that preloads content fills it */
  document?: MarkedDocument | undefined
}
```

#### Composition Types

```typescript
interface SlugResult {
  fields: Record<string, unknown>
  html: string
  sections: Record<string, string>
}

interface SectionItem {
  name: string
  title: string
  html: string
}

type SectionsResult = readonly SectionItem[]

interface CollectionItem {
  slug: string
  fields: Record<string, unknown>
  html: string
  excerpt?: string | undefined
}

type CollectionResult = readonly CollectionItem[]

type ResolvedPageContent = Record<string, SlugResult | SectionsResult | CollectionResult>
```

## Usage

### Server-side with filesystem persistence

```typescript
import { ContentEngineFactory } from '@krantho/core'
import { FileSystemAdapter } from '@krantho/persistence-fs'

const loader = new FileSystemAdapter({ contentPath: 'content/pages', defaultLocale: 'en' })
const engine = ContentEngineFactory.create(loader)

const result = await engine.loadContent('about')
console.log(result.fields['title'])
console.log(result.sections['Our Team'])
```

### Client-side with fetch

```typescript
import { ContentEngineFactory, ClientFetchLoader } from '@krantho/core'

const loader = new ClientFetchLoader('/content/pages')
const engine = ContentEngineFactory.create(loader, { cacheEnabled: true })

const result = await engine.loadContent('services')
console.log(result.fields['description'])
```

### Content resolver (filesystem-only, no server)

```typescript
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

// Load a single document
const about = await content.get('pages', 'about')
if (about) {
  console.log(about.meta.status)      // 'published'
  console.log(about.fields['title'])   // from frontmatter
  console.log(about.html)             // rendered markdown
}

// List all published documents
const allPages = await content.list('pages', { status: 'published' })
```

### Custom markdown processor

```typescript
import { ContentEngineFactory, type IMarkdownProcessor } from '@krantho/core'

const customProcessor: IMarkdownProcessor = {
  async parse(content) { /* custom rendering */ return '<p>custom</p>' },
  async extractSections(content) { /* custom splitting */ return {} },
  processAtNotation(content, fields) { return content },
}

const engine = ContentEngineFactory.create(loader, {}, customProcessor)
```

### Splitting frontmatter

```typescript
import { splitFrontmatter } from '@krantho/core'

const data = { title: 'About', status: 'draft', locale: 'nb', order: 1 }
const { fields, status, locale } = splitFrontmatter(data, 'en')
// fields: { title: 'About', order: 1 }
// status: 'draft'
// locale: 'nb'
```

### Variant to HTML tag

```typescript
import { variantToTag } from '@krantho/core'

variantToTag('h2')      // 'h2'
variantToTag('body1')   // 'p'
variantToTag('caption') // 'span'
variantToTag()          // 'p' (default)
```

### @ notation processing

```typescript
import { processAtNotation } from '@krantho/core'

const md = 'Check out @services and our @team-photo.jpg'
const expanded = processAtNotation(md)
// 'Check out [services](/services) and our ![Team Photo](/images/team-photo.jpg)'

// Custom paths
const custom = processAtNotation(md, {
  imagePath: '/media/img',
  linkPath: '/pages/',
})
```

### SEO file loading (server-only)

```typescript
import { loadSeoJson, loadSeoText } from '@krantho/core/seo'

const structuredData = loadSeoJson('structured-data.json')
const llmsTxt = loadSeoText('llms.txt')
```

### Page composition

```typescript
import { resolvePageContent, type ResolveContext } from '@krantho/core'

const context: ResolveContext = {
  loader, // an IPublishedContentLoader, for example createContentLoader()
}

const content = await resolvePageContent(homePage, context)
// content['hero'] is a SlugResult with fields, metadata, html, sections
// content['services'] is a CollectionResult (readonly CollectionItem[])
```

## Dependencies

| Type | Package | Purpose |
|------|---------|---------|
| Runtime | `gray-matter` ^4.0.3 | Frontmatter parsing |
| Runtime | `marked` ^17.0.5 | Markdown to HTML |
| Dev | `typescript` ^6.0.2 | Build |
| Dev | `@types/node` ^25.5.2 | Node.js types |
