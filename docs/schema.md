# @krantho/schema

Content schema system for krantho. Define typed content collections with Zod schemas, validate fields at build time, and get full TypeScript type inference for content data.

## Context

Content types are explicitly defined with `defineCollection()` and Zod schemas. This replaces runtime inference -- schemas are declared upfront, validation catches errors early, and TypeScript infers field types automatically.

## Architecture

```
collection.ts        defineCollection() -- creates typed Collection<T>
      |
  config.ts          defineConfig() -- assembles collections into ContentConfig
      |
validate-content.ts  validateAllContent() / validateFields()
      |              uses Zod safeParse for validation
  errors.ts          ContentValidationError, ValidationError, ValidationResult
      |
runtime-schema.ts    runtimeFieldToZod, runtimeFieldsToZod, mergeSchemas, exportSchemaAsZod
      |              bridges runtime fields (from Studio) with code-defined Zod schemas
  page/
    index.ts         definePage(), slug(), sections(), collection() -- page composition DSL
      |
schema-export.ts     collectionToJsonSchema() -- JSON Schema generation
      |
  index.ts           Public barrel export
```

## API Reference

### `defineCollection(config): Collection<T>`

Defines a named content collection with a source type and Zod schema.

```typescript
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: 'content/pages',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    'meta-description': z.string().optional(),
  }),
})

const blog = defineCollection({
  name: 'blog',
  source: 'database',
  path: '/articles/:slug',
  schema: z.object({
    title: z.string(),
    date: z.string().datetime(),
    author: z.string(),
    tags: z.array(z.string()).optional(),
  }),
})
```

Properties:

- `name` -- unique collection identifier
- `source` -- `'filesystem'` (`.md` files are master) or `'database'` (database is master)
- `directory` -- required for filesystem collections, path to content directory
- `schema` -- Zod object schema for field validation and type inference
- `path` -- optional; where the collection's documents render as pages. The sitemap, the editor's **Open on site**, the Next.js page refresh after a publish and the URLs in a page's JSON-LD all read it through `documentPath()` in `@krantho/core` ([core.md](core.md#cache-tags)):
  - a pattern holding `:slug` -- `'/articles/:slug'` renders `hello` at `/articles/hello`; the slug `index` renders at the pattern without its `/:slug` segment (`/articles`)
  - a fixed path -- `'/'` for a landing singleton; every document of the collection renders there, and the sitemap lists it once
  - `false` -- the documents have no page of their own (snippets, FAQ entries shown on other pages): left out of the sitemap, no preview link, no page refresh, and an empty JSON-LD `@graph`
  - unset -- `pages` render at the site root (`home` at `/`), `globals` have no pages, any other collection renders at `/<name>/<slug>`

  A string path must start with `/`, or `defineCollection()` throws.
- `sections` -- optional; the `##` sections the collection's page template designs, in order. The template gives each its own treatment, renders other sections as prose and leaves missing ones out; Studio shows editors which ones a document has, and `GET /api/collections` returns them. Each name is trimmed; an empty name, or a name listed twice (case aside), makes `defineCollection()` throw. `Collection.sections` is the checked list, empty when none is declared. Sections are split with `splitSections()` from `@krantho/core` ([core.md](core.md#sections)).

  ```typescript
  const features = defineCollection({
    name: 'features',
    source: 'filesystem',
    directory: 'content/features',
    path: '/features/:slug',
    sections: ['Problem', 'Approach', 'Proof', 'Limits'],
    schema: z.object({ title: z.string() }),
  })
  ```

Publication status is framework-owned `meta.status`, outside authored fields. Schemas cannot declare a `status` property. Publishing selects a saved version through its dedicated operation; ordinary saves create drafts.

The `Collection` type includes a phantom `_fields` property that carries the inferred TypeScript type from the Zod schema. This is never assigned at runtime -- it exists for type inference only.

### `defineConfig(input): ContentConfig`

Assembles collections into the project-level content configuration.

```typescript
import { defineConfig } from '@krantho/schema'

export default defineConfig({
  collections: { pages, blog },
})
```

Collection record keys must match collection names. The resulting `ContentConfig` stores collections in a `ReadonlyMap<string, Collection>`.

### `validateFields(fields, collection, slug): ValidationError[]`

Validates a single content item's fields against its collection's Zod schema. Returns an empty array when valid.

```typescript
import { validateFields } from '@krantho/schema'

const errors = validateFields(
  { title: 'Home', description: 'Welcome' },
  pages,
  'home',
)
```

### `validateAllContent(config, adapter, options?): Promise<ValidationResult>`

Validates all filesystem-mastered content across all collections. Database-mastered collections are skipped (they validate at write time).

When the adapter supports `query`, each collection's documents are read as one `summary` query scoped to that collection. Otherwise, falls back to `listSlugs()` + `read()` with frontmatter parsing.

```typescript
import { validateAllContent } from '@krantho/schema'

const result = await validateAllContent(config, adapter, { mode: 'warn' })

if (!result.valid) {
  for (const err of result.errors) {
    console.error(`${err.collection}/${err.slug}: ${err.field} -- ${err.message}`)
  }
}
```

#### `ValidateOptions`

```typescript
interface ValidateOptions {
  /** 'strict' throws on first collection with errors, 'warn' collects all errors */
  mode?: 'strict' | 'warn'
}
```

- `mode: 'strict'` (default) -- throws `ContentValidationError` on first error
- `mode: 'warn'` -- collects all errors and returns the full `ValidationResult`

### Types

```typescript
interface ValidationError {
  collection: string
  slug: string
  field: string
  message: string
  expected: string
  received: string
}

interface ValidationResult {
  valid: boolean
  errors: readonly ValidationError[]
  summary: { total: number; valid: number; invalid: number }
}
```

`ContentValidationError` extends `Error` with an `errors` array and a formatted message grouping errors by collection/slug.

### Page Composition DSL

#### `definePage({ route, content }): PageDefinition`

Declares a page route and its content dependencies. Used by the server handler to resolve content at request time.

```typescript
import { definePage, slug, sections, collection } from '@krantho/schema'

const homePage = definePage({
  route: '/home',
  content: {
    hero: slug('pages', 'home'),
    services: sections('pages', 'services', ['strategy', 'advisory']),
    blog: collection('blog', { limit: 3 }),
  },
})
```

Content reference helpers:

- `slug(collection, name, locale?)` -- reference a single content file (returns `SlugRef`)
- `sections(collection, slug, names, locale?)` -- reference specific `##` sections or `'*'` for all (returns `SectionsRef`)
- `collection(name, options?, locale?)` -- reference a collection with filtering/sorting (returns `CollectionRef`)

The `CollectionOptions` type supports `sort`, `limit`, `offset`, and `exclude`.

#### `collectionToJsonSchema(collection): CollectionJsonSchema`

Exports a collection's Zod schema as JSON Schema format. Used by Studio schema editor to auto-generate form fields.

```typescript
import { collectionToJsonSchema } from '@krantho/schema'

const jsonSchema = collectionToJsonSchema(pages)
// { name: 'pages', source: 'filesystem', schema: { ... } }
```

Uses Zod's `toJSONSchema()` internally.

### Runtime Schema

Runtime schemas allow Studio to add fields to collections without code changes. Code-defined fields always take precedence.

#### `mergeSchemas(codeSchema, runtimeFields): ZodObject`

Merges a code-defined Zod schema with runtime field definitions. Code fields win -- runtime fields only add new keys that do not exist in the code schema. Returns a new combined schema.

```typescript
import { mergeSchemas } from '@krantho/schema'
import type { RuntimeFieldDefinition } from '@krantho/persistence'

const merged = mergeSchemas(pages.schema, runtimeFields)
```

#### `exportSchemaAsZod(collectionName, codeProperties, codeRequired, runtimeFields): string`

Generates a Zod code string representing the merged schema. Used by Studio "Export" feature to let developers adopt runtime fields into code.

```typescript
import { exportSchemaAsZod } from '@krantho/schema'

const code = exportSchemaAsZod('pages', codeProps, codeRequired, runtimeFields)
// Returns a string like:
// const pages = defineCollection({
//   name: 'pages',
//   source: 'filesystem',
//   ...
// })
```

Supported runtime field types: `string`, `number`, `boolean`, `date`, `enum`, `url`, `email`, `textarea`, `color`, `reference`. Each supports constraints (`min`, `max`, `pattern`), `default` values, `required`/`optional`, `description`, `enumValues`, `refCollection`, and `isArray`.

Site identity is not validated here. It is `site` in the configuration tree, validated with every other leaf by `resolveConfig()` -- see [configuration.md](configuration.md).

### Wiring collections into the server

Collections are wiring, not configuration: they are passed to `createKranthoHandler({ config, collections })` (or a framework adapter such as `createApiRouteHandlers`), which calls `defineConfig()` itself. Call `defineConfig()` directly only when you need a `ContentConfig` outside the server, for example for `validateAllContent()`.

```typescript
import { defineCollection } from '@krantho/schema'
import { createApiRouteHandlers } from '@krantho/server-next'
import { z } from 'zod'
import config from '../../../krantho.config'

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: 'content/pages',
  schema: z.object({
    title: z.string(),
    description: z.string(),
  }),
})

export const { GET, POST, PUT, DELETE } = createApiRouteHandlers({
  config,
  collections: { pages },
})
```

## Dependencies

| Type | Package | Purpose |
|------|---------|---------|
| Runtime | `@krantho/persistence` | `IPersistenceAdapter` for `validateAllContent` |
| Runtime | `gray-matter` | Frontmatter parsing in fallback path |
| Peer | `zod` | Schema validation and type inference |
| Dev | `typescript` | Build toolchain |
