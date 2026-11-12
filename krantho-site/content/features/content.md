---
title: 'Content and collections'
description: 'Define collections as Zod schemas in your codebase. They type your pages, validate every save, and become the forms editors fill in Studio.'
benefit: 'Your content model is code you review, type-check and version with the site.'
order: 1
icon: content
proof-sample: collections
docs-page: content-model
status: published
---

## Problem

In many CMSs the content model lives in a web interface, apart from the code that renders it. A renamed field breaks a page at runtime, and nothing in your build notices. Review, history and types stop at the edge of the repository.

## Approach

A collection is declared with `defineCollection()` from `@krantho/schema`: a name, a Zod schema, and a directory of markdown files that seeds it on first boot. Frontmatter becomes the document's fields. The markdown body is rendered to HTML and split at its `##` headings into sections, so a page template can place each one where it belongs.

Every save in the database appends a version. The version editors work on and the version visitors see are kept apart: a save leaves the live version in place, and Publish makes the new version live.

The schemas in your code are read-only in Studio. Studio's schema editor can add runtime fields to a collection — text, long text, number, yes/no, date, choice, URL, email, color or a reference to another document — but only as new keys: code always wins. Studio exports the merged schema as Zod code, so a field that proves useful can move into the codebase.

Documents are locale-aware. Each locale of a document is stored and published on its own, and the site declares the locales it publishes in its configuration.

## Proof

This page is a seed file of krantho.com's `features` collection, whose definition is shown here. Its fields are validated against that schema, and each `##` heading becomes a named section:

```md title="content/features/content.md"
---
title: 'Content and collections'
description: 'Define collections as Zod schemas in your codebase. They type your pages, validate every save, and become the forms editors fill in Studio.'
benefit: 'Your content model is code you review, type-check and version with the site.'
order: 1
icon: content
proof-sample: collections
docs-page: content-model
status: published
---

## Problem

In many CMSs the content model lives in a web interface, apart from the code that renders it.

## Approach

A collection is declared with `defineCollection()` from `@krantho/schema`.
```

The features page template gives each section its own layout. A template can also render one section by name:

```tsx
<CMSMarkdownServer collection="features" slug="content" section="Limits" />
```

## Limits

- Content is fields plus a markdown body. There is no block editor and no page composition: layout is a frontend concern, written in your components.
- Runtime fields only add keys. They cannot change or remove a field the code defines.
- The filesystem backend works on the markdown files themselves. It keeps no version history, so a draft and the live page are the same file, and it has no media. It is meant for development; drafts, history and media need SQLite or Postgres.
