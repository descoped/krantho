---
title: "@krantho/schema"
description: Define typed content collections with Zod schemas, with validation and type inference.
area: reference
order: 108
level: intermediate
prerequisites: [content-model]
next: [package-server]
related: [templates, content-fields, package-core, package-studio]
status: published
---

Define your content structure in code. Collections declare their fields with Zod schemas, which gives you TypeScript type inference and validation: the API validates every document it creates, updates or imports, and `validateAllContent()` checks your markdown files. The same schemas are the forms editors fill in Studio.

## Install

> [!NOTE]
> Krantho is in active development and its packages are not on npm yet. The command below is the one the first release will use. To run krantho today, see [Project status](/docs/project-status).

```bash
pnpm add @krantho/schema
```

Peer dependency: `zod` 4.

## Define a collection

`defineCollection` declares a content type with its fields and its source.

```ts title="krantho.collections.ts"
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

export const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: 'content/pages',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    'meta-description': z.string().optional(),
  }),
})
```

- `source: 'filesystem'`: the markdown files are the source of truth
- `source: 'database'`: the database is the source of truth
- `directory` is required for filesystem collections
- `path` (optional) is where the documents render as pages, read by the sitemap, the draft preview, the re-render after a publish and the page's JSON-LD: a pattern such as `'/deploy/:slug'` (the document `index` renders at `/deploy`), a fixed path such as `'/'` for a landing page, or `false` for documents with no page of their own. Without it, `pages` render at the site root (`home` at `/`), `globals` have no pages, and other collections render at `/<name>/<slug>` — see [Content model](/docs/content-model#edit-details-alongside-the-page)

## Pass collections to the server

Collections are wiring, not configuration. Hand them to the server handler next to the configuration from `krantho.config.ts`:

```ts
createKranthoHandler({ config, collections: { pages, blog } })
```

The handler assembles them with `defineConfig()`. Call `defineConfig()` yourself only when you need a `ContentConfig` outside the server, such as for `validateAllContent()` below:

```ts
import { defineConfig } from '@krantho/schema'

const contentConfig = defineConfig({ collections: { pages, blog } })
```

## Validate content

Check the markdown files of every filesystem collection against its schema. Database collections are validated when they are written.

```ts
import { validateAllContent } from '@krantho/schema'

const result = await validateAllContent(contentConfig, adapter, { mode: 'warn' })

if (!result.valid) {
  for (const err of result.errors) {
    console.error(`${err.collection}/${err.slug}: ${err.field}: ${err.message}`)
  }
}
```

`mode: 'strict'` (the default) throws a `ContentValidationError` at the first document with errors. `mode: 'warn'` collects every error and returns them with a summary (`total`, `valid`, `invalid`).

Validate a single item:

```ts
import { validateFields } from '@krantho/schema'

const errors = validateFields(
  { title: 'Home', description: 'Welcome' },
  pages,
  'home',
)
```

## Page composition

Declare the content a page route depends on.

```ts
import { definePage, slug, sections, collection } from '@krantho/schema'

const aboutPage = definePage({
  route: '/about',
  content: {
    page: slug('pages', 'about'),
    story: sections('pages', 'about', ['Why it exists', 'Where it stands']),
    releases: collection('releases', { limit: 3 }),
  },
})
```

- `slug(collection, name, locale?)`: a single content file
- `sections(collection, slug, names, locale?)`: specific `## sections` of a file
- `collection(name, options)`: a filtered collection

## Runtime schema

Studio can add fields to collections without code changes. Runtime fields are additive only, and code-defined fields always take precedence.

```ts
import { mergeSchemas } from '@krantho/schema'

const merged = mergeSchemas(pages.schema, runtimeFields)
```

Export the merged schema as Zod code to adopt runtime fields into your codebase:

```ts
import { exportSchemaAsZod } from '@krantho/schema'

const code = exportSchemaAsZod('pages', codeProps, codeRequired, runtimeFields)
```

## Site configuration

Site identity is not validated here. The `site` section of `krantho.config.ts` is part of the configuration tree in `@krantho/config`, and `resolveConfig()` validates the whole tree once at startup. See [Configuration](/docs/configuration).

## JSON Schema export

Export a collection schema as JSON Schema, which Studio uses to generate its forms.

```ts
import { collectionToJsonSchema } from '@krantho/schema'

const jsonSchema = collectionToJsonSchema(pages)
```

## Next steps

- Load content with your schemas: [@krantho/core](/docs/package-core)
- Set up the server handler: [@krantho/server](/docs/package-server)
- Manage schemas in Studio: [@krantho/studio](/docs/package-studio)
