---
title: Content fields
description: The fields krantho recognizes in a document — standard, list and system fields, sections, custom fields and the shape the API returns.
area: reference
order: 20
level: beginner
prerequisites: [content-model]
related: [content-authoring, templates, configuration, api, glossary]
status: published
---

Content is stored as Markdown with YAML frontmatter. In files, the structured data between the `---` fences is called **frontmatter**. Inside the CMS — the API, Studio and persistence — the same data is called **fields**.

```markdown title="content/pages/about.md"
---
title: 'About krantho'
description: 'Krantho is a CMS library built by Descoped AS for developers who build content sites in their own codebase. Why it exists and where it stands.'
eyebrow: 'About'
status: published
---

Markdown body goes here.
```

The API returns this as `fields.title`, `fields.description`, and so on. The body and the rendered HTML are separate properties of the document.

Each collection's Zod schema decides which fields a document must have and what type each one takes. The fields below are the ones krantho itself reads.

## Standard fields

Every content document can use these fields.

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | The main page title. Used by Studio, SEO and rendering components. |
| `description` | `string` | Page description for display and fallback SEO. |
| `meta-description` | `string` | SEO-specific description. Falls back to `description` when empty. It is separate from `description` so you can write one blurb for people and another for search results. |
| `status` | `'draft' \| 'published' \| 'archived'` | Publication state. A file's `status` decides what it imports as; files without one import as `'published'` (`content.defaultStatus.filesystem`). In the database, publishing sets it: a document created through Studio or the API is `'draft'` until it is published. When a collection's schema declares a `status` field, it always states the document's state; for an archived document it says `archived` when the schema allows that value, otherwise `draft`. |

The content API returns the current version of each document, unpublished changes included. Pages show only the live version, the one last published. Editors can see unpublished changes on the page in Live mode or with **Open on site** when the site enables it — see [Studio](/docs/studio).

## List fields

Collections whose documents appear in lists often use these fields.

| Field | Type | Description |
|-------|------|-------------|
| `ingress` | `string` | Short lead-in text for cards and list views. Studio edits it in a textarea, and SEO falls back to it for the page description when `meta-description` and `description` are empty. |
| `order` | `number` | Sort position in a collection list. Lower numbers come first. Sort on it in your page template, or with `?sort=order` on the content API; krantho.com's feature, stack and docs lists sort on it. |

## System fields

The CMS runtime manages these fields. You set them in frontmatter, and the persistence layer moves them into the document's metadata.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `'draft' \| 'published' \| 'archived'` | `content.defaultStatus.filesystem` (`'published'`) | Whether the imported file is live: only `published` is. Moved into `meta.status`. |
| `locale` | `string` | `site.defaultLocale` | Content locale. Moved into `meta.locale`. Used for locale-aware API filtering. |

`splitFrontmatter()` in `@krantho/core` does this split. Afterwards `status` and `locale` live in the document metadata, and everything else stays in `fields`.

## Document structure

When the CMS loads a content file, it produces a `ContentDocument` with this shape:

```ts
interface ContentDocument {
  meta: DocumentMeta               // collection, slug, locale, version, liveVersion, status, source, changedBy, createdAt
  fields: Record<string, unknown>  // all frontmatter except status and locale
  body: string                     // raw markdown
  html: string                     // rendered HTML
  sections: Record<string, string> // ## headings mapped to rendered HTML
}
```

`meta.version` is the current version, the newest one. `meta.liveVersion` is the version visitors see, or `null` when nothing is live. `meta.status` follows from it: `published` while a version is live, `draft` when none is, `archived` for an archived document.

## Sections

Markdown `##` headings are parsed into named sections. A body with:

```markdown
## Why it exists

Why krantho was built.

## Where it stands

What works today.
```

produces `sections['Why it exists']` and `sections['Where it stands']`, each holding the rendered HTML of the markdown under that heading. A `##` line inside a fenced code block is not a heading, and when two sections share a heading, `sections` holds the first. A page template can place each section where its design wants it. To work with the markdown of each section instead, split the body with `splitSections()` from `@krantho/core` — see [Templates](/docs/templates#designed-sections).

## Custom fields

You can add any field not listed above. The CMS stores it in the `fields` record and returns it through the API.

```yaml
---
title: 'September 2026'
version: '0.1.0 (unreleased)'
date: '2026-09-30'
---
```

Read custom fields the same way: `fields['version']`, `fields['date']`. Declare them in the collection's schema so Studio shows them as form inputs; an administrator can also add a runtime field to a collection from Studio's schema editor. Runtime fields are additive — a field defined in code cannot be changed at runtime.

## Field references in the body

A body can refer to one of its own fields by writing `@` followed by the field name. When the document has that field, the reference is replaced with the field's value before the Markdown is rendered; otherwise it is left as written. With the frontmatter above, `This release is @version.` renders as "This release is 0.1.0 (unreleased)." The API's content engine does this while `content.atNotation` is on, which is the default. Pages that read published content through the React content loader render with `renderContent()` from `@krantho/core`, which expands references too, whatever that setting says.
