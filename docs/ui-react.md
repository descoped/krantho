# @krantho/ui-react

React bindings for the krantho CMS. Provides client components (`CMSText`, `CMSMarkdown`, `CMSImage`), async server components (`CMSTextServer`, `CMSMarkdownServer`, `CMSImageServer`), content loading hooks, SEO metadata resolution, and JSON-LD structured data rendering. Two entry points: `@krantho/ui-react` for client code and `@krantho/ui-react/server` for RSC/SSR.

## Context

The krantho core engine (`@krantho/core`) is UI-framework-agnostic. `@krantho/ui-react` bridges that engine to React, providing components that read fields and markdown sections from content and render them as semantic HTML. The client/server split follows Next.js App Router conventions: server components are async and SEO-optimized, client components are interactive with `useContent` for client-side fetching.

## Rationale

- **Near-identical API surface.** Server components take the client props (`CMSTextProps`, `CMSMarkdownProps`, `CMSImageProps`) plus a `collection` and an optional `locale`, since they read a document by collection, slug and locale.
- **Pages show only published content.** Server components and helpers read the live (published) version of a document. Saving leaves the live page as it is; Publish makes the current version live; unpublishing, archiving or deleting the document takes it offline.
- **Server components are async.** `CMSTextServer` et al. `await` content loading at render time -- no client JS, no loading states, no hydration for static content.
- **Client components use a singleton engine.** `useContent` lazily creates a `ContentEngineFactory` instance with `ClientFetchLoader`, caching content for 5 minutes.
- **Pre-loaded content avoids waterfalls.** `CMSContentProvider` accepts a `data` map of slug-to-content. Client components check this context first, skipping the fetch entirely.
- **Semantic CSS classes, not inline styles.** Components output classes like `cms-text cms-variant-h1 cms-color-primary`. Styling is the consumer's responsibility.
- **React `cache()` for server deduplication.** `getCMSContent`, `getCMSSlugs`, `resolveSeoContent`, and `resolveJsonLd` are all wrapped in `React.cache()`, so multiple server components requesting the same data in one render tree share a single load.

## Architecture

```
@krantho/ui-react (client entry)
  CMSText, CMSMarkdown, CMSImage        Client components ('use client')
  CMSProvider                            Config context provider
  useContent                             Hook: loads content via ContentEngine
  useCMSConfig                           Hook: reads CMSProvider config
  CMSContentProvider, usePreloadedContent  Pre-loaded content context
  ConfigurationError                     Error class

@krantho/ui-react/server (server entry)
  CMSTextServer, CMSMarkdownServer, CMSImageServer  Async server components
  getCMSContent, getCMSSlugs, getAllCMSContent,
  getAllCMSSummaries                                 React.cache()-wrapped loaders
  loadContent, initServerLoader                      Lower-level server utilities
  NetworkError                                       Error the read path throws (404 when nothing is published)
  resolveSeoContent                                  React.cache()-wrapped SEO meta resolver
  SeoJsonLd, resolveJsonLd                           JSON-LD graph component + resolver
  SeoMeta                                            SEO metadata type
  CMSContent, CMSContentOptions, ContentLoaderOptions,
  ContentLocation, CMS*ServerProps                   Types
```

### Data flow

**Client path:** `CMSText` -> `useContent(slug)` -> checks `CMSContentProvider` cache -> if miss, `ContentEngineFactory.create(ClientFetchLoader)` -> fetches content -> returns `ContentData`.

**Server path:** `CMSTextServer` -> `getCMSContent(collection, slug, { locale })` (React.cache) -> `loadContent({ collection, slug, locale })` -> `IPublishedContentLoader.getPublished(ref)` -> `renderContent(fields, body)` from `@krantho/core` -> returns `CMSContent`. The loader from `createContentLoader()` in `@krantho/server` caches reads per the configured `content.cache`. A document with no published version is a 404.

**SEO path:** `resolveSeoContent(collection, slug)` (React.cache) -> loads the published fields for fallback values -> reads document-level and site-level SEO configuration properties through the loader in parallel -> resolves fields via `@krantho/seo-shared` field discovery -> returns `SeoMeta`.

**Live marks:** in an editor's preview every component marks what it renders for Studio's Live mode, with the helpers from `@krantho/core/marks` (see [core.md](core.md#marks)). The server components get the preview flag from `CMSContent.preview`, which the server reads (`getCMSContent`, `getAllCMSContent`, `loadContent`) set from `loader.isPreview()`. The client components get the document from `ContentData.document`, which only a host that preloads content fills; content fetched in the browser carries none and stays unmarked. Outside a preview the markup is unchanged.

`resolveSeoContent` and `SeoJsonLd` read in-process through the loader's SEO methods (`IPublishedSeoLoader` from `@krantho/core`: `seoProperties(configId)` and `jsonLd(ref)`), which `createContentLoader()` serves from the published version of each document. No page calls the site's own API. A loader without those methods leaves `resolveSeoContent` on content fields and `SeoJsonLd` rendering nothing.

## API Reference

### Client Components

#### `CMSText`

Renders a field value as a text element.

```typescript
interface CMSTextProps {
  slug: string
  field: string
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body1' | 'body2' | 'caption'
  color?: SemanticStyle['color']
  align?: SemanticStyle['align']
  weight?: SemanticStyle['weight']
  size?: SemanticStyle['size']
  fallback?: string               // shown when field is missing (default: '')
  className?: string
  component?: string              // override HTML tag (e.g., 'span')
}
```

```tsx
import { CMSText } from '@krantho/ui-react'

<CMSText slug="home" field="title" variant="h1" />
<CMSText slug="about" field="ingress" variant="body1" fallback="Welcome" />
```

Marks its field (`kranthoField(document, field)`) when the content carries a previewed `document`.

#### `CMSMarkdown`

Renders markdown body HTML or a specific `##` section.

```typescript
interface CMSMarkdownProps {
  slug: string
  section?: string               // render only this ## section (by heading text)
  variant?: SemanticStyle['variant']
  color?: SemanticStyle['color']
  align?: SemanticStyle['align']
  className?: string
}
```

```tsx
import { CMSMarkdown } from '@krantho/ui-react'

<CMSMarkdown slug="services" />
<CMSMarkdown slug="services" section="Pricing" className="pricing-section" />
```

With `section`, the wrapper carries `kranthoSection(document, section)`; without, the body HTML goes through `markBodySections(html, content, document)`, which wraps the lead and each `##` section in a `display: contents` element in a preview.

#### `CMSImage`

Renders an image from a field. Automatically looks up `{field}-alt` for alt text.

```typescript
interface CMSImageProps {
  slug: string
  field: string                  // field containing the image URL/path
  alt?: string                   // override alt text
  width?: number
  height?: number
  lazy?: boolean                 // default: true (client), false (server)
  className?: string
}
```

```tsx
import { CMSImage } from '@krantho/ui-react'

<CMSImage slug="home" field="featured-image" width={800} height={400} />
```

Marks its field like `CMSText`.

### Server Components

Server components render the published version of a document. They take the client component's props plus a required `collection` and an optional `locale` (omitted: the site's default locale):

```typescript
interface ContentLocation {
  collection: string
  locale?: string
}

type CMSTextServerProps = CMSTextProps & ContentLocation
type CMSMarkdownServerProps = CMSMarkdownProps & ContentLocation
type CMSImageServerProps = CMSImageProps & ContentLocation
```

#### `CMSTextServer`

Async server equivalent of `CMSText`. Marks its field in a preview. Returns a fallback `<span>` when the read fails or nothing is published; logs the error outside production.

```tsx
import { CMSTextServer } from '@krantho/ui-react/server'

export default async function Page() {
  return <CMSTextServer collection="pages" slug="home" field="title" variant="h1" />
}
```

#### `CMSMarkdownServer`

Async server equivalent of `CMSMarkdown`. Marks its section, or a whole body's lead and sections (`markBodySections(content.html, content.rawContent, content)`), in a preview. Returns empty `<div>` on error.

```tsx
import { CMSMarkdownServer } from '@krantho/ui-react/server'

<CMSMarkdownServer collection="pages" slug="about" section="Our Story" />
```

#### `CMSImageServer`

Async server equivalent of `CMSImage`. Marks its field in a preview. Default `lazy` is `false` (server images should load eagerly for LCP).

```tsx
import { CMSImageServer } from '@krantho/ui-react/server'

<CMSImageServer collection="pages" slug="home" field="featured-image" width={1200} height={600} />
```

### SEO Components and Resolvers

#### `resolveSeoContent(collection, slug): Promise<SeoMeta>`

Resolves SEO metadata for a page. Wrapped in `React.cache()` for request-level deduplication.

Resolution priority: `seo_config` properties (user-edited + AI-generated) -> CMS content fields (via `@krantho/seo-shared` field discovery) -> site-level OG defaults.

```typescript
interface SeoMeta {
  title: string
  description: string
  image?: string
  canonical?: string
  author?: string
  datePublished?: string
  dateModified?: string
  og?: {
    title: string
    description: string
    image?: string
    type: string
    siteName?: string
    url?: string
  }
  twitter?: {
    card: string
    site?: string
  }
}
```

```tsx
import { resolveSeoContent } from '@krantho/ui-react/server'

export async function generateMetadata({ params }) {
  const seo = await resolveSeoContent('pages', params.slug)
  return {
    title: seo.title,
    description: seo.description,
    openGraph: seo.og,
    twitter: seo.twitter,
  }
}
```

The resolver loads the document's published fields for field fallbacks, then reads document-level (`doc:{collection}/{slug}`) and site-level (`site`) SEO configuration properties through the loader in parallel. Field discovery uses `buildSeoFieldMap()` and `resolveSeoField()` from `@krantho/seo-shared` to map arbitrary field names to SEO concepts.

#### `SeoJsonLd`

Async server component that renders the complete JSON-LD `@graph` for a page. One component per page -- contains all entities from the full SEO hierarchy (site, collection, document).

```tsx
import { SeoJsonLd } from '@krantho/ui-react/server'

export default async function Page({ params }) {
  return (
    <>
      <SeoJsonLd collection="pages" slug={params.slug} />
      {/* page content */}
    </>
  )
}
```

The layout does not render JSON-LD. Each page owns its complete graph.

#### `resolveJsonLd(collection, slug): Promise<JsonLdGraph | null>`

Lower-level JSON-LD resolver. Wrapped in `React.cache()`. Reads the graph the loader composes from the published version, resolving the full entity hierarchy; null when nothing is published.

### Hooks

#### `useContent(slug: string): ContentData`

Loads content for a slug. Checks `CMSContentProvider` context first; if not pre-loaded, fetches via `ClientFetchLoader` with a singleton `ContentEngine` (5-minute cache TTL).

```typescript
import type { ContentData } from '@krantho/core'

// ContentData shape:
interface ContentData {
  fields: Record<string, unknown>
  content: string
  html: string
  sections: Record<string, string>
  loading: boolean
  error: NetworkError | null
  document?: MarkedDocument | undefined  // the document, for the Live marks; a preloading host fills it
}
```

```tsx
import { useContent } from '@krantho/ui-react'

function ServiceCard({ slug }: { slug: string }) {
  const { fields, loading, error } = useContent(slug)
  if (loading) return <Skeleton />
  if (error) return <ErrorMessage error={error} />
  return <h2>{String(fields['title'])}</h2>
}
```

#### `useCMSConfig(): CMSConfig`

Returns the current CMS configuration from `CMSProvider` context. Throws `ConfigurationError` if used outside a provider.

```typescript
interface CMSConfig {
  contentPath?: string
  assetsPath?: string
  imagesPath?: string
  autoReload?: boolean
  errorBoundary?: boolean
  cacheContent?: boolean
}
```

#### `usePreloadedContent(slug: string): ContentData | null`

Reads pre-loaded content from `CMSContentProvider`. Returns `null` if the slug is not in the cache. Used internally by `useContent`; rarely needed directly.

### Providers

#### `CMSProvider`

Configures CMS settings for the component tree.

```tsx
import { CMSProvider } from '@krantho/ui-react'

<CMSProvider config={{ contentPath: '/content', cacheContent: true }}>
  <App />
</CMSProvider>
```

#### `CMSContentProvider`

Pre-loads content data for client components. Prevents fetch waterfalls when you already have the data (e.g., from SSR props). Fill each entry's `document` with `{ collection, slug, preview: await loader.isPreview() }` on the server, and hand the same data to the client for hydration, so the client components mark in an editor's preview (`examples/react-ssr/src/lib/cms.ts`).

```tsx
import { CMSContentProvider } from '@krantho/ui-react'

<CMSContentProvider data={{ home: homeContentData, about: aboutContentData }}>
  <CMSText slug="home" field="title" variant="h1" />
</CMSContentProvider>
```

### Server Utilities

#### `initServerLoader(loader: IPublishedContentLoader, options?: ServerLoaderOptions): void`

Initialize the server-side content loader. Must be called before any server component renders. Typically called in a module the pages import, such as `lib/krantho.ts`.

`options.basePath` is the path the site is served under (Next's `basePath`, `/docs-site`). Markdown links and images that start at the site's root get it in front when the components render a body (`renderContent`'s `basePath` in `@krantho/core`). `options.resolveUrl(url, { collection, slug })` rewrites each link and image URL of a document's body first (`@krantho/static`'s `site.rendering` maps relative links between markdown files), and `options.atNotation` switches `@field` substitution (default `true`); `initServerLoader(site.loader, site.rendering)` passes all three.

```typescript
import { createContentLoader } from '@krantho/server-next'
import { initServerLoader } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

initServerLoader(createContentLoader({ config, collections }))
```

`createContentLoader({ config, collections })` opens persistence the way the API handler does — the same configuration and collections, the same adapter factory, the same startup content import — so pages and the API read one database: SQLite by default, Postgres when `persistence.provider` is `postgres`. It opens on the first read, never at import time, reads only the live (published) version of each document, and caches reads per `content.cache`. Any other `IPublishedContentLoader` (from `@krantho/core`) works too.

The loader is stored in a module-scoped variable. Markdown is rendered with `renderContent()` from `@krantho/core` (@-notation enabled).

#### `getCMSContent(collection, slug, options?): Promise<CMSContent>`

The published version of a document. React `cache()`-wrapped: multiple calls with the same arguments in one render tree resolve to a single load. Throws `NetworkError` with status 404 when the document has no published version.

```typescript
interface CMSContent {
  collection: string
  slug: string
  locale: string
  fields: Record<string, unknown>
  html: string
  rawContent: string
  sections: Record<string, string>
  excerpt?: string
  preview: boolean               // read for an editor's preview: the Live marks apply
}

interface ContentLoaderOptions {
  processMarkdown?: boolean       // default: true
  extractSections?: boolean       // default: true
  generateExcerpt?: boolean       // default: true
  excerptLength?: number          // default: 160
}

interface CMSContentOptions extends ContentLoaderOptions {
  locale?: string                 // omitted: the site's default locale
}
```

A page that must exist turns the 404 into the framework's not-found response. The Next.js examples keep this in `lib/krantho.ts`:

```typescript
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

#### `getCMSSlugs(collection, locale?): Promise<string[]>`

The slugs of the published documents in a collection, read as summaries. React `cache()`-wrapped.

#### `getAllCMSContent(collection, options?): Promise<CMSContent[]>`

Every published document in a collection, in one list read. React `cache()`-wrapped. Returns an empty array when the read fails (and logs a warning in development).

#### `getAllCMSSummaries(collection, options?): Promise<CMSSummary[]>`

Every published document in a collection without its body: `collection`, `slug`, `locale`, `fields` and the `preview` flag. The database answers with the fields alone and no markdown is rendered, so a navigation or a card list reads this and `getAllCMSContent` is left for a page that shows the body. `options.locale` picks the locale. React `cache()`-wrapped. Returns an empty array when the read fails (and logs a warning in development).

#### `loadContent(ref: ContentRef, options?): Promise<CMSContent>`

Lower-level loader (not cache-wrapped) taking a `ContentRef` (`{ collection, slug, locale? }`). Throws `NetworkError` with status 404 when nothing is published, 500 for other errors.

### Types

All component prop types and content types are re-exported from the main entry point:

```typescript
import type {
  CMSTextProps,
  CMSMarkdownProps,
  CMSImageProps,
  CMSConfig,
  CMSContent,
  ContentLoaderOptions,
} from '@krantho/ui-react'
```

The server entry point additionally exports:

```typescript
import type {
  CMSContentOptions,
  ContentLocation,
  CMSTextServerProps,
  CMSMarkdownServerProps,
  CMSImageServerProps,
  SeoMeta,
} from '@krantho/ui-react/server'
```

`ConfigurationError` is a named error class thrown when hooks are used outside their required providers.

## Usage

Install:

```bash
pnpm add @krantho/ui-react
```

Peer dependency: `react >= 19.0.0`.

### Next.js App Router setup

Loader initialization, in a module the pages import:

```typescript
// lib/krantho.ts
import { createContentLoader } from '@krantho/server-next'
import { initServerLoader } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

// The same database the API route uses: both open it from the resolved config.
initServerLoader(createContentLoader({ config, collections }))

// requirePublished(collection, slug) — see getCMSContent above
```

Server component page with SEO:

```tsx
// app/[slug]/page.tsx
import { CMSTextServer, CMSMarkdownServer, resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import { requirePublished } from '@/lib/krantho'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const seo = await resolveSeoContent('pages', slug)
  return { title: seo.title, description: seo.description, openGraph: seo.og }
}

export default async function Page({ params }) {
  const { slug } = await params
  await requirePublished('pages', slug) // 404 unless published
  return (
    <>
      <SeoJsonLd collection="pages" slug={slug} />
      <CMSTextServer collection="pages" slug={slug} field="title" variant="h1" />
      <CMSMarkdownServer collection="pages" slug={slug} />
    </>
  )
}
```

Client component with provider:

```tsx
// app/providers.tsx
'use client'
import { CMSProvider } from '@krantho/ui-react'

export function Providers({ children }) {
  return (
    <CMSProvider config={{ contentPath: '/content' }}>
      {children}
    </CMSProvider>
  )
}
```

## Dependencies

| Type | Package | Purpose |
|------|---------|---------|
| Runtime | `@krantho/core` | ContentEngine, `renderContent`, types, error classes |
| Runtime | `@krantho/seo-shared` | SEO field discovery for `resolveSeoContent` |
| Peer | `react >= 19.0.0` | React runtime |
| Dev | `@types/react` | TypeScript definitions |
| Dev | `typescript` | Build toolchain |
