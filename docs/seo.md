# @krantho/seo

Schema.org structured data that is conformant by construction. Composes JSON-LD `@graph` blocks from the site's SEO configuration and identity, checks them against a pinned Schema.org vocabulary and each reader's published rules, and states the structure each page renders. Components render `<script type="application/ld+json">` tags with XSS-safe serialization.

## Context

Search engines and LLMs use JSON-LD structured data to understand page content. The `@krantho/seo` package provides an archetype system where each page type declares which Schema.org types it includes. The graph composition engine builds a unified `@graph` with `@id` cross-references between entities. The companion package `@krantho/seo-shared` provides zero-dependency primitives for field discovery and JSON-LD serialization, usable by any package without depending on `@krantho/seo`.

## Rationale

- **Conformant by construction.** Every graph krantho composes is checked against the Schema.org vocabulary, pinned to a release (`src/vocabulary/schemaorg.generated.ts`). References resolve within the graph; superseded and retired terms are refused where they are configured.
- **One source per value.** Every property's value comes from one place, in a fixed order: the SEO settings, a content field, a value computed from the page, the site's configuration. Builders shape the structure; a shared step carries every value they leave out and the type accepts.
- **Readers are data.** Google's and Bing's rules are reader profiles, each rule citing its documentation and the date it was checked. Findings name the reader they come from.
- **Pluggable.** A site registers its own Schema.org types, reader profiles and page-structure decorators (`defineSeo`), the way krantho registers its built-ins.
- **The page states its structure.** A template passes the trail, sequence and kind it renders; decorators turn them into the page node, its BreadcrumbList and its place in a set.
- **Four-scope hierarchy.** SEO configuration cascades: site -> collection -> route -> document. More specific scopes override less specific ones.
- **Server components only.** JSON-LD is invisible metadata -- no client JS needed.
- **XSS-safe by default.** The `serializeJsonLd` function (from `@krantho/seo-shared`) escapes `<` to `\u003c` to prevent script injection in inline JSON-LD.

## Architecture

```
seo-graph.tsx               SEOGraph component: renders composed @graph as JSON-LD
json-ld.tsx                 JsonLd component: renders any object as a JSON-LD script tag
create-seo.ts               createSeo(): the site's SEO subsystem, checked against its configuration
define-seo.ts               defineSeo(): a site's own types, reader profiles and decorators
vocabulary/                 The Schema.org vocabulary pinned to a release, and queries over it
validate/                   validateGraph(): integrity, vocabulary, life cycle, reader rules
profiles/                   Reader profiles (google, bing): registerProfile, ruleFor, featureEligibility
types/                      Type definitions (registerType) and krantho's built-in builders
decorators/                 Page-structure decorators (page, breadcrumb, sequence)
archetypes/                 defineArchetype() and the built-in presets
graph/
  compose-from-config.ts    composeFromConfig(), resolvePageEntities()
  effective-config.ts       resolveEffectiveConfig(): the collection, route and document scopes merged
  value-scope.ts            ValueScope, valueScope(): where each resolved value comes from
  compose-graph.ts          composeGraph() — an archetype composed through composeFromConfig
  resolve-properties.ts     Each property's value and its source
  resolve-references.ts     References resolved within the graph
  id-conventions.ts         @id helpers
catalog/                    SCHEMA_CATALOG and type properties, derived with the Google profile
scripts/
  generate-vocabulary.mjs   Regenerates the vocabulary table for a Schema.org release
```

## API Reference

### Components

#### `SEOGraph`

The unified component. Renders a composed `@graph` JSON-LD block from an archetype and page data.

```typescript
interface SEOGraphProps {
  /** The archetype defining which schemas to render */
  archetype: Archetype
  /** Page fields (already resolved by resolvePageContent) */
  fields: Record<string, unknown>
  /** Site identity -- the `site` section of krantho.config.ts */
  config: SeoGraphConfig
  /** Current page path, e.g., '/about' */
  path: string
  /** The structure the page renders: its trail, its place in a sequence, its kind */
  structure?: PageStructure
  /** Optional FAQ pairs */
  faq?: ReadonlyArray<{ question: string; answer: string }>
}
```

```tsx
import { SEOGraph, homePageArchetype } from '@krantho/seo'

// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <SEOGraph
          archetype={homePageArchetype}
          fields={content.hero.fields}
          config={{
            domain: 'example.com',
            name: 'Example Corp',
            language: 'en',
            baseUrl: 'https://example.com',
          }}
          path="/"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

Output: a single `<script type="application/ld+json">` tag containing a `@graph` array with LocalBusiness, Person, and WebSite entities cross-linked via `@id`.

#### `SEOGraph` with FAQ and the page's trail

```tsx
import { SEOGraph, servicePageArchetype } from '@krantho/seo'

<SEOGraph
  archetype={servicePageArchetype}
  fields={content.fields}
  config={siteConfig}
  path="/services/consulting"
  structure={{
    trail: [
      { name: 'Services', url: '/services' },
      { name: 'Consulting' },
    ],
  }}
  faq={[
    { question: 'What does consulting include?', answer: 'Strategy, analysis, and implementation.' },
  ]}
/>
```

#### `JsonLd`

Base component. Renders any object as a `<script type="application/ld+json">` tag with XSS sanitization.

```typescript
interface JsonLdProps {
  data: Record<string, unknown>
}
```

```tsx
import { JsonLd } from '@krantho/seo'

<JsonLd data={{
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Example Corp',
}} />
```

Use `JsonLd` directly when you need a standalone JSON-LD block outside the archetype system. For composed `@graph` output, use `SEOGraph` instead.

### Archetypes

Archetypes define which Schema.org types a page should include. Each archetype produces a set of entities in the `@graph` output.

#### `defineArchetype(config): Archetype`

Create a custom archetype. Validates all schemas against `SCHEMA_CATALOG` at definition time -- unknown types throw immediately to catch typos.

```typescript
interface ArchetypeConfig {
  /** Schema.org types this page type includes */
  schemas: readonly SchemaType[]
  /** Optional frontmatter key -> schema property mappings */
  mappings?: Record<string, string>
}

interface Archetype {
  readonly schemas: readonly SchemaType[]
  readonly mappings: Readonly<Record<string, string>>
}
```

```typescript
import { defineArchetype } from '@krantho/seo'

const productPageArchetype = defineArchetype({
  schemas: ['Product', 'BreadcrumbList', 'Organization'],
  mappings: {
    price: 'offers',
    sku: 'sku',
  },
})
```

Default mappings are applied automatically: `title` -> `name`, `description` -> `description`, `author` -> `author`, `date` -> `datePublished`, `image` -> `image`, `excerpt` -> `description`.

#### Built-in Archetype Presets

| Archetype | Schemas |
|-----------|---------|
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

#### Schema Types

`SchemaType` is any Schema.org type name. `defineArchetype` checks each against the pinned vocabulary and throws for a type it does not have, or one Schema.org has superseded or retired. A type with a registered definition gets its builder; any other is built as a typed node carrying the values its type accepts.

### Graph Composition

Two composition paths: `composeGraph` for archetype-driven rendering, `composeFromConfig` for persistence-driven rendering.

#### `composeGraph(options): JsonLdGraph`

Archetype-driven composition: each of the archetype's types is composed as `composeFromConfig` composes a configured entity with no settings of its own.

```typescript
interface ComposeGraphOptions {
  archetype: Archetype
  fields: Record<string, unknown>
  config: SeoGraphConfig
  path: string
  structure?: PageStructure
  faq?: ReadonlyArray<{ question: string; answer: string }>
}

interface SeoGraphConfig {
  domain: string
  name: string
  language: string
  baseUrl: string
  logo?: string
  description?: string
  alternateName?: string
  sameAs?: readonly string[]
}
```

#### `composeFromConfig(options): JsonLdGraph`

Config-driven composition, used by the API and the content loader with the SEO configuration stored in persistence.

```typescript
interface ComposeFromConfigOptions {
  config: SeoConfigData               // effective document-level config
  fields: Record<string, unknown>     // the document's content fields
  siteConfig: SeoGraphConfig          // the site's identity
  path: string                        // the page's path
  siteLevel?: SeoConfigData | null    // site entities, rendered alongside
  documentMeta?: DocumentMeta         // dates and locale from version history
  structure?: PageStructure           // what the page's template renders
  faq?: ReadonlyArray<{ question: string; answer: string }>
  onFinding?: (finding: Finding) => void  // what composition left out, and why
}
```

Composition runs in a fixed order:

1. **Values.** Each property's value comes from one source (`resolveProperties`):
   1. `manual` -- the entity's SEO settings.
   2. `auto` -- a content field: a field mapping (`Type.property` or `property`), a field named after the property, the type definition's alias fields, then the catalog's default mappings.
   3. `computed` -- from the page: `url` and `mainEntityOfPage` from the base URL and path, `datePublished` and `dateModified` from version history, `inLanguage` from the locale. Document entities only.
   4. `site` -- the site's identity from configuration: an organization's `name`, `url`, `logo`, `description`, `alternateName` and `sameAs`, a WebSite's `name`, `url` and `inLanguage`. Site entities only.
2. **Build.** The type's definition shapes the entity from the resolved values; a shared step carries every value it left out that the type accepts.
3. **References.** Each reference resolves within the graph: `author` to the site's Person, else the publishing Organization; `publisher` to the Organization; `isPartOf` to the WebSite. One that nothing configured can satisfy is left out, with a finding.
4. **Decorators** add what the page's structure states (see Page structure).

An `author` comes only from the content, a field mapping or the SEO settings, never from version history: the editor identity it records is private.

`resolvePageEntities(options)` returns the same resolution for an editor: each entity with every property the graph carries, its value, its source, its scope, where it was read and whether the SEO settings may set it. Studio shows it in the editor's Data mode and in Structure › Graph.

```typescript
interface ResolvedPropertyView {
  property: string
  value: unknown
  source: 'manual' | 'auto' | 'computed' | 'site'
  scope: ValueScope   // the site, collection, URL pattern or document that set it; computed; or linked
  origin: string      // where the value was read or how it was computed
  editable: boolean   // whether the SEO settings may set it
}

type ValueScope = 'site' | 'collection' | 'route' | 'document' | 'computed' | 'linked'
```

A value's scope (`valueScope()`) follows from its source: a reference to another entity (`{ "@id": … }`, or a list of them) is `linked`; `computed` stays `computed`; `site` (the site's identity from configuration) is `site`; `auto` (a content field) is `document`. A `manual` value is the scope that set it: `site` on a site entity, and on a document entity the scope `resolveEffectiveConfig` recorded for the property -- `collection` when no record exists (the document has only its collection's, or the default, archetype).

#### `resolveEffectiveConfig(configs): EffectiveSeoConfig`

Resolves the document-level scope hierarchy: collection -> route -> document (most specific wins). Entities are matched by `(@type, role)` tuple across scopes, in the order the least specific scope introduced them. Properties merge with the more specific scope taking precedence, and each merged entity records, per property, the scope that gave its value. Field mappings and the page structure are also merged, most specific winning.

```typescript
type ConfigScope = 'collection' | 'route' | 'document'

interface EffectiveSeoEntity extends SeoConfigEntity {
  readonly scopes: Readonly<Record<string, ConfigScope>>   // property -> the scope that set it
}

interface EffectiveSeoConfig extends SeoConfigData {
  readonly entities: readonly EffectiveSeoEntity[]
}
```

`scopes` is not persisted: it lives on the merged entity only, for `resolvePageEntities` to name where each `manual` value comes from.

Site scope is NOT included -- it is passed separately to `composeFromConfig` as `siteLevel`.

```typescript
import { resolveEffectiveConfig } from '@krantho/seo'

const effective = resolveEffectiveConfig({
  collection: collectionConfig,  // base layer
  route: routeConfig,            // optional override
  document: documentConfig,      // most specific
})
```

### Schema Catalog

The catalog contains curated Schema.org types relevant for SEO, organized by category.

#### `SCHEMA_CATALOG`

An array of `CatalogType` entries describing each Schema.org type.

```typescript
interface CatalogType {
  type: string             // Schema.org @type value
  label: string            // Human-readable label
  description: string      // When to use this type
  richResult: string | null // the Google feature, from the Google profile
  richResultStatus: 'active' | 'restricted' | 'retired' | 'none'
  docsUrl: string          // the documentation the Google rule cites
  lifecycle?: { status: 'pending' | 'superseded' | 'retired'; by?: string }
  category: CatalogCategory
  siteLevel: boolean       // Applies at site level (global entity)
  documentLevel: boolean   // Applies at document level
}

type CatalogCategory = 'business' | 'content' | 'commerce' | 'people' | 'navigation' | 'reviews'
```

#### Catalog Queries

```typescript
import {
  getCatalogType,
  getCatalogByCategory,
  getSiteLevelTypes,
  getDocumentLevelTypes,
  CATEGORY_LABELS,
} from '@krantho/seo'

getCatalogType('Article')                 // CatalogType | undefined
getCatalogByCategory('content')           // CatalogType[]
getSiteLevelTypes()                       // CatalogType[] (siteLevel: true)
getDocumentLevelTypes()                   // CatalogType[] (documentLevel: true)
CATEGORY_LABELS['business']              // 'Business & Organization'
```

### Type Properties

Property definitions per type, for Studio's editors. Each property's `importance` follows the Google profile's rule for the type (`required`, `recommended`, otherwise `optional`); `source` says where its value comes from (`manual`, `auto`, `computed`, `site`).

```typescript
import { getTypeProperties, getRequiredProperties, getAutoMappableProperties } from '@krantho/seo'

getTypeProperties('Article')
getRequiredProperties('LocalBusiness')
getAutoMappableProperties('Article')
```

### Vocabulary

The Schema.org vocabulary of one release is a generated table: each type's parents, data type and life cycle; each property's domain, range and life cycle; each enumeration's members. Queries: `isSubtypeOf`, `propertiesOf`, `isPropertyOfType`, `rangeAcceptsType`, `isDatatype`, `isEnumeration`, `enumerationsOf`, `lifecycleOf`, `matchesDatatype`.

Moving to a new release is one step, which prints the terms that are new, removed, superseded, retired or pending against the previous table:

```bash
pnpm --filter @krantho/seo run vocabulary --release 30.1
```

### Validation

`validateGraph(graph, { profiles })` returns findings, each with a severity, a code, the rule set it comes from (`schema.org` or a reader profile) and, for a reader's rule, the documentation it cites.

| Code | Severity | What it means |
|------|----------|---------------|
| `unresolved-reference` | error | An `@id` reference no node in the graph defines |
| `duplicate-id` | error | Two nodes with one `@id` |
| `missing-type` | error | A node without `@type` |
| `unknown-type`, `unknown-property` | error | Not in the pinned vocabulary |
| `superseded`, `retired` | error | A term Schema.org replaced or removed; the finding names the replacement |
| `value-out-of-range` | error | A value the property's range does not accept |
| `property-not-in-domain` | warning | A property not defined for the node's type |
| `pending` | info | A pending term: allowed, and open to change |
| `profile-required` | warning | A property a reader's feature needs is missing: the page is not eligible for it |
| `profile-recommended` | info | A property the reader recommends |
| `profile-retired-feature` | warning | The reader no longer shows the feature |
| `profile-restricted-feature` | info | The reader shows the feature on conditions it states |

Reader rules apply to the graph's top-level nodes, and only to properties defined for the node's own type.

### Reader profiles

A reader profile is a reader's published rules on top of the Schema.org baseline: per type, the feature, its status (`active`, `restricted`, `retired`), the properties it requires (`required`, `oneOf`) and recommends, conditions in words, the `source` it comes from and the date it was `verifiedAt`. A rule applies to the type and its subtypes, unless a subtype has its own. `google` and `bing` are built in; `seo.readers` in the configuration chooses the active ones (default both).

```typescript
import { registerProfile, getProfile, ruleFor } from '@krantho/seo'

ruleFor(getProfile('google')!, 'NewsArticle')   // Google's Article rule
```

The catalog's rich-result labels and statuses are derived from the Google profile, so the two cannot drift apart. A test cross-checks composed graphs against Adobe's implementation of Google's rules.

#### `featureEligibility(graph, readers): FeatureEligibility[]`

The search features a page's entities can appear in, per reader. For each of the graph's top-level nodes whose type has a reader rule for a feature with status `active` or `restricted`, it lists:

```typescript
interface FeatureEligibility {
  reader: string
  feature: string
  type: string
  nodeId: string | undefined
  status: 'active' | 'restricted'   // restricted: shown only under the rule's conditions
  eligible: boolean                 // active, and every required and one-of property is present
  missing: readonly string[]        // what is absent; a one-of group as `a | b`
  conditions: readonly string[]
  source: string                    // the documentation the rule comes from
}
```

Only properties defined for the node's type count. A retired feature is never listed. `Seo.features(graph)` (see [The SEO subsystem](#the-seo-subsystem)) calls it with the active readers; the API's `GET /api/seo/findings` reports it per published page.

### Type definitions

```typescript
interface TypeDefinition {
  type: string                    // a current Schema.org type
  scope: 'site' | 'document'      // site: one entity for the whole site
  idFragment: string              // '#article', '#business' …
  fields?: Record<string, readonly string[]>   // alias fields per property
  computed?: readonly string[]    // computed page values it carries; all when absent
  references?: Record<string, { types: readonly string[]; resolve: 'site-entity' | 'omit' }>
  build(context: BuildContext): SchemaEntity
}
```

`registerType(definition)` registers a builder; a later registration for a type replaces the earlier one, and the returned function restores it. Built in: Organization, LocalBusiness, WebSite, Person, Article, Service, Product, BreadcrumbList, FAQPage, Event, Course, JobPosting, Recipe, HowTo and VideoObject.

### Page structure

A page's template knows what it renders; it passes that to the graph as a `PageStructure` (from `@krantho/core`):

```typescript
interface PageStructure {
  trail?: readonly { name: string; url?: string }[]   // root first, the page last
  sequence?: { partOf: { name: string; url: string }; position: number }
  kind?: string   // item, collection, about, faq, profile, or a Schema.org WebPage type
}
```

Decorators run after the entities are built, in order:

- **page** -- the page node: a configured WebPage type of the page, or `WebPage` (or the type its kind names) at `<url>/#webpage`, part of the WebSite, with the document's entity as its `mainEntity`, its image, date and language.
- **breadcrumb** -- a BreadcrumbList from the trail, linked from the page node. A configured BreadcrumbList is built from the same trail; it falls back to Home › page only when no trail is given.
- **sequence** -- the set the page is part of, as a CollectionPage, and its `position` in it.

Relative URLs resolve against the site's base URL. A scope's SEO configuration can give its pages a trail above them and a kind when their template states none -- `_structure.yaml` in a scope's definition directory:

```yaml
# krantho.seo/collections/docs/_structure.yaml
trail:
  - name: Docs
    url: /docs
kind: item
```

`registerDecorator(decorator)` adds a site's own; it runs after krantho's.

### The SEO subsystem

`createSeo(config)` creates the site's SEO subsystem from its configuration instance and checks it: a reader that is not registered, a configured type that is unknown, superseded or retired, or an identity value a reader requires throws a `SeoConfigurationError` naming each setting. Values a reader recommends are warnings on `seo.findings`. The server creates it at start and refuses to run on errors, naming the setting and its environment variable; `pnpm run seo validate --config` runs the same check for a build.

```typescript
const seo = createSeo(config)
seo.compose({ config, fields, path, siteLevel })   // a page's graph
seo.resolve({ config, fields, path, siteLevel })   // its values and their sources
seo.validate(graph)                                // against the vocabulary and the active readers
seo.features(graph)                                // the active readers' search features its entities can appear in
```

### A site's own types, readers and decorators

```typescript
import { defineSeo } from '@krantho/seo'

defineSeo({
  types: [datasetType],
  profiles: [catalogReader],
  decorators: [speakableDecorator],
})
```

All or none: when one is refused, those registered before it are removed and the error is thrown. Call it in a module the server loads before it renders pages.

### CLI

```bash
pnpm run seo validate --config     # the start-time configuration check
pnpm run seo validate --all        # every published page's graph; exits non-zero on any error
pnpm run seo validate pages        # each active reader's rules for a target's types
```

### Auto-Mappings

Automatic CMS field -> Schema.org property resolution. When a CMS field name matches a known pattern, the system maps it without manual configuration.

```typescript
interface AutoMapping {
  cmsField: string          // CMS field name (exact match)
  schemaProperty: string    // Schema.org property name
  priority: number          // Higher wins for same property
}
```

`DEFAULT_AUTO_MAPPINGS` defines the built-in mappings. For example, `meta-description` (priority 10) overrides `description` (priority 5) for the Schema.org `description` property.

```typescript
import { resolveAutoMappings, DEFAULT_AUTO_MAPPINGS } from '@krantho/seo'

const resolved = resolveAutoMappings(
  ['title', 'meta-description', 'date', 'image'],  // CMS fields
  ['name', 'description', 'datePublished', 'image'], // Schema.org properties
)
// Map { 'description' => 'meta-description', 'name' => 'title', ... }
```

### ID Conventions

Entity `@id` values follow a predictable pattern for cross-referencing within a `@graph`:

- **Site-level entities:** `{baseUrl}/#business`, `{baseUrl}/#website`, `{baseUrl}/#person`
- **Document-level entities:** `{baseUrl}{path}/#{fragment}`
  - `BreadcrumbList` -> `#breadcrumb` (drops `List`)
  - `FAQPage` -> `#faq` (drops `Page`)
  - `VideoObject` -> `#video` (drops `Object`)
  - `Article` -> `#article`, `Event` -> `#event`, etc.

These fragments are URL components, not Schema.org type names. Consumers should not rely on the fragment matching the type name.

## `@krantho/seo-shared`

Zero-dependency package providing SEO primitives usable by any package without depending on `@krantho/seo`. The canonical implementations live here; `@krantho/seo` re-exports them.

### `serializeJsonLd(data): string`

XSS-safe JSON-LD serialization. Escapes `<` to `\u003c` to prevent premature `</script>` termination.

```typescript
import { serializeJsonLd } from '@krantho/seo-shared'

serializeJsonLd({ '@type': 'Article', name: 'Test <script>' })
// '{"@type":"Article","name":"Test \\u003cscript>"}'
```

Used internally by `SEOGraph`, `JsonLd`, and framework components in `@krantho/ui-react` and `@krantho/ui-svelte`.

### SEO Field Discovery

Maps SEO concepts to actual CMS field names. The CMS schema is the source of truth -- SEO adapts to it.

```typescript
interface SeoFieldMap {
  title: string | null
  description: string | null
  author: string | null
  datePublished: string | null
  image: string | null
  canonicalUrl: string | null
  robotsIndex: string | null
  robotsFollow: string | null
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  ogType: string | null
}
```

```typescript
import { buildSeoFieldMap, resolveSeoField, SEO_FIELD_CANDIDATES } from '@krantho/seo-shared'

// Discover which CMS fields serve each SEO concept
const fieldMap = buildSeoFieldMap(['title', 'meta-description', 'og-image', 'date'])
// { title: 'title', description: 'meta-description', image: 'og-image', datePublished: 'date', ... }

// Resolve a concept's value from content fields
const desc = resolveSeoField(fieldMap, 'description', { 'meta-description': 'Page summary' })
// 'Page summary'
```

`SEO_FIELD_CANDIDATES` defines the priority-ordered candidate field names per concept. For example, `description` checks `meta-description` first, then `description`, then `ingress`, then `excerpt`.

### SEO Config Types

Canonical types for the entity/config shape used across persistence, graph composition, admin, and API.

```typescript
import type { SeoConfigEntity, SeoConfigData } from '@krantho/seo-shared'
import { inferSeoConfigScope } from '@krantho/seo-shared'

interface SeoConfigEntity {
  readonly '@type': string
  readonly '@id'?: string
  readonly role?: string
  readonly properties: Readonly<Record<string, unknown>>
}

interface SeoConfigData {
  readonly entities: readonly SeoConfigEntity[]
  readonly fieldMappings?: Readonly<Record<string, string>>
  /** The trail above the scope's pages and their kind, when their template states none */
  readonly structure?: SeoStructureDefaults
}

inferSeoConfigScope('site')                // 'site'
inferSeoConfigScope('collection:pages')    // 'collection'
inferSeoConfigScope('route:/blog/*')       // 'route'
inferSeoConfigScope('doc:pages/about')     // 'document'
```

### Effective Type Resolution

```typescript
import { resolveEffectiveTypes } from '@krantho/seo-shared'
import type { ScopeWithEntities } from '@krantho/seo-shared'

// Cascades: document -> collection -> site (first with entities wins)
const types = resolveEffectiveTypes(documentConfig, collectionConfig, siteConfig)
// ['Article'] — from whichever scope first has entity types
```

## Scope Chain

SEO configuration cascades through four scopes, from broadest to most specific:

1. **Site** -- Business identity (LocalBusiness, Organization, WebSite, Person). Rendered as site-level entities alongside document entities.
2. **Collection** -- Default archetype types for a content collection (e.g., all `pages` get Article, all `services` get Service). The primary configuration point.
3. **Route** -- URL-pattern overrides for advanced use cases, stored as `route:<pattern>`. In a pattern, `*` stands for one path segment and `**` for any rest of the path (`/blog/*`, `/docs/**`). A page composes from the most specific pattern matching its path -- the one with the most literal characters -- and from no other.
4. **Document** -- Per-page property overrides.

Developer config seeds SEO on startup: the `seo` section of `krantho.config.ts`, which `createKranthoHandler()` and `createContentLoader()` resolve and seed into the database -- once per process and database, before either serves anything, so a page rendered before any API request already carries the configured archetypes:

```typescript
// krantho.config.ts
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  seo: {
    identity: 'ProfessionalService',
    collections: {
      pages: ['Article'],
      services: ['Service'],
    },
  },
})
```

The `resolveEffectiveConfig` function merges collection -> route -> document configs, with more specific scopes overriding per-property. The merged result is passed to `composeFromConfig` along with the site-level config. In the API, `pageSeoConfig()` (`seo-compose.ts`) reads the site, `collection:<name>` and the matching `route:<pattern>` configurations for a page, takes the document's own SEO from its versioned metadata (`metadata.seo`), and resolves them; with none configured, the code-defined article archetype applies.

## Full Page Example

```tsx
import { SEOGraph, blogPostArchetype } from '@krantho/seo'
import type { SeoGraphConfig } from '@krantho/seo'

const siteConfig: SeoGraphConfig = {
  domain: 'example.com',
  name: 'Example Blog',
  language: 'en',
  baseUrl: 'https://example.com',
}

// app/blog/[slug]/page.tsx
export default async function BlogPost({ params }) {
  const content = await getContent('blog', params.slug)

  return (
    <>
      <SEOGraph
        archetype={blogPostArchetype}
        fields={content.fields}
        config={siteConfig}
        path={`/blog/${params.slug}`}
        structure={{ trail: [{ name: 'Blog', url: '/blog' }, { name: content.fields.title }] }}
      />
      <article>
        <h1>{content.fields.title}</h1>
        {/* page content */}
      </article>
    </>
  )
}
```

This renders a single JSON-LD `@graph`: the Article, its BreadcrumbList (Blog › the post) and the page node, cross-linked via `@id` references.

## Usage

Install:

```bash
pnpm add @krantho/seo
```

Peer dependency: `react >= 19.0.0`.

## Dependencies

| Type | Package | Purpose |
|------|---------|---------|
| Runtime | `@krantho/core` | Core types |
| Runtime | `@krantho/seo-shared` | Field discovery, JSON-LD serialization, config types |
| Peer | `react >= 19.0.0` | React runtime (JSX, server components) |
| Dev | `@types/react` | TypeScript definitions |
| Dev | `@adobe/structured-data-validator` | Cross-check of Google's rules in tests |
| Dev | `typescript` | Build toolchain |
