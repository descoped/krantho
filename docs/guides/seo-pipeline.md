# SEO Pipeline Guide

This guide covers the krantho SEO pipeline: how Schema.org structured data is configured, composed, enriched, and rendered.

## Overview

Two systems coexist in krantho:

1. **Archetype-driven system** (primary) — shared policies stored in `seo_config`, with document overrides stored in versioned `metadata.seo`, managed through Studio and CLI. Generates a unified `@graph` JSON-LD block from a scope chain of site, collection, route, and document entities. This is the recommended approach for all new projects.

2. **Legacy deterministic pipeline** — YAML-based (`business.yaml`, `guardrails.yaml`) with build-time mappers that generate static JSON files. Kept for backward compatibility in projects that predate the archetype system.

The CMS itself does not depend on SEO. The `@krantho/seo` package is an optional peer dependency — sites that don't need structured data simply omit it.

```
Archetype system (primary):

Developer seeds config     Studio refines config     API composes graph       Frontend renders
  krantho.config.ts seo  →   Studio's Structure    →  composeFromConfig()  →  <SeoJsonLd />
        (code)              (Studio + persistence)        (API handler)       (server component)

Legacy pipeline (backward compat):

Agent-authored YAML         Deterministic mappers      Generated JSON          SSR components
  business.yaml        →     map-business.ts       →   structured-data.json →  <JsonLd data={...} />
  guardrails.yaml      →     map-faq.ts            →   faq-pages.json
```

## Archetype System

### Scope Chain

SEO configuration cascades through four scopes, from broadest to most specific:

| Scope | Config ID | Purpose |
|-------|-----------|---------|
| **Site** | `site` | Business identity — `ProfessionalService`, `Organization`, `Restaurant`, etc. |
| **Collection** | `collection:pages` | Default Schema.org types for all documents in a collection |
| **Route** | `route:/services/*` | URL-pattern overrides for advanced use cases |
| **Document** | `doc:pages/about` | Per-page property overrides and type changes |

Resolution works from most specific to least specific: document overrides route, and route overrides collection. When the same entity (matched by `@type` and optional `role`) appears in multiple scopes, their properties are merged with the more specific scope taking precedence, and each property records the scope that set it (Studio shows it as the value's source).

A route's pattern matches the page's path: `*` stands for one path segment, `**` for any rest of the path. When several patterns match, the one with the most literal characters applies; a page composes from at most one route configuration.

Site-level entities are rendered alongside document-level entities in the output `@graph`, but they use separate builder logic and ID conventions — the site scope is not merged into the document scope chain.

### Configuration Shape

Each scope stores an `SeoConfigData` object:

```typescript
interface SeoConfigData {
  entities: SeoConfigEntity[]
  fieldMappings?: Record<string, string>
}

interface SeoConfigEntity {
  '@type': string        // Schema.org type (e.g., 'Article', 'LocalBusiness')
  '@id'?: string         // Optional explicit @id
  role?: string          // Disambiguates multiple entities of the same @type
  properties: Record<string, unknown>  // Schema.org property overrides
}
```

### Developer Seed Configuration

Developers seed SEO configuration through the `seo` section of `krantho.config.ts`; the handler applies it on startup. This is idempotent — Studio overrides in the database are preserved unless `seedMode: 'overwrite'` is set.

**Thin shape** — type lists only (most common):

```typescript
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  // ...site and other sections...
  seo: {
    identity: 'ProfessionalService',
    collections: {
      pages: ['Article'],
      services: ['Service'],
    },
    routes: {
      '/blog/*': ['BlogPosting'],
    },
  },
})
```

**Rich shape** — full entity config with properties:

```typescript
seo: {
  site: {
    entities: [
      {
        '@type': 'ProfessionalService',
        properties: {
          name: 'Acme Consulting',
          telephone: '+1-555-123-4567',
          areaServed: 'San Francisco Bay Area',
        },
      },
    ],
  },
  richCollections: {
    services: {
      entities: [{ '@type': 'Service', properties: {} }],
      fieldMappings: { 'Service.description': 'ingress' },
    },
  },
  seedMode: 'seed', // default: preserve existing; 'overwrite' replaces
}
```

**File-based seed** — load from a project directory:

```typescript
seo: {
  configDir: './krantho.seo',
}
```

### Graph Composition

The `composeFromConfig()` function generates a unified `@graph` from resolved configuration:

1. **Site-level entities** are built first — business identity, WebSite, founder Person
2. **Document-level entities** are built with CMS field resolution, system-derived properties (dates, URL, word count, language), and per-entity user overrides
3. The output is deduplicated by `@id` — later entities override earlier ones

```typescript
import { composeFromConfig, resolveEffectiveConfig } from '@krantho/seo'

// Resolve the document scope chain (collection → route → document)
const effective = resolveEffectiveConfig({
  collection: collectionConfig,
  route: routeConfig,
  document: documentConfig,
})

// Compose the @graph
const graph = composeFromConfig({
  config: effective,
  fields: cmsFields,
  siteConfig: { domain, name, language, baseUrl }, // SeoGraphConfig — site identity
  path: '/services/strategy',
  siteLevel: siteScopeConfig, // SeoConfigData stored under the 'site' id
  documentMeta: { createdAt, updatedAt, locale, changedBy, version },
})
// Returns: { "@context": "https://schema.org", "@graph": [...] }
```

For code-defined archetypes (without persistence), use `composeGraph()` with preset archetypes:

```typescript
import { composeGraph, homePageArchetype } from '@krantho/seo'

const graph = composeGraph({
  archetype: homePageArchetype,
  fields: content.fields,
  config: { domain, name, language, baseUrl },
  path: '/',
})
```

## Schema Catalog

The `SCHEMA_CATALOG` is a curated set of Schema.org types relevant for SEO — types that trigger Google rich results or are commonly used in structured data.

### Type Categories

| Category | Purpose |
|----------|---------|
| `business` | Business & Organization — LocalBusiness, ProfessionalService, Organization, Restaurant |
| `content` | Content — Article, BlogPosting, NewsArticle, FAQPage, HowTo, Recipe |
| `commerce` | Commerce & Services — Product, Service, Offer, Course |
| `people` | People & Events — Person, Event, JobPosting |
| `navigation` | Navigation & Structure — BreadcrumbList, WebSite, WebPage |
| `reviews` | Reviews & Ratings — Review, AggregateRating |

Each catalog type declares:

- Whether it applies at site level, document level, or both
- Which Google rich result it enables (if any)
- A human-readable label and description

### Type Properties

Every catalog type has defined properties with importance levels (`required`, `recommended`, `optional`) and source indicators (`site`, `content`, `computed`, `manual`):

```typescript
import { getTypeProperties, getRequiredProperties } from '@krantho/seo'

const props = getTypeProperties('Article')
// Returns: [{ property: 'headline', importance: 'required', source: 'content' }, ...]

const required = getRequiredProperties('Article')
// Returns: ['headline', 'author', 'datePublished']
```

### Rich Result Validation

Each type with a Google rich result has defined required and recommended properties:

```typescript
import { getRichResultRequirements, validateRichResult } from '@krantho/seo'

const req = getRichResultRequirements('Article')
// { feature: 'Article rich result', requiredProperties: [...], recommendedProperties: [...] }

const result = validateRichResult('Article', { headline: 'My Post', author: 'Jane' })
// Reports missing required/recommended properties
```

### Builder-Typed vs. Generic Types

Types listed in `KNOWN_SCHEMA_TYPES` (such as `LocalBusiness`, `Article`, `Service`, `FAQPage`) have dedicated builders that produce cross-linked entities with `@id` references. All other catalog types use a generic fallback that merges properties under the configured `@type`.

### Archetype Presets

The `@krantho/seo` package exports preset archetypes for common page types:

| Preset | Schema Types |
|--------|-------------|
| `homePageArchetype` | LocalBusiness, Person, WebSite |
| `aboutPageArchetype` | Organization, Person, BreadcrumbList |
| `servicePageArchetype` | LocalBusiness, BreadcrumbList, FAQPage, Service |
| `blogPostArchetype` | Article, BreadcrumbList, Person |
| `eventPageArchetype` | Event, BreadcrumbList, Organization |
| `recipePageArchetype` | Recipe, BreadcrumbList, Person |
| `coursePageArchetype` | Course, BreadcrumbList, Organization |
| `jobPostingPageArchetype` | JobPosting, BreadcrumbList, Organization |
| `howToPageArchetype` | HowTo, BreadcrumbList, Person |
| `videoPageArchetype` | VideoObject, BreadcrumbList, Organization |

Custom archetypes are defined with `defineArchetype()`, which validates types against the catalog at definition time:

```typescript
import { defineArchetype } from '@krantho/seo'

const productPage = defineArchetype({
  schemas: ['Product', 'BreadcrumbList', 'Organization'],
  mappings: { price: 'offers.price' },
})
```

## Smart Property Resolution

The system automatically maps CMS fields to Schema.org properties without manual configuration.

### SEO Field Discovery

The `buildSeoFieldMap()` function (from `@krantho/seo-shared`) discovers which CMS fields serve each SEO concept by matching against well-known field names in priority order:

| SEO Concept | Candidates (highest priority first) |
|-------------|--------------------------------------|
| `title` | `title`, `name` |
| `description` | `meta-description`, `description`, `ingress`, `excerpt` |
| `author` | `author` |
| `datePublished` | `published-date`, `date` |
| `image` | `og-image`, `image`, `hero-image` |
| `canonicalUrl` | `canonical-url` |
| `ogTitle` | `og-title` |
| `ogDescription` | `og-description` |
| `ogImage` | `og-image`, `image` |

### Auto-Mappings

`DEFAULT_AUTO_MAPPINGS` maps CMS field names to Schema.org properties with priority-based resolution. When multiple CMS fields could map to the same Schema.org property, the highest priority wins:

- `meta-description` (priority 10) overrides `description` (priority 5) for `description`
- `published-date` (priority 8) overrides `date` (priority 5) for `datePublished`
- `og-image` (priority 8) overrides `image` (priority 5) for `image`

### System-Derived Properties

`composeFromConfig()` fills fields from document metadata when CMS fields don't provide them:

- `datePublished` — from the first version creation timestamp
- `dateModified` — from the latest version timestamp
- `inLanguage` — from the document locale
- `author` — from the user who created the content
- `url` — computed from `baseUrl + path`
- `mainEntityOfPage` — same as `url`
- `wordCount` — counted from a string `body` field; the page loader and the SEO preview pass the fields without the markdown body, so their graphs carry none

These fields reach the output only for types without a dedicated builder, which copy every field. Builder types such as `Article` read only the fields they name: `Article` takes `datePublished` from a `date` field, always points `author` at the site `Person`, and computes `mainEntityOfPage` from the path.

## Unified SEO CLI

The SEO CLI manages archetype configuration via the `seo_config` persistence table.

### Configuration Commands

```bash
# Show all archetype configurations
pnpm run seo config show

# Show config for a specific collection
pnpm run seo config show pages

# Show effective (resolved) config for a document
pnpm run seo config show pages/home

# Set site-level Schema.org type
pnpm run seo config set-site ProfessionalService

# Set collection archetype types (comma-separated)
pnpm run seo config set pages Article,FAQPage
pnpm run seo config set services Service

# Set document-level override
pnpm run seo config set pages/about Organization,Person

# Remove a config override (inherits from parent)
pnpm run seo config reset pages/about

# Remove ALL SEO configurations (clean slate)
pnpm run seo config clean
```

### Preview and Validation

```bash
# Preview the effective config and composed JSON-LD for a document
pnpm run seo preview pages/home

# Validate rich result eligibility for all configurations
pnpm run seo validate --all

# Validate a specific collection or document
pnpm run seo validate services
```

The `preview` command shows the resolved effective types, the source scope (document/collection/site/fallback), and the composed JSON-LD output.

The `validate` command checks each configured Schema.org type against Google's rich result requirements, reporting required and recommended properties.

## Frontend Integration

### Meta Tags — `resolveSeoContent()`

The `resolveSeoContent()` function from `@krantho/ui-react` resolves SEO metadata for a page with a three-tier priority:

1. SEO config properties (user-edited + AI-generated via `seo_config` table)
2. CMS content fields (via `buildSeoFieldMap` field discovery)
3. Site-level OG defaults

```tsx
// app/[slug]/page.tsx (Next.js)
import { resolveSeoContent } from '@krantho/ui-react/server'
import type { Metadata } from 'next'

export async function generateMetadata({ params }): Promise<Metadata> {
  const { slug } = await params
  const seo = await resolveSeoContent('pages', slug)

  return {
    title: seo.title,
    description: seo.description,
    openGraph: {
      title: seo.og.title,
      description: seo.og.description,
      images: seo.og.image ? [seo.og.image] : [],
      type: seo.og.type,
      siteName: seo.og.siteName,
    },
    twitter: {
      card: seo.twitter.card,
      site: seo.twitter.site,
    },
  }
}
```

The returned `SeoMeta` object includes `title`, `description`, `image`, `canonical`, `author`, `datePublished`, `dateModified`, plus nested `og` and `twitter` objects.

### JSON-LD — `<SeoJsonLd>`

The `<SeoJsonLd>` component from `@krantho/ui-react` renders the complete JSON-LD structured data for a page. The graph resolves the full entity hierarchy (site + collection + document) and is composed in-process from the document's published version by the content loader (`createContentLoader()`), the same composition the SEO preview endpoint uses.

```tsx
// app/[slug]/page.tsx
import { SeoJsonLd } from '@krantho/ui-react/server'

export default async function Page({ params }) {
  const { slug } = await params
  return (
    <>
      <SeoJsonLd collection="pages" slug={slug} />
      {/* page content */}
    </>
  )
}
```

Each page owns its complete `@graph` — the layout does not render JSON-LD. The component renders nothing when the document has no published version or the loader cannot compose a graph.

### Low-Level Components

For projects needing direct control:

- **`<JsonLd data={...} />`** — renders any Schema.org object as a `<script type="application/ld+json">` tag with XSS sanitization
- **`<SEOGraph archetype={...} fields={...} config={...} path={...} />`** — composes and renders a `@graph` from a code-defined archetype preset

Both are server components — no client JavaScript shipped.

## AI Enrichment

The SEO enrichment system uses LLM to generate content that requires human judgment, while preserving user-edited values.

### Meta Description Enrichment

Generates `meta-description` values for documents, between `seo.enrichment.meta.minChars` and `maxChars` (default 120-155 characters). Triggered from Structure's **Fill what's missing** in Studio (the whole site or one collection), a page's Data mode (that document), or via the API:

```
POST /api/seo/enrich
{
  "type": "meta-descriptions",
  "scope": "all",           // or "collection", or "item"
  "collection": "pages",    // when scope is "collection" or "item"
  "slug": "about",          // when scope is "item"
  "force": false             // true to overwrite existing
}
```

Without `scope`, a `slug` means `item` and a `collection` alone means `collection`. A scope that names no configured collection, or `item` without a slug, is refused with 400; `collection` enriches only that collection's documents, and `item` only the one document in its collection.

The LLM reads the markdown body (or CMS fields as fallback) and produces a search-engine-friendly description. The generated value is written to the `meta-description` field in the content document.

### Archetype Property Enrichment

Fills missing Schema.org properties for documents based on their configured archetype types. The enrichment engine:

1. Resolves the document's effective types via the scope chain
2. Looks up each type's property definitions from the catalog
3. Identifies properties that are neither user-edited nor auto-mappable from CMS fields
4. Generates values via LLM, respecting existing properties as context
5. Saves generated properties in `metadata.seo` through the versioned document draft save path

```
POST /api/seo/enrich
{
  "type": "archetype",
  "scope": "all",
  "force": false
}
```

User-edited properties are never overwritten (unless `force: true`). The enrichment prompt includes existing properties as context for better generation.

### Enrichment Job System

Enrichment runs as a background job with progress tracking:

```
GET /api/seo/enrich/status    // Poll job progress
GET /api/seo/enrich/status?jobId=<jobId>
```

Each job tracks per-item status (pending, generating, complete, skipped, error) with result messages.

### Legacy CLI Enrichment

The legacy pipeline includes CLI-based enrichment tools:

```bash
pnpm run seo:generate         # Generate structured-data.json + llms.txt + faq-pages.json
pnpm run seo:enrich:llms      # Generate llms.txt link descriptions
```

## Studio: Structure

Studio's **Structure** destination is where SEO is managed — see [studio.md](../studio.md#structure):

- **Graph** — a live page's JSON-LD as the site serves it, as a node graph: where each node and value comes from, the rich results it feeds and what they lack, with the view-source.
- **Scopes & archetypes** — the site → collection → URL pattern → document cascade, the site identity from `krantho.config.ts` (read-only), the site entities, each collection's archetype with the impact of a change, and the type catalog.
- **Rich results** — each search feature the live pages can get: eligible pages out of those it applies to, and what is missing where.
- **Crawlers & assistants** — the sitemap and robots.txt as served, the robots.txt override (save, reset), and llms.txt with where it comes from.
- **Fill what's missing** — enrichment of meta descriptions and archetype properties over the site or one collection, never overwriting.

A page's own SEO — meta and social previews, indexing, its graph, rich results, findings and enrichment — is in the editor's Data mode.

## SEO API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/seo/catalog` | List Schema.org type catalog |
| `GET` | `/api/seo/catalog?type=Article` | Type detail with properties and requirements |
| `GET` | `/api/seo/config/:id` | Get SEO config by ID |
| `GET` | `/api/seo/config` | List all configs (optional `?scope=` filter) |
| `PUT` | `/api/seo/config/:id` | Save SEO config (admin only) |
| `DELETE` | `/api/seo/config/:id` | Delete SEO config (admin only) |
| `DELETE` | `/api/seo/config` | Delete all configs (admin only) |
| `GET` | `/api/seo/preview/:collection/:slug` | Compose and return JSON-LD for a document's current version (`?locale=`, the default when absent) |
| `POST` | `/api/seo/enrich` | Trigger enrichment job |
| `GET` | `/api/seo/enrich/status` | Poll enrichment job status |
| `GET` | `/api/seo/sitemap` | Sitemap XML |
| `GET` | `/api/seo/sitemap.json` | Sitemap URL list |
| `GET` | `/api/seo/robots.txt` | Robots.txt content, naming the sitemap at `/sitemap.xml` |
| `GET` | `/api/seo/structured-data` | Generated `structured-data.json` from the legacy pipeline |

The generated robots.txt names the sitemap at `<site.baseUrl>/sitemap.xml`, the address search engines expect, so the site serves `/sitemap.xml` and `/robots.txt` at its root from these routes (a Next.js rewrite, a SvelteKit route, an Express route — `create-krantho` sets this up). The sitemap's homepage entry comes from the document that renders `/`, with its `lastmod`.

Each entry's `lastmod` is a W3C Datetime in UTC with the full time (`2026-09-30T22:17:06.000Z`), as the sitemap protocol defines it — the time its published version was written: the time an editor last published it in Studio, or — for a page imported from a file and never edited — the file's last git commit, from the `dates.json` the build writes with `generateContentDates` (see [server.md](../server.md#generatecontentdatescontentdir-promisecontentdates--null)). With `seo.indexNow.key` set, published changes are also sent to IndexNow (Bing and the other participating engines), and the site serves the key at `/<key>.txt` from `GET /api/seo/indexnow/:key`.

A robots.txt override is stored as the `site` config's `robotsTxt`, beside its entities and never among them, saved through `PUT /api/seo/config/site`.

## Legacy Pipeline

The legacy pipeline is maintained in `@krantho/tools` for projects that predate the archetype system.

### Project Configuration

The pipeline resolves the project's `krantho.config.ts` through `@krantho/config`, the same
tree the running site uses: `llm` for the provider, model and the provider's own key
(`KRANTHO_LLM_ANTHROPIC_API_KEY` for the default provider, in a deployment), `tools.concurrency` for parallel model calls, and `paths` for the content and
generated directories. Every script takes `--root <dir>` to run against another project;
without it, the working directory is the project. The repository's root scripts pass
`--root examples/nextjs-shadcn`; a later `--root` overrides it.

### Configuration Files

- **`content/seo/site-config.json`** — central config for all legacy SEO tools (domain, routes, service mappings, day name translations)
- **`content/seo/business.yaml`** — non-CMS business metadata (geo coordinates, credentials, legal entity, `knowsAbout` list)
- **`content/seo/guardrails.yaml`** — FAQ Q&A pairs organized by route group, with inheritance support

### Generation

```bash
pnpm run seo:generate       # Generate output files
```

The deterministic mappers run in sequence:

- **map-business** — reads `business.yaml` + CMS frontmatter, writes `structured-data.json` with `LocalBusiness` and `Person` entities
- **map-llms-txt** — reads `business.yaml` + CMS content, writes `llms.txt`
- **map-faq** — reads `guardrails.yaml`, writes `faq-pages.json` with route-to-FAQ mappings (supports inheritance)

### Enrichment Tools

```bash
pnpm run seo:enrich:llms                    # Generate llms.txt link descriptions
pnpm run seo:enrich:llms --apply         # Write changes
```

The `enrich:llms` tool generates AI-optimized descriptions for `llms-sections` entries in `business.yaml`, optimized for AI assistants (ChatGPT, Perplexity, etc.) to give accurate answers.

### Important Boundary

`site-config.json` is for `@krantho/tools` only. It is never imported by the CMS, admin, or API packages. The archetype system's equivalent data lives in the `seo_config` persistence table and is managed through Studio and CLI.

## Package Map

| Package | Role |
|---------|------|
| `@krantho/seo-shared` | Zero-dependency shared types: `SeoConfigData`, `SeoConfigEntity`, field discovery (`buildSeoFieldMap`, `resolveSeoField`), JSON-LD serialization |
| `@krantho/seo` | Archetypes, catalog, graph composition (`composeFromConfig`, `composeGraph`), rich result validation, `<SEOGraph>` and `<JsonLd>` components |
| `@krantho/ui-react` | Frontend integration: `resolveSeoContent()` for meta tags, `<SeoJsonLd>` for JSON-LD |
| `@krantho/api` | SEO API handlers: config CRUD, preview, enrichment, sitemap, robots |
| `@krantho/tools` | Legacy SEO pipeline: CLI, mappers, YAML enrichment |
| `@krantho/studio` | Structure (graph, scopes and archetypes, rich results, crawlers) and the editor's Data mode |

## Further Reading

- [docs/seo.md](../seo.md) — API reference for the `@krantho/seo` package
- [docs/tools.md](../tools.md) — API reference for the `@krantho/tools` package
