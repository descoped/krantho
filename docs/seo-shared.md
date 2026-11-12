# @krantho/seo-shared

Zero-dependency SEO field discovery primitives and shared types for krantho. Provides the canonical field mapping logic, SEO configuration types, scope resolution, and JSON-LD serialization used across the SEO ecosystem.

## Context

The krantho SEO system spans multiple packages — `@krantho/seo` (graph composition, archetypes), `@krantho/ui-react` (meta tag components), `@krantho/studio` (Structure and the editor's Data mode), and `@krantho/api` (SEO endpoints). All of these need to agree on how CMS fields map to SEO concepts, what an SEO configuration entity looks like, and how to safely serialize JSON-LD. `@krantho/seo-shared` is the shared foundation that prevents drift across these packages.

## Rationale

- **Zero dependencies.** This package has no runtime or workspace dependencies. It defines pure types, lookup tables, and small functions. Any package can import it without pulling in `@krantho/seo` (which depends on `@krantho/core` and peers on React).
- **Prevents four-way drift.** Before this package existed, JSON-LD serialization was duplicated independently in `@krantho/seo`, `@krantho/ui-react`, and `@krantho/ui-svelte`. Field mapping logic was coupled to `@krantho/seo`. Extracting the shared primitives here eliminates independent copies that silently diverge.
- **CMS schema is the source of truth.** The field map adapts SEO concepts to whatever field names the CMS schema defines — it never imposes field names on the content model. A collection with `ingress` gets it mapped to the `description` concept automatically.
- **Separate from `@krantho/seo`.** The `seo` package is optional (not all sites need SEO). But packages like `@krantho/api` and `@krantho/studio` need the config types and field discovery regardless. This package provides those without the optional dependency.

## Architecture

```
seo-field-map.ts              SeoFieldMap, buildSeoFieldMap, resolveSeoField, SEO_FIELD_CANDIDATES
                              Field discovery — maps SEO concepts to CMS field names
      |
seo-config-types.ts           SeoConfigEntity, SeoConfigData, inferSeoConfigScope
                              Canonical config types used across persistence, API, Studio
      |
resolve-effective-types.ts    ScopeWithEntities, resolveEffectiveTypes
                              Cascading scope resolution: document → collection → site
      |
json-ld-serialize.ts          serializeJsonLd
                              XSS-safe JSON-LD serialization for <script> tags
```

## API Reference

### `buildSeoFieldMap(cmsFieldNames): SeoFieldMap`

Build an SEO field map from the CMS fields present in a collection schema. Each SEO concept is resolved to the first matching candidate found in the schema, or `null` if none match.

```typescript
import { buildSeoFieldMap } from '@krantho/seo-shared'

const fieldMap = buildSeoFieldMap(['title', 'meta-description', 'ingress', 'og-image', 'author'])
// {
//   title: 'title',
//   description: 'meta-description',    // meta-description wins over ingress
//   author: 'author',
//   datePublished: null,
//   image: 'og-image',
//   canonicalUrl: null,
//   robotsIndex: null,
//   robotsFollow: null,
//   ogTitle: null,
//   ogDescription: null,
//   ogImage: 'og-image',
//   ogType: null,
// }
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `cmsFieldNames` | `readonly string[]` | Field names from the collection schema |

**Returns:** `SeoFieldMap` — each SEO concept mapped to a CMS field name or `null`.

### `resolveSeoField(fieldMap, concept, fields): string`

Resolve an SEO concept's value from CMS content fields using a pre-built field map.

```typescript
import { buildSeoFieldMap, resolveSeoField } from '@krantho/seo-shared'

const fieldMap = buildSeoFieldMap(['title', 'description', 'meta-description'])
const fields = { title: 'About Us', description: 'Company info', 'meta-description': 'Learn about our team' }

resolveSeoField(fieldMap, 'description', fields)  // 'Learn about our team'
resolveSeoField(fieldMap, 'author', fields)        // '' (no author field in schema)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `fieldMap` | `SeoFieldMap` | Pre-built field map from `buildSeoFieldMap()` |
| `concept` | `SeoFieldConcept` | The SEO concept to resolve |
| `fields` | `Record<string, unknown>` | The document's CMS fields |

**Returns:** `string` — the field value, or empty string if unmapped or missing.

### `SEO_FIELD_CANDIDATES`

Lookup table of well-known CMS field names for each SEO concept, ordered by priority (highest first). The first candidate found in the CMS schema wins.

```typescript
import { SEO_FIELD_CANDIDATES } from '@krantho/seo-shared'

SEO_FIELD_CANDIDATES.description  // ['meta-description', 'description', 'ingress', 'excerpt']
SEO_FIELD_CANDIDATES.image        // ['og-image', 'image', 'hero-image']
```

### `resolveEffectiveTypes(document, collection, site): readonly string[]`

Resolve the effective Schema.org types for a document by cascading through the scope hierarchy. The first scope with configured entity types wins.

```typescript
import { resolveEffectiveTypes } from '@krantho/seo-shared'

const types = resolveEffectiveTypes(
  null,                                              // no document-level config
  { entities: [{ '@type': 'Article' }] },           // collection says Article
  { entities: [{ '@type': 'ProfessionalService' }] }, // site says ProfessionalService
)
// ['Article'] — collection wins because document has no types
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `document` | `ScopeWithEntities \| null` | Document-level SEO config |
| `collection` | `ScopeWithEntities \| null` | Collection-level SEO config |
| `site` | `ScopeWithEntities \| null` | Site-level SEO config |

**Returns:** `readonly string[]` — Schema.org type names from the most specific scope that has types, or empty array.

### `inferSeoConfigScope(id): 'site' | 'collection' | 'document' | 'route'`

Infer the SEO configuration scope from a config ID string.

```typescript
import { inferSeoConfigScope } from '@krantho/seo-shared'

inferSeoConfigScope('site')                    // 'site'
inferSeoConfigScope('collection:pages')        // 'collection'
inferSeoConfigScope('doc:pages/about')         // 'document'
inferSeoConfigScope('route:/blog/*')           // 'route'
```

**ID conventions:**

| Prefix | Scope |
|--------|-------|
| `site` | `'site'` |
| `collection:` | `'collection'` |
| `doc:` | `'document'` |
| `route:` | `'route'` |
| *(other)* | `'document'` (fallback) |

### `serializeJsonLd(data): string`

Serialize a value for embedding inside a `<script type="application/ld+json">` tag. Escapes `<` to `\u003c` to prevent XSS via premature tag termination.

```typescript
import { serializeJsonLd } from '@krantho/seo-shared'

const json = serializeJsonLd({
  '@context': 'https://schema.org',
  '@type': 'Article',
  name: 'My <Special> Page',
})
// '{"@context":"https://schema.org","@type":"Article","name":"My \\u003cSpecial> Page"}'
```

This is the canonical implementation — all framework components (`@krantho/seo`, `@krantho/ui-react`, `@krantho/ui-svelte`) use this instead of maintaining their own escape logic.

### Types

```typescript
/** All SEO concepts that can be mapped to CMS fields */
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

/** Type alias for an SEO concept name */
type SeoFieldConcept = keyof SeoFieldMap

/** A single Schema.org entity in the SEO configuration */
interface SeoConfigEntity {
  readonly '@type': string
  readonly '@id'?: string | undefined
  readonly role?: string | undefined
  readonly properties: Readonly<Record<string, unknown>>
}

/** SEO configuration data stored per scope */
interface SeoConfigData {
  readonly entities: readonly SeoConfigEntity[]
  readonly fieldMappings?: Readonly<Record<string, string>> | undefined
}

/** Minimal interface for scope resolution */
interface ScopeWithEntities {
  readonly entities: readonly { readonly '@type': string }[]
}
```

## Usage

### Installation

```bash
pnpm add @krantho/seo-shared
```

### Field discovery in a server adapter

```typescript
import { buildSeoFieldMap, resolveSeoField } from '@krantho/seo-shared'

// Given a collection schema with these fields:
const schemaFields = ['title', 'description', 'meta-description', 'author', 'og-image']
const fieldMap = buildSeoFieldMap(schemaFields)

// Resolve SEO values from a specific document's fields:
const doc = {
  title: 'Getting Started',
  description: 'A quick intro to krantho.',
  'meta-description': 'Learn how to set up krantho in under 5 minutes.',
  author: 'Jane Doe',
  'og-image': '/images/getting-started.jpg',
}

const metaDescription = resolveSeoField(fieldMap, 'description', doc)
// 'Learn how to set up krantho in under 5 minutes.' — meta-description wins
```

### Scope cascading in Studio

```typescript
import { resolveEffectiveTypes, inferSeoConfigScope } from '@krantho/seo-shared'

// Determine what types apply to a document:
const effectiveTypes = resolveEffectiveTypes(docConfig, collectionConfig, siteConfig)

// Route a config ID to the right scope:
const scope = inferSeoConfigScope('collection:services')  // 'collection'
```

### JSON-LD in a React component

```typescript
import { serializeJsonLd } from '@krantho/seo-shared'

function JsonLdScript({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
```

## Dependencies

### Runtime Dependencies

None. Zero dependencies by design.

### Workspace Dependencies

None. This package is consumed by `@krantho/seo`, `@krantho/ui-react`, `@krantho/studio`, and `@krantho/api`.

### Peer Dependencies

None.
