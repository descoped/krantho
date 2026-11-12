---
title: Content model
description: Define reusable document contracts in code and edit versioned fields, Markdown and metadata together.
area: concepts
order: 10
level: beginner
stacks: [next, sveltekit, express]
prerequisites: [introduction]
next: [templates, content-authoring]
related: [content-fields, package-schema, persistence]
status: published
---

A **document** is content identified by its collection, slug and locale. A page is what your website renders from that content. A global is a shared document, such as navigation or footer content, usually without a page of its own.

Documents have structured fields, a Markdown body and named metadata groups. Define their complete structure in your codebase. Studio uses that contract to validate writes and show editing controls.

## Define a reusable article

A document archetype names a complete structure. A metadata archetype names a reusable group of properties. A collection binds to one document archetype:

```ts title="krantho.collections.ts"
import { defineCollection, defineDocumentArchetype, defineMetadataArchetype } from '@krantho/schema'
import { z } from 'zod'

const editorial = defineMetadataArchetype({
  id: 'example/editorial',
  label: 'Editorial',
  schema: z.object({ byline: z.string().min(1) }),
})

const article = defineDocumentArchetype({
  id: 'example/article',
  label: 'Article',
  fields: z.object({ title: z.string().min(1), summary: z.string().optional() }),
  metadata: { editorial: { archetype: editorial, required: true } },
  body: 'required',
})

export const articles = defineCollection({
  name: 'articles',
  source: 'database',
  path: '/articles/:slug',
  archetype: article,
})

export const collections = { articles }
```

`editorial` is the slot name in each document. Its group has a stable identity, `example/editorial`. The article requires the group, and the group requires a byline. Optional groups may be absent; present groups must satisfy their schema.

For a small collection, use `schema: z.object(...)` instead of `archetype`. That creates an inline collection contract. Supply one or the other.

Krantho supplies `websiteContent` and `blogContent` archetypes, plus editorial, publication, classification and sharing groups. Create an explicitly named variant when your website needs another structure. There is no automatic inheritance.

## Edit details alongside the page

Live mode shows editable text in the page. The right panel has **Metadata** for separately declared groups, each under the name your page reads it by (`document.metadata.<group>`); in Structure mode they follow the body. Document fields stay in Live or Structure, without a second content form. A group you have not used is one row with **Add**. **Search and sharing** has its own block below it: search uses the page title and description until you choose **Write your own**, which starts from the page's text, and each text shows its length against the site's limits under its field.

Groups support text, selections, numbers, booleans, references, media, nested objects and arrays according to their schemas. Required details must be filled before saving. Declare a moment in time with `z.iso.datetime()`: Studio shows it in your time zone and saves it as UTC with a Z, so `2026-10-10T09:30:00Z`. A date written without a time is stored as midnight UTC, and a time with an offset is converted to UTC. Properties outside the current form remain visible for review and explicit removal when preparing an older snapshot.

The framework separately records collection, slug, locale, version, actor, timestamp and publication state. These are system fields: Studio shows them as a read-only **System** line, never as inputs, and they are not metadata properties. Do not declare `status` as an author field. An editorial byline is separate from the person who saved a revision.

## Save, publish and restore

With SQLite or PostgreSQL, **Save draft** saves fields, body, metadata and shared-default provenance in one revision. Visitors keep seeing the published revision. **Publish** makes the current content live.

Every saved revision retains its exact content contract. Changing a definition in code does not rewrite history. New saves use the active contract.

Restoring an older revision saves it as a new draft if its values satisfy the current contract. If the structure has changed, choose **Prepare an earlier snapshot as a draft**, correct its values, then save. This preparation does not write or publish anything.

The filesystem provider has no version history or independent published snapshot. Choose a database provider when you need draft review and history.

## Apply shared defaults deliberately

Save pending edits first. Expand a group in **Metadata**, open **Copy from another page**, choose a source collection and document, and review the proposed values for that group. **Apply to draft** copies compatible missing details and saves a revision. It records the source snapshot with the copied properties.

Later source changes do not alter saved documents. Applying again updates inherited properties that still equal their earlier copied value. Your overrides remain. Empty strings, empty arrays, null, false and zero count as your values.

## SEO is optional

Content editing does not require the SEO package. Generic sharing details can provide a title, description, image and canonical URL without it.

When your site enables structured data, declare its document SEO group explicitly. Graph edits and generated document SEO become draft metadata. Save and publish them with the document. Shared site, collection and route policies are resolved at runtime.

## Keep content in your codebase

Filesystem collections can start with Markdown seed files in a configured directory. The database stores edits and publication history. Export current drafts or published snapshots back to Markdown or JSON for Git review, then import reviewed content through the same validation as Studio. Exported contract IDs and revisions must match the active definition; after a definition change, review and explicitly adopt the active contract before importing.

The export includes document identity, locale, the full contract, fields, body, metadata, copied-default provenance and a repository/database basis. Unchanged values do not create a revision. Conflicting database edits require review. Import saves drafts; publishing remains explicit. Deleting a repository file does not delete its database document.

An export exchanges content snapshots. It is not a complete history backup. See [Persistence](/docs/persistence) for storage capabilities and [CLI](/docs/cli) for transfer commands.

## Next steps

- [Content authoring](/docs/content-authoring) — edit documents and author Markdown.
- [Content fields](/docs/content-fields) — choose typed controls.
- [Schema package](/docs/package-schema) — define collections and archetypes.
- [Content and page templates](/docs/templates) — render content with application components.
