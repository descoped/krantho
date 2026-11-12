---
name: content-model
description: >
  Designs the content model of a krantho site: content templates (collections whose Zod schemas
  are the forms editors fill in /studio) together with the page templates (routes and components)
  that render them. Use when asked which collections a site needs, to add or change a collection
  or field, to model a landing page, features, services, blog, documentation, code samples, FAQ,
  glossary or changelog, to add reference or media pickers, tags, enums or ordering, to decide
  between fields, the markdown body and ## sections, or to build the page that shows a
  collection. Ships starter templates for common site sections.
compatibility: krantho 0.1.x; Claude Code
metadata:
  krantho-version: 1.0.0
  docs: https://krantho.com/docs/content-model
---

# Content templates and page templates

## Contents

- Workflow
- Anatomy of a collection
- Choosing the shape
- Fields, body or sections
- Globals
- Code-first schemas and runtime fields
- Localization
- SEO fields
- Templates in this skill
- Checks before you finish

Two halves, designed together:

- A **content template** is a collection in `krantho.collections.ts`: a name, a source directory
  and a Zod schema. The schema is the form an editor fills in `/studio`, and validation on every
  import and every save.
- A **page template** is a route and component that reads published documents of one or more
  collections and renders them. Layout is code; copy is content.

krantho has no page builder. A document is **fields** (frontmatter) plus a **markdown body**,
and the body's `##` headings are **sections** a page template can place one by one.

## Workflow

1. **List the pages the site needs**, then group them: what repeats (a list with detail pages),
   what exists once (a singleton), what appears on every page (globals), what is embedded in
   other pages (snippets, FAQ entries).
2. **One collection per kind of thing.** Name it by what it holds, plural, lowercase, word
   characters only (`features`, `docs`, `releases`): reference pickers only match `\w+` names.
3. **Draw the route map** before writing schemas (below). krantho assumes `pages` at the site
   root and every other collection at `/<collection>/<slug>`.
4. **Write each schema** from what the page template needs: fields for anything the page places,
   styles or filters on; the body for running prose; `##` sections for prose the page places in
   separate spots. Details: `${CLAUDE_SKILL_DIR}/references/fields.md`.
5. **Write the page template** for each routed collection, marking the fields and sections it
   renders: `${CLAUDE_SKILL_DIR}/references/page-templates.md`.
6. **Seed content** as `content/<collection>/<slug>.md` so a fresh database has real documents
   (the `content` skill covers writing them).
7. **Check:** typecheck, start the dev server, open each form in `/studio`, open each route,
   publish a change and see it appear.

Start from `${CLAUDE_SKILL_DIR}/templates/` when the site needs any of these sections — copy
what fits, rename fields to the project's vocabulary, and delete the rest.

## Anatomy of a collection

```ts
import { join } from 'node:path'
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

const dir = (name: string): string => join(process.cwd(), 'content', name)
const status = z.enum(['draft', 'published']).default('published')
const ref = (collection: string) => z.string().describe(`ref:${collection}`)
const media = () => z.string().describe('media')

const features = defineCollection({
  name: 'features',
  source: 'filesystem',
  directory: dir('features'),
  sections: ['Problem', 'Approach', 'Proof', 'Limits'], // the ## sections its template designs
  schema: z.object({
    title: z.string(),
    description: z.string(),              // a textarea: the name contains "description"
    order: z.number().default(99),        // a number input; lists sort by it
    icon: z.enum(['content', 'search', 'speed']), // a select
    tags: z.array(z.string()).optional(), // a tag input
    image: media().optional(),            // a media picker; stores the media id
    'docs-page': ref('docs').optional(),  // a reference picker; stores the slug
    status,
  }),
})

export const collections = { features }
```

- `export const collections = { … }` in one module; each key equals its collection's `name`.
- Field names are kebab-case strings (`'docs-page'`), as in the markdown frontmatter.
- Keep a `status` field in every schema. krantho keeps it equal to the document's publication
  state: `published` while a version is live, `draft` while none is. A file's `status` decides
  whether its import is live (`published` when it has none, `content.defaultStatus.filesystem`);
  documents created in Studio or API are drafts until published.
- `sections` lists the `##` sections the page template designs, in order (see below).
- Saving never changes what visitors see; publishing makes the current version live. The
  `content` skill covers drafts, publishing and locks.
- `source: 'filesystem'` + `directory` imports the files into an empty database. The database
  is then the source of truth, with version history.

## Choosing the shape

| Shape | Use for | Route | Example |
|---|---|---|---|
| List → detail | things that repeat: services, features, posts, docs | `/<collection>` and `/<collection>/<slug>` | `features` |
| Singleton | a page with its own form that exists once | one route; one document, conventionally `home` or the page name | `landing/home` |
| Globals | site-wide data read by the layout: navigation, footer, announcement | none (`globals` never has a page) | `globals/navigation` |
| Standalone pages | about, contact, legal — title, description, body | `/<slug>` (the `pages` collection) | `pages/about` |
| Embedded | pieces shown inside other pages: code samples, FAQ entries, glossary terms | none, or one combined page | `faq/*` |

A singleton or embedded collection still produces `/<collection>/<slug>` paths in krantho's
sitemap and in Studio's **Open on site**. Keep them out of the sitemap with a
`'robots-index': z.boolean().default(false)` field (the sitemap skips documents whose
`robots-index` is `false`), and give a singleton a redirect from its conventional path to the
route that renders it (see `references/page-templates.md`).

## Fields, body or sections

- **Field** — anything the page template places, styles, links, sorts or filters on: titles,
  short text, labels and targets of buttons, numbers, dates, enums, references, media, tags.
- **Body** — running prose that renders as one block of HTML.
- **`##` sections** — prose the page template places separately ("## Problem" in one band,
  "## Fit" in another). The section name is the heading text as written. Declare the sections a
  template designs on the collection, in order — `sections: ['Problem', 'Approach', 'Proof',
  'Limits']` — and read them in the template as `collections.features.sections`. That list is
  the **section contract** editors follow: a declared section gets its designed treatment, any
  other section renders as prose, a missing one is left out. `GET /api/collections` returns
  it, and `splitSections()` / `findSection()` from `@krantho/core` split a body the same way
  krantho does.

Avoid layout fields (`column-count`, `background-color`) and HTML in fields. Keep one idea per
field; a list of structured items is either a list collection or a string array with a simple
format the template parses (`Label|/href`).

## Globals

One frontmatter-only document per concern (`navigation`, `footer`, `announcement`), all in the
`globals` collection, so Studio shows them together. Read them in a layout below the root
layout (Next.js prerenders its 404 page through the root layout, without a database). A change
to a global refreshes every page that shows it.

## Code-first schemas and runtime fields

The Zod schema in code is authoritative and read-only in Studio. An admin can add
**runtime fields** to a collection (Setup › Collections & schema → **Fields** in Studio, or
`PUT /api/schema/<collection>/fields`):
additive only, never overriding a code field. When a runtime field proves useful, move it into
the Zod schema. `GET /api/schema/<collection>/export` prints the merged schema as Zod source.

## Localization

Set `site.supportedLocales` and `site.defaultLocale` in `krantho.config.ts`. Each document can
exist per locale; editors switch locale in the editor, and reads take a locale
(`getCMSContent(collection, slug, { locale })`; omitted means the default locale). Design
fields so every translatable string is a field or body text, never code.

## SEO fields

Add `meta-description` (120–155 characters) to routed collections; SEO falls back to
`description` when it is empty. Optional: `og-image` (media), `canonical-url`, `robots-index`,
`date` or `published-date` and `author` where the page type has them. The `seo` skill maps
collections to Schema.org types.

## Templates in this skill

`${CLAUDE_SKILL_DIR}/templates/` — starter content templates and Next.js page templates:

| Template | Shape | Files |
|---|---|---|
| Landing | singleton | `collections.ts` (`landing`), `next/app/(site)/[[...slug]]/page.tsx`, `content/landing/home.md` |
| Feature | list → detail | `features`, `next/app/(site)/features/[[...slug]]/page.tsx`, `content/features/example.md` |
| Docs page | list → detail with areas, order and prerequisites | `docs`, `next/app/(site)/docs/[[...slug]]/page.tsx`, `content/docs/getting-started.md` |
| Snippet | embedded code sample with a stack | `snippets`, `next/components/sample.tsx`, `content/snippets/install-next.md` |
| FAQ | embedded question and answer | `faq`, `next/components/faq.tsx`, `content/faq/example.md` |
| Glossary | one combined page | `glossary`, `next/app/(site)/glossary/[[...slug]]/page.tsx`, `content/glossary/release.md` |
| Release | list → detail changelog | `releases`, `next/app/(site)/releases/[[...slug]]/page.tsx`, `content/releases/0-1-0.md` |

Shared helpers are in `next/lib/content.ts` (typed field reads, sorting, image URLs, safe JSON-LD)
and `next/components/html.tsx`; the loader setup is `next/lib/krantho.ts`. List routes read
their own title and intro from a `pages` document of the same name (`pages/features`), which
also puts the list URL in krantho's sitemap. The `content/globals/` files match the navigation
and footer shape in `collections.ts`. For SvelteKit and Express, the same collections apply
unchanged, and `references/page-templates.md` shows the load-function form of a page template.

The templates assume the `@/*` path alias, `cache.pages: 'next-isr'`, and the redirect from
`/landing/*` to `/` described in `references/page-templates.md`.

## Checks before you finish

- Every routed collection has a page template, a 404 for unpublished slugs, a title and meta
  description, and JSON-LD where the `seo` skill configures a type.
- Every page template reads only published content through the loader, never `/api` over HTTP.
- Every page template marks the fields and sections it renders, each with its own document
  (`kranthoField`, `kranthoSection`, `markBodySections` from `@krantho/core/marks`), so editors
  can edit the page in place in Studio's Live mode; see `references/page-templates.md`.
- Sample content validates: a file that fails the schema is skipped on import with a warning in
  the server log, so check the log after a fresh import.
- The Studio form reads well: field order in the schema is the form order; names are clear to an
  editor; enums have short values.
