# Document contracts and repository lifecycle

A **document** is addressed by collection, slug and locale. A page is a rendered resource. A global is a shared document that usually has no page. Website content, blog posts and news articles are document archetypes, not separate persistence models.

## Code owns the contract

`defineDocumentArchetype` defines a stable ID, label, fields, metadata slots, body policy and designed sections. `defineMetadataArchetype` defines a reusable named group. A collection binds one document archetype. `schema` remains the native shorthand for an inline `collection/<name>` archetype; supply either `schema` or `archetype`.

```ts
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
  fields: z.object({ title: z.string().min(1) }),
  metadata: { editorial: { archetype: editorial, required: true } },
  body: 'required',
})

export const articles = defineCollection({
  name: 'articles', source: 'database', archetype: article,
})
```

`fromPortableJsonSchema` retains a reviewed JSON Schema when adopting exported definitions, so normalization into Zod checks cannot change its archived contract identity.

The schema export endpoint emits the complete resolved contract as Zod-backed code, including metadata groups and nested constraints, for reviewed adoption in the repository. Review its collection directory before committing generated code.

The compiled contract is portable JSON Schema. Content hashes identify definition revisions deterministically; object declaration order and labels do not change identity, so renaming a label keeps saved snapshots on the same revision. Every saved CMS revision archives the complete resolved contract, including group definitions. Historic reads do not require executable definitions from current application code.

`websiteContent`, `blogContent`, `editorialMetadata`, `publicationMetadata`, `classificationMetadata` and `sharingMetadata` are supplied presets. There is no inheritance or automatic mix-in merge. Define a separately identified variant when a site needs another structure.

## Author values and framework facts

A revision stores `fields`, `body`, `metadata`, `contract`, `defaults` and repository agreement bookkeeping. HTML and sections are derived. Framework `meta` reports identity, version, actor, timestamp, source, lifecycle status and the live revision pointer. Author schemas cannot claim reserved root names such as `status`, `slug`, `locale` or `changedBy`. These are the system fields: krantho keeps them, and Studio shows them read-only. "Metadata" means the authored groups.

### Timestamps

A timestamp is a string schema with `format: 'date-time'` (`z.iso.datetime()`), stored as UTC with a Z and a time, `2026-10-10T09:30:00Z`. Core converts what is written, before the strict schema sees it: a date alone becomes midnight UTC (`2026-10-10` → `2026-10-10T00:00:00Z`), a time with an offset becomes UTC (`2026-10-10T11:30:00+02:00` → `2026-10-10T09:30:00Z`), and a time without a zone is read as UTC, never as the machine's clock. A value that is not a moment is left as written, so validation refuses it. `validateDocument` converts in fields and in metadata groups, nested objects, arrays and unions included, and `saveDocument` stores the result, so Studio, the API and the assistant store the same form. Studio shows a timestamp in the viewer's locale and time zone (an offset such as GMT+2 beside it) and writes it back as UTC; `toUtcTimestamp` and `normalizeTimestamps` are exported from `@krantho/core`.

Complete saves validate nested fields, group properties, required groups and body policy. Unknown properties return 422 with full paths. Explicit open record schemas retain their declared dictionary behavior. SQL writes compare the expected document revision inside a transaction. Concurrent updates return 409.

The filesystem adapter can store untyped values at its low-level interface. It has no version history or independent draft/live revisions. The CMS paths always resolve a contract before writing.

## Draft, publish and restore

One draft revision contains fields, body, metadata and default provenance together. Saving keeps the earlier published version visible. Publishing appends a publication revision and advances the live pointer. Unpublishing or archiving clears that pointer. Historic actor and timestamps remain unchanged.

A code or runtime definition edit produces a new active contract. Existing snapshots retain theirs. A content save adopts the active contract; publishing validates the saved snapshot contract. Restore validates old values against the active contract and saves a new draft only if valid. An incompatible restore returns 422 without mutation. **Prepare an earlier snapshot as a draft** lets an editor correct values and explicitly remove obsolete properties before saving.

## Explicit shared defaults

The document defaults endpoint previews a source document of the same locale. Compatible metadata slots must have the same slot name and reference the same group identity. The whole resulting document must validate, including during preview. Applying requires the target and source versions from that preview. It creates a draft and pins source collection, slug, locale, version, JSON Pointer property paths and copied values.

Missing properties are filled. Empty strings, empty arrays, null, false and zero are authored values. Reapplication updates a copied property only while it still equals its recorded source value. Ordinary saves remove provenance for overridden properties. Later source edits never change an already saved snapshot.

## Optional SEO

The CMS and `@krantho/schema` do not require `@krantho/seo`. Generic sharing, editorial and publication groups can be used without it. Sites using structured data explicitly declare a `seo` slot with `DOCUMENT_SEO_METADATA_SCHEMA` from the SEO package.

Document SEO belongs in `metadata.seo`; graph edits and AI enrichment use the same draft save, validation, locks and revision checks as other content. Shared site, collection and route policies remain runtime configuration. They are resolved alongside the published document's metadata and are not frozen into its snapshot. Document publication invalidates document SEO reads; draft saves do not refresh visitor caches.

## Content moves both ways

Development file watching uses the common document save path, including hooks and edit locks, and saves drafts. Initial repository seeding remains a separate deployment operation governed by the filesystem publication policy.

1. Developers define collection contracts and can author Markdown seed files in the repository.
2. Empty databases import validated filesystem collections. Manifest-controlled synchronization compares canonical authored values with the recorded repository/database basis.
3. Editors save and publish database revisions through Studio or the API.
4. Export current drafts or published versions as portable JSON or Markdown. Review the exported files in Git.
5. Import reviewed files. Their contract ID and revision must match the active contract; after a definition change, review and explicitly adopt the active contract before importing. Unchanged authored content does not create a revision. A database change against the exported basis produces a conflict rather than overwriting editor work. Imports save drafts; publication is explicit.

The portable envelope contains `identity`, complete `contract`, `fields`, `metadata`, `defaults`, `body` and optional `basis` (checksum and version). Markdown keeps author fields in frontmatter and reserves `identity`, `contract`, `metadata`, `defaults` and `basis` for the envelope. Hand-authored seed files may omit the envelope; their collection supplies the active contract and default locale. The root `status` seed directive controls initial publication and is not an author field.

Checksums compare validated values, not YAML formatting or object-key order. Removing or unlinking a repository file never implicitly deletes a database document. Explicit conflicts need review. A content export is a current or published snapshot exchange, not a history archive or disaster-recovery checkpoint. Media export includes metadata, not file bytes. Runtime definitions in bundles are review material and are not silently installed over code definitions.

CLI examples:

```sh
krantho export articles --state published --locale en --out content/articles
krantho export articles --state current > articles.json
krantho import articles articles.json
krantho export --bundle site.json --state published
krantho import --bundle site.json
```

Markdown directory export uses flat `<slug>.md` filenames. Export one locale at a time when locales share slugs; collisions are rejected. Use JSON for nested slugs or all-locale transfers.

CLI directory imports consume the JSON-valued frontmatter emitted by export; they are not a general multiline YAML parser. Preserve the identity locale and exact body when exchanging files.

## Composition

`slug(collection, name, locale?)` and `sections(collection, slug, names, locale?)` identify their collection explicitly. The resolver receives an `IPublishedContentLoader`, reads published documents only, and returns metadata alongside fields and rendered content for document and collection results. Section results contain section name, title and HTML only. Collection lists use `listPublished`. Loader tags track each document and collection dependency. Layout remains application code; this contract adds no page builder.

## Persistence and retention

SQLite and PostgreSQL store authored values with each append-only content revision. Current and published snapshots remain protected during history pruning; their inline contracts remain available. A write that leaves out the metadata, contract, defaults or repository basis keeps the previous version's; naming one as empty clears it. In the API, content reaches the adapter through `saveDocument` (edits, restores, defaults, the assistant), `changePublication` and the media reference updater. Each names the version it read, so a concurrent change is a conflict and never a silent overwrite; `write-paths.test.ts` keeps it that way.

Migration `v013-content-contracts` adds the `authored` column to existing databases, where earlier rows have no metadata and no contract until their next save. It also moves each document's own SEO from `seo_config` into the `seo` metadata of every version of that document.

## Metadata authoring boundary

Live edits document fields and body in place; its sidebar has no duplicate content form. **Metadata** edits the separately declared groups, rendered from each group's schema under the name the page reads it by (`document.metadata.<group>`), below the body in Structure mode; an optional group not in use is one row with an Add action. What krantho keeps for a version — status, version, locale, who saved it and when — is shown beside it as the read-only **System** line, never as an input. **Search and sharing** is the sharing preset in a block of its own: search uses the page title and description, without repeating them, and creates an override only when the author chooses Write your own, with the length of each text against the site's limits under its field. Optional booleans distinguish absence (Use default) from Yes and No. Structured-data editing opens the graph editor in Data view. Shared-default review/apply (Copy from another page) lives inside each group and copies only that group. Source labels identify copied values and disappear when the draft overrides them.

The examples declare an optional Editorial group with author and review date. Page implementations can read `document.metadata.editorial` independently of `document.fields` and `document.body`; all three are saved together.
