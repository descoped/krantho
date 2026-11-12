# Architecture Overview

Krantho is a developer-first CMS organized as a pnpm workspace monorepo. Each package publishes independently under the `@krantho/` scope, so applications install only what they use.

## Concept

Most content systems force a choice: a headless CMS that adds a network hop and vendor lock-in, a static site generator that couples content to a specific build tool, or raw markdown processing scattered across application code. Krantho occupies the space between these. Content lives as markdown files in your repository (or any persistence backend), a shared engine handles parsing and caching, and framework-specific packages render the output with zero boilerplate.

The key differentiator is separation of concerns across package boundaries. The content engine knows nothing about React or Svelte. The persistence layer knows nothing about markdown processing. The UI packages know nothing about how content is stored. Each boundary is a published npm package with its own dependency tree.

## Package Map

```
@krantho/core                     Content engine, types, semantic styles, page composition
    |
@krantho/persistence              IPersistenceAdapter interface, capability predicates, media/lock/webhook types
    |
@krantho/persistence-fs           FileSystemAdapter (reads markdown from disk)
@krantho/persistence-sqlite       SQLiteAdapter (default database backend)
@krantho/persistence-postgres     PostgresAdapter (production database backend)
    |
@krantho/schema                   Type inference, validation, page composition DSL, runtime schema merge

--- Configuration ---

@krantho/config                   defineKranthoConfig(), resolveConfig(): one typed tree from defaults, code and environment

--- Server ---

@krantho/api                      REST handlers, auth, plugins, webhooks, content hooks, image optimization
@krantho/server                   Handler factory: createKranthoHandler(), adapter creation, Studio serving
@krantho/server-node              Node.js adapter: raw handler, Vite plugin, standalone server
@krantho/server-next              Next.js App Router adapter
@krantho/server-sveltekit         SvelteKit adapter

--- UI (parallel, all depend on core only) ---

@krantho/ui-react                 React server + client components, hooks, SEO resolver
@krantho/ui-mui                   MUI Typography/Box components
@krantho/ui-tailwind              Tailwind utility class components
@krantho/ui-svelte                Svelte 5 components

--- Studio ---

@krantho/studio                    React single-page application, built with Vite

--- SEO ---

@krantho/seo-shared               Zero-dependency SEO field discovery primitives, JSON-LD serialization
@krantho/seo                      JSON-LD structured data, archetype catalog, graph composition

--- Standalone ---

@krantho/ai                       Zero-dependency LLM client (Anthropic, OpenAI, Gemini, OpenRouter, Ollama)
@krantho/media-local              Media file store on local disk (loaded by server)
@krantho/media-vercel-blob        Media file store on Vercel Blob (loaded by server)
@krantho/media-s3                 Media file store on S3-compatible object storage (loaded by server)
@krantho/media-gcs                Media file store on Google Cloud Storage, zero dependencies (loaded by server)
@krantho/tools                    SEO pipeline + enrichment CLI (private, not published)
create-krantho                    Project scaffolding CLI

--- Bundles (dependency-only) ---

@krantho/next, @krantho/sveltekit, @krantho/node   One install per framework
```

### Dependency graph

```
core  <--  persistence  <--  persistence-fs / persistence-sqlite / persistence-postgres
                        <--  schema

core  <--  ui-react        (peer: react >=19)
core  <--  ui-mui          (peer: react >=19, @mui/material >=7)
core  <--  ui-tailwind     (peer: react >=19, tailwindcss >=4)
core  <--  ui-svelte       (peer: svelte >=5)

core + seo-shared  <--  seo  (peer: react >=19, schema-dts)

seo-shared          <--  ui-react/server (seo-resolver, seo-jsonld)
seo-shared          <--  studio
seo-shared          <--  api

ai                  <--  api (runtime enrichment)
ai                  <--  tools (CLI enrichment)

persistence         <--  media-local / media-vercel-blob / media-s3 / media-gcs
media-*             <--  server (file store picked by media.provider, optional peers)

config              <--  server, api, tools, media-*
```

### What you install

**Next.js + server-managed CMS** (most common):

```
@krantho/config
@krantho/schema
@krantho/server-next
@krantho/ui-react
@krantho/seo
```

`@krantho/next` bundles the same set in one install; list `@krantho/config`, `@krantho/schema` and the adapter directly as well, since your code imports them by name. The server package pulls in `@krantho/api`, `@krantho/server`, `@krantho/schema`, `@krantho/persistence`, and defaults to SQLite. Add `@krantho/ui-tailwind` or `@krantho/ui-mui` for styling alternatives.

**SvelteKit**:

```
@krantho/config
@krantho/schema
@krantho/server-sveltekit
@krantho/ui-svelte
```

## Content Model

Content is stored in markdown files with YAML frontmatter. The terminology shifts by context:

| Term | Context | Example |
|------|---------|---------|
| Frontmatter | Markdown files | `title: 'About Us'` in YAML header |
| Fields | CMS / API / Studio | `fields.title`, `fields.description` |
| Body | Both | Markdown content below frontmatter |
| Sections | Both | `## headings` parsed into named sections |

Inside the CMS runtime, the content engine parses frontmatter into a `fields: Record<string, unknown>` on `ContentResult`. The persistence layer stores structured content as `ContentDocument`, which carries `fields`, `body`, `html`, `sections`, and the system fields in a separate `DocumentMeta` object (collection, slug, locale, version, status, source, changedBy, createdAt).

Standard page fields: `title`, `description`, `status`. Services add `ingress`, `order`. SEO uses `meta-description` (separate from `description`, falls back to `description` if empty).

No page composition or builder system. Content is fields + body. Layout is a frontend concern.

### Four concerns, separated

| Concern | Where | Who reads |
|---------|-------|-----------|
| Site Identity | `site` in `krantho.config.ts` | API, SEO, Studio |
| Layout Content | `content/globals/` | Layout components, Studio |
| SEO Archetype Config | `seo_config` table (persistence) | API, Studio, CLI, frontend |
| SEO Tool Config | `content/seo/site-config.json` | `@krantho/tools` only (legacy pipeline) |

CMS does not depend on SEO. Not all sites need SEO.

## Content Flow

A document goes through three stages: persistence, rendering the markdown, and framework output.

### 1. Persistence reads the live version

In the database adapters every save appends a version. The **current** version is what Studio edits; the **live** version is the one last published, and it is what visitors see. A save never changes what visitors see: it appends a new current version and leaves the live version in place. Publish makes the current version live; unpublishing, archiving or deleting the document leaves nothing live. Each of these is a write that appends a version. The filesystem adapter keeps no history, so a save to a published file is live at once.

Server-rendered pages read through `createContentLoader({ config, collections })` from `@krantho/server`, an `IPublishedContentLoader` (from `@krantho/core`). It opens the same adapter as the API and calls the adapter's `getPublished(collection, slug, locale)` for one document and its `query` (`state: 'published'`) for a collection: the `full` projection for `listPublished`, the `summary` projection, with no body, for `listPublishedSummaries` -- SQLite, Postgres, or the filesystem, where a file is live when its status is `published`. Reads are cached per `content.cache`. An omitted locale is the site's default.

### 2. The body is rendered

`renderContent(fields, body)` (from `@krantho/core`) is the one rendering implementation:

1. Optionally processes `@field` notation in the markdown body, replacing references with field values
2. Converts the markdown body to HTML via `marked`
3. Extracts `## heading` sections into a `Record<string, string>` map, split by `splitSections()` from `@krantho/core` (the one section model, also browser-safe as `@krantho/core/sections`)

`ContentEngine` uses the same function for slug-based loaders such as `ClientFetchLoader`, after parsing YAML frontmatter via `gray-matter` into `fields`. The engine keeps an in-memory cache with configurable TTL (default 5 minutes in production, disabled in development).

### 3. Framework renders the output

In `@krantho/ui-react`, server components like `CMSTextServer` call `getCMSContent(collection, slug)`, which is wrapped in `React.cache()` for request-level deduplication. A document with no published version is a 404 (`NetworkError`). Client components use `useContent(slug)`, which checks the `CMSContentProvider` context before fetching. SvelteKit apps call the loader and `renderContent` directly in their `load` functions.

```
<CMSTextServer collection="pages" slug="home" field="title" variant="h1" />
  --> <h1 class="cms-text cms-variant-h1">About Us</h1>

<CMSMarkdownServer collection="pages" slug="home" section="what-we-do" />
  --> <div class="cms-markdown">Our team combines deep industry...</div>
```

### Rendering modes

**SSG**: `generateStaticParams` with `getCMSSlugs('pages')` enumerates the published slugs at build time. Content is baked into HTML.

**SSR**: Server components call `getCMSContent(collection, slug)` per request. The loader's read cache reduces adapter calls within the TTL window.

**Cached until changed** (`cache.pages: 'next-isr'`): Next.js keeps each page, rendered on its first request, until a content change invalidates the cache tags it read. The loader's read cache is off; Next's data cache is the only page-side cache.

**CDN** (`cache.pages: 'cdn'`, SvelteKit and Express): each page carries CDN cache headers and the tags of every read that rendered it, and a content change purges those tags at CloudFront, Cloud CDN or Vercel. The loader's read cache is off; the CDN is the cache. See [page-caching.md](page-caching.md).

## Studio SPA Architecture

Studio (`@krantho/studio`) is a React single-page application built with Vite. It is framework-agnostic: one build, served at `/studio` by all server packages (`server-next`, `server-sveltekit`, `server-node`). A SvelteKit app ships the React admin without framework contamination.

Studio communicates with the backend exclusively through the REST API (`/api/*`). Its destinations:

- **Pulse** -- what needs the editor, the site's key figures, collections and recent activity
- **Site** -- every collection and the Layout's globals; the collection view filters, sorts, and publishes or deletes in bulk
- **The editor** -- Live mode (the site's own draft preview, edited in place), Structure mode (the schema form and the markdown body), Data mode (search and social previews, the page's JSON-LD graph with its sources, rich results, enrichment, version history), a side panel, autosave and edit locks
- **Structure** -- how search engines and assistants read the site: Graph, Scopes & archetypes, Rich results, Crawlers & assistants
- **Media** -- upload, browse, crop and hotspot editing, folders
- **Setup** -- Collections & schema (runtime fields, export as Zod code), Locales, AI provider, Integrations, Checkpoints, People, Environment

The SPA is pre-built and bundled as static assets in the `@krantho/studio` package. `@krantho/server` serves these via `createStudioServer()`, which also applies the optional Studio gate (`auth.oidc.studioEntry`).

## Server Adapter Pattern

```
@krantho/api               Framework-agnostic API handlers
    |
@krantho/server            Handler factory: createKranthoHandler()
    |
@krantho/server-node       Node.js: Vite plugin, standalone server, raw handler
@krantho/server-next       Next.js: API route handler
@krantho/server-sveltekit  SvelteKit: +server.ts route handlers
```

`createKranthoHandler(options)` creates a handler that processes Web `Request` objects and returns Web `Response` objects. Framework-specific adapters convert between their native request/response types and the Web standard.

```typescript
import { createKranthoHandler } from '@krantho/server'
import type { KranthoHandlerOptions } from '@krantho/server'
import config from './krantho.config'

// Configuration is data and lives in krantho.config.ts -- site identity,
// persistence, auth, media storage, SEO seeds, the LLM provider. Every leaf can
// be overridden from the environment except the structured ones
// (seo.collections, seo.routes, seo.site, seo.richCollections, seo.richRoutes,
// media.image.presets), which have no environment variable and are set only in
// krantho.config.ts. What is left here is wiring: things that cannot be a string.
const options: KranthoHandlerOptions = {
  config,
  collections: { pages, globals, services },  // from defineCollection()
  pages: [...],                               // from definePage()
  plugins: [],
  hooks: {},
}

const handler = await createKranthoHandler(options)
```

## SEO Archetype System

Schema.org structured data is configured through archetypes, not handwritten JSON-LD. The system resolves configuration from four scopes, narrowest wins:

1. **Site** -- business type + properties + OG defaults (e.g., `ProfessionalService`)
2. **Collection** -- document archetypes per collection (e.g., pages get `Article`, services get `Service`)
3. **Route** -- optional URL-pattern overrides for advanced use cases
4. **Document** -- per-page property overrides (edited in Studio)

Developer config seeds SEO on startup from the `seo` section of `krantho.config.ts`. The archetype catalog covers Google rich result types, business subtypes, and core Schema.org types.

Smart property resolution derives properties from version metadata and the page path (datePublished, dateModified, inLanguage, author, url); they reach the graph for types without a dedicated builder, while builder types such as `Article` read only their own fields (see [seo.md](../seo.md)). `wordCount` is counted only from a `body` field, which page rendering does not pass. AI enrichment fills missing properties without overwriting user edits.

### Frontend integration

Two server components from `@krantho/ui-react/server`:

- **`resolveSeoContent(collection, slug)`** -- resolves meta tags with OG + Twitter card data. Priority: `seo_config` properties, then CMS fields (via `@krantho/seo-shared` field discovery), then site defaults. Wrapped in `React.cache()`.
- **`SeoJsonLd`** -- renders the complete JSON-LD `@graph` for a page. One component per page, contains all entities from the full hierarchy (site, collection, document).

```tsx
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'

export async function generateMetadata({ params }) {
  const seo = await resolveSeoContent('pages', params.slug)
  return { title: seo.title, description: seo.description, openGraph: seo.og }
}

export default async function Page({ params }) {
  return (
    <>
      <SeoJsonLd collection="pages" slug={params.slug} />
      {/* page content */}
    </>
  )
}
```

## Schema Ownership: Code-First + Runtime

Krantho uses a code-first schema model with runtime extensions:

1. **Code-defined** -- developers declare collections with Zod schemas in `content.config.ts`. These are the source of truth.
2. **Runtime-defined** -- Studio can add fields at runtime via `RuntimeFieldDefinition`. Stored in the database.
3. **Merged** -- at validation time, `mergeSchemas()` combines both. Code fields always take precedence -- runtime fields only add new keys.
4. **Exportable** -- `exportSchemaAsZod()` generates Zod code from the merged schema, letting developers adopt runtime fields into code.

## Capability Predicates

The persistence interface uses optional methods for advanced features. Rather than checking `adapter.query !== undefined` manually, `@krantho/persistence` exports type-narrowing predicates:

```typescript
import {
  canQuery,
  canGetContent,
  canWriteContent,
  hasVersioning,
  hasRuntimeSchema,
} from '@krantho/persistence'

if (canQuery(adapter)) {
  // TypeScript now knows adapter.query exists
  const { items } = await adapter.query({ state: 'current', collections: ['pages'], projection: 'summary' })
}

if (hasVersioning(adapter)) {
  // adapter.listVersions, adapter.getVersion, adapter.restoreVersion are available
  const versions = await adapter.listVersions('pages', 'home')
}
```

This pattern allows the API layer to degrade gracefully -- the filesystem adapter lacks write/versioning capabilities, while SQLite and Postgres provide them all.

## Plugin System

Plugins extend krantho through a single manifest interface:

```typescript
import type { KranthoPlugin } from '@krantho/api'

const analyticsPlugin: KranthoPlugin = {
  name: '@myorg/krantho-analytics',
  version: '1.0.0',
  hooks: {
    afterCreate: async (ctx) => { /* track creation */ },
    afterPublish: async (ctx) => { /* track publish */ },
  },
  routes: [
    { method: 'GET', path: 'stats', handler: statsHandler },
  ],
  studioPages: [
    { path: 'analytics', label: 'Analytics' },
  ],
  fieldTypes: [
    { type: 'markdown-preview', label: 'Markdown Preview' },
  ],
  onLoad: async () => { /* initialize */ },
  onUnload: async () => { /* cleanup */ },
}
```

Plugin routes are mounted under `/api/plugins/:pluginName/`. Multiple plugins' hooks are chained automatically via `loadPlugins()`.

### Content Hooks

The hook system provides lifecycle events for content operations:

```typescript
import type { ContentHooks } from '@krantho/api'

const hooks: ContentHooks = {
  beforeSave: async (ctx) => { /* modify fields/body, throw to abort */ },
  afterCreate: async (ctx) => { /* post-creation side effects */ },
  afterUpdate: async (ctx) => { /* post-update side effects */ },
  afterPublish: async (ctx) => { /* post-publish side effects */ },
  beforeDelete: async (ctx) => { /* throw to abort deletion */ },
  afterDelete: async (ctx) => { /* cleanup after deletion */ },
}
```

### Webhooks

The API fires webhooks on content mutations (create, update, delete, publish) to external services. Delivery is tracked via `IWebhookDeliveryAdapter` with retry logic.

## Locale Support

Locale is a first-class concept across the persistence layer:

- `WriteContentData.locale` -- locale identifier on write (saves and publications are addressed by collection, slug and locale)
- `ContentQuery.locale` -- filter by locale on a list read
- `DocumentMeta.locale` -- locale of each content document

A request that names no locale uses the site's default locale, `site.defaultLocale` in the configuration: every adapter takes it as a required `defaultLocale` option and has no fallback of its own. A markdown file that declares no `locale` is in that locale. Database adapters store multiple locale variants of the same content.

## Design Decisions

### Workspace monorepo, not a single package

A single package would force every consumer to install `gray-matter`, `marked`, `schema-dts`, and type definitions for React, Svelte, MUI, and Tailwind regardless of what they use. The monorepo structure means a Svelte project never downloads React types, and a project using Postgres persistence never installs `gray-matter`.

### No adapter layer

An earlier design had a UIAdapter abstraction between the engine and components. This was deleted. Components render directly with their target framework. Semantic CSS classes on the HTML output provide the styling hook.

### Persistence as a separate interface

`IContentLoader` (in `@krantho/core`) defines the minimal slug-based read surface the content engine needs, and `IPublishedContentLoader` the published read surface server-rendered pages need. `IPersistenceAdapter` (in `@krantho/persistence`) extends `IContentLoader` with write operations, versioning, published reads, and runtime schema support. The filesystem, SQLite, and Postgres implementations each live in their own packages.

### UI packages are parallel alternatives, not layers

`@krantho/ui-react`, `@krantho/ui-mui`, `@krantho/ui-tailwind`, and `@krantho/ui-svelte` all depend on `@krantho/core` directly. They are not stacked. Each exports its own components that render using the respective framework's primitives.

## Extension Points

### Custom persistence adapter

Implement `IPersistenceAdapter` from `@krantho/persistence`. Required methods: `exists`, `read`, `getMetadata`, `listSlugs`. Optionally implement `writeContent`, `deleteContent`, `getContent`, `getPublished`, `query`, `listVersions`, `getVersion`, `restoreVersion`, `getRuntimeSchema`, and `saveRuntimeSchema` for full Studio support.

### Semantic CSS classes

All server-rendered HTML uses BEM-style classes: `cms-text`, `cms-markdown`, `cms-variant-h1`, `cms-color-primary`, `cms-align-center`. Style these in your global CSS, Tailwind config, or theme.

### Content schema

`@krantho/schema` provides `defineCollection()` and `defineConfig()` for declaring typed collections with Zod schemas. `definePage()` declares page routes and content dependencies. `validateAllContent()` validates fields across all collections. Types are inferred automatically from the Zod schemas.

---

For API details, see the per-package docs: [core](../core.md), [ui-react](../ui-react.md), [configuration](../configuration.md), [persistence](../persistence.md), [schema](../schema.md), [seo](../seo.md).
