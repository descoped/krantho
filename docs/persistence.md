# @krantho/persistence

Interface-only package that defines the persistence contract for krantho. Contains adapter interfaces for content, media, auth, SEO config, settings, locking, webhooks, retention, the shared page cache, and migrations. No implementations -- concrete adapters (SQLite, Postgres, filesystem) implement these interfaces in their own packages.

## Context

`@krantho/core` defines `IContentLoader` for reading content. A full CMS also needs to list slugs, write documents, manage versions, handle media, authenticate users, and configure SEO. These operations are persistence-specific and do not belong in the core engine. A separate interface package lets adapter implementations depend on a thin contract without pulling in the entire core.

## Architecture

```
src/
  index.ts           # Main interfaces, types, capability predicates, re-exports
  content-query.ts   # ContentQuery, QueryPage, QueryReader and canQuery: the one content list read
  content-row.ts     # NormalizedContentRow + shared row mapping functions
  live-version.ts    # Live-version and publication-state rules shared by the adapters
  auth.ts            # IAuthAdapter + user/token/permission types
  migrations.ts      # Migration, checkpoint, and content migration interfaces
  migration-utils.ts # Shared migration utilities (checksum validation, decision logic)
  page-cache.ts      # IPageCacheStore + the value encoding the SQL stores share
```

Re-exports from `@krantho/core`:

```typescript
export type { IContentLoader, ContentMetadata } from '@krantho/core'
```

---

## Content

### Content Model Types

```typescript
/** Content source -- how this content entered the system */
type ContentSource = 'filesystem' | 'api' | 'import'

/**
 * A document's publication state as of a version: published while a version is
 * live, draft when none is, archived (offline, kept), deleted (a tombstone)
 */
type ContentStatus = 'draft' | 'published' | 'archived' | 'deleted'
```

### DocumentMeta

System metadata managed by the CMS runtime, not by content authors.

```typescript
interface DocumentMeta {
  collection: string
  slug: string
  locale: string
  version: number
  /** The live version as of this version -- the document's live version when this is its current one; null when nothing is live */
  liveVersion: number | null
  status: ContentStatus
  source: ContentSource
  changedBy: string | null
  createdAt: string
}
```

`status` is derived from `liveVersion` (see [Live Version](#live-version)). A client compares the two numbers to describe the current version: live when `liveVersion === version`, unpublished changes ahead of live when `liveVersion !== null && liveVersion < version`, not published when `liveVersion === null`.

### ContentDocument

A content document in the CMS.

```typescript
interface ContentDocument {
  meta: DocumentMeta
  /** Schema-validated content fields (structured data, no system fields) */
  fields: Record<string, unknown>
  /** Raw markdown body */
  body: string
  /** Rendered HTML */
  html: string
  /** Extracted h2 sections */
  sections: Record<string, string>
}
```

### WriteContentData

Data for writing content to the persistence layer.

```typescript
interface WriteContentData {
  collection: string
  slug: string
  fields: Record<string, unknown>
  body: string
  html?: string | undefined
  sections?: Record<string, string> | undefined
  /** What the write does to the live version; without one it is a save and the live version is kept */
  publication?: Publication | undefined
  locale?: string | undefined
}

/** A write that changes what visitors see; a write without one is a save */
type Publication = 'publish' | 'unpublish' | 'archive'
```

The stored status is not part of the write: the adapter derives it from the live version the write leaves (see [Live Version](#live-version)).

### ContentQuery

The one read behind every content list, and the only list read an adapter has. A query declares what it returns of each document (its projection), which documents (state, collections, locale, status, a text match), their order and one page of them; a SQL adapter answers it in one statement.

```typescript
/** What a query returns of each document */
type QueryProjection = 'meta' | 'summary' | 'full'

/** Where a text match looks */
type MatchTarget = 'slug' | 'fields' | 'body'

interface QueryBase<P extends QueryProjection> {
  /** The collections to read; every collection when omitted */
  collections?: readonly string[] | undefined
  /** One locale; every locale when omitted */
  locale?: string | undefined
  projection: P
  /** Case-insensitive substring match; a document matches when any target contains the text */
  match?: { text: string; in: readonly MatchTarget[] } | undefined
  /** `field` or `field:asc|desc`, the sort whitelist below */
  sort?: string | undefined
  /** At most this many items; every match when omitted */
  limit?: number | undefined
  offset?: number | undefined
}

/** The current version of each document (drafts included) */
interface CurrentQuery<P extends QueryProjection = QueryProjection> extends QueryBase<P> {
  state: 'current'
  /** Documents in this publication state (see `ContentStatus`) */
  status?: 'draft' | 'published' | 'archived' | undefined
}

/** The live version of each document that has one */
interface PublishedQuery<P extends QueryProjection = QueryProjection> extends QueryBase<P> {
  state: 'published'
}

type ContentQuery<P extends QueryProjection = QueryProjection> = CurrentQuery<P> | PublishedQuery<P>

/** One page of a query */
interface QueryPage<P extends QueryProjection> {
  /** Each item; `snippet` is set when the query matched `body` or `fields` */
  items: Array<QueryItem<P> & { snippet?: string | undefined }>
  /** Whether another page follows (read as LIMIT n + 1, never a count) */
  hasMore: boolean
}
```

`QueryItem<P>` is the item type of a projection:

| Projection | Item | Reads |
|------------|------|-------|
| `meta` | `DocumentMeta` | the meta columns alone: no fields, body, HTML or sections |
| `summary` | `ContentSummary` (`{ meta, fields, metadata }`) | meta, fields and the authored metadata groups; never the body, HTML, sections or the whole `authored` column |
| `full` | `ContentDocument` | the whole row |

The contract every adapter meets (`@krantho/persistence-contract` runs one suite against SQLite, Postgres and the filesystem adapter):

- **State.** `current` reads the newest version of each document that is not deleted; `status` narrows it by publication state through `statusCondition`, so `published` includes a document whose draft is ahead of its live version. `published` reads the live version of each current, not deleted document that has one, and an item's `meta` is the live row's. A newer draft never shows under `published`.
- **Scope.** `collections` and `locale` narrow the rows; both are parameters, never interpolated. An empty `collections` list matches nothing.
- **Order.** `sort` is a column of the whitelist or a field (see below), then always `collection, slug, locale` as the tie-break. With no `sort`, the tie-break alone defines the order, so paging is stable and a document appears on one page only.
- **Paging.** A query with a `limit` reads `limit + 1` rows, answers `limit` of them and sets `hasMore` when the extra row came back. There is no count. With no `limit`, every row comes back and `hasMore` is `false`. `offset` pages.
- **Match.** A case-insensitive substring: the needle is folded with JavaScript `toLowerCase()`. `slug` searches the slug, `fields` the fields' JSON text, `body` the markdown body. `%`, `_` and `\` in the text match themselves, not as LIKE wildcards. A document matches when any target contains the text.
- **Snippet.** When `match.in` includes `body` or `fields`, an item whose body or fields contain the text carries a `snippet`; an item that matched only on its slug has none. The snippet is a window of 200 characters that starts 80 characters before the first match, or at the start of the text when the match lies within its first 80 characters, taken from the body when the body matches and otherwise from the fields' JSON, with whitespace runs collapsed to one space. The database returns only that substring: a `meta` or `summary` query that matches the body searches the body column but never returns it.
- **One statement.** A SQL adapter runs one statement per call. A `meta` or `summary` statement selects no `body`, `html`, `sections` or `SELECT *`.

Differences between the adapters, which the contract suite tolerates:

| | SQLite | Postgres | Filesystem |
|---|---|---|---|
| Case fold | the function `kr_lower`, registered on every connection, is JavaScript `toLowerCase`, so non-ASCII letters fold ("ørret" finds "Ørret") | `lower()`, which follows the database collation (see [persistence-postgres.md](persistence-postgres.md#collation)) | JavaScript `toLowerCase` |
| The fields' JSON text | the `fields` column as stored | `fields::text`, which formats the `jsonb` with spaces and its own key order | `JSON.stringify` of the parsed frontmatter |
| Sort by a field | a missing value first, numbers numerically, then text (`json_extract`) | the same: a missing value first, numbers numerically (`jsonb_typeof`), then text in the database collation | the same, text by UTF-16 code unit |
| Where the work happens | the database | the database | JavaScript, after reading and parsing every file of the scanned collections |

The fields' JSON text is the one place a `fields` match or snippet can differ: a `fields` snippet reads differently on Postgres, and a needle that spans JSON punctuation (a key, its colon and its value) matches only on an adapter whose JSON text has that shape. Matches inside a value, and everything on `slug` and `body`, are the same on every adapter.

The filesystem adapter has no history, so `current` and `published` read the same files: one version per file, live when its status is `published`. For a `meta` or `summary` query it reads each file and drops the body in JavaScript, so it saves no read; it renders HTML and sections only for `full`. With `collections` omitted it reads the collections it has a directory for.

### Sort Whitelist

A query's `sort` arrives from a query string, so it can never be interpolated into SQL
unchecked. The whitelist and the field pattern live here rather than in each SQL adapter,
so the two cannot drift apart.

```typescript
const DIRECT_SORT_COLUMNS = ['slug', 'status', 'locale', 'created_at'] as const
const SORT_FIELD_PATTERN = /^[\w-]+$/

function isDirectSortColumn(field: string): field is DirectSortColumn
function isSafeSortField(field: string): boolean
```

A field named in `DIRECT_SORT_COLUMNS` is emitted as a literal column. Anything else falls
back to the adapter's JSON extraction expression -- `json_extract(fields, '$.X')` on SQLite,
`fields->>'X'` on Postgres -- and only when it matches `SORT_FIELD_PATTERN`. An unsafe field
produces no `ORDER BY` at all.

### IPersistenceAdapter

The primary persistence interface. Extends `IContentLoader` from `@krantho/core`.

```typescript
interface IPersistenceAdapter extends IContentLoader {
  /** List all content slugs */
  listSlugs(): Promise<string[]>

  /**
   * Write a document -- appends a new version. A save keeps the live version;
   * `publication` publishes the written version, unpublishes or archives.
   */
  writeContent?(data: WriteContentData, changedBy?: string | undefined): Promise<void>

  /** Soft-delete content -- creates a tombstone version */
  deleteContent?(
    collection: string,
    slug: string,
    locale?: string | undefined,
    changedBy?: string | undefined,
  ): Promise<void>

  /** Get a single content document */
  getContent?(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null>

  /** The live (published) version of a document, or null when nothing is live */
  getPublished?(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null>

  /** The one read behind every content list: a declared projection over one or many collections, current or live, optionally matched on text, as one page */
  query?<P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>>

  /** List version history for a content item (newest first) */
  listVersions?(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<DocumentMeta[]>

  /** Get a specific version of a content document */
  getVersion?(
    collection: string,
    slug: string,
    version: number,
    locale?: string | undefined,
  ): Promise<ContentDocument | null>

  /** Restore content to a specific version -- a save: a new current version from the old one, the live version kept */
  restoreVersion?(
    collection: string,
    slug: string,
    version: number,
    changedBy?: string | undefined,
    locale?: string | undefined,
  ): Promise<boolean>

  /** Get runtime schema extensions for a collection */
  getRuntimeSchema?(collection: string): Promise<RuntimeSchemaDefinition | null>

  /** Save runtime schema extensions for a collection -- creates a new schema version */
  saveRuntimeSchema?(
    collection: string,
    schema: RuntimeSchemaDefinition,
    changedBy?: string | undefined,
  ): Promise<void>
}
```

Required methods (from `IContentLoader` + `IPersistenceAdapter`):

| Method | Description |
|--------|-------------|
| `exists(slug)` | Check if a content item exists (inherited from `IContentLoader`) |
| `read(slug)` | Read raw content string (inherited from `IContentLoader`) |
| `getMetadata(slug)` | Get size and lastModified metadata (inherited from `IContentLoader`) |
| `listSlugs()` | Return all content slugs |

Optional methods:

| Method | Description |
|--------|-------------|
| `writeContent(data, changedBy?)` | Write a document (create, save, publish, unpublish or archive), appending a new version |
| `deleteContent(collection, slug, locale?, changedBy?)` | Soft-delete content with a tombstone version |
| `getContent(collection, slug, locale?)` | Get a single content document (the current version, whatever its status) |
| `getPublished(collection, slug, locale?)` | Get the live (published) version of a document, or `null` when nothing is live |
| `query(spec)` | Read one page of documents: a projection (`meta`, `summary`, `full`), the current or live version, one or many collections, a locale, a status, a text match, a sort and a page (see [ContentQuery](#contentquery)) |
| `listVersions(collection, slug, locale?)` | List version history (newest first) |
| `getVersion(collection, slug, version, locale?)` | Get a specific version of a document |
| `restoreVersion(collection, slug, version, changedBy?, locale?)` | Restore to a prior version as a save (creates a new version, keeps the live version) |
| `getRuntimeSchema(collection)` | Get runtime schema extensions for a collection |
| `saveRuntimeSchema(collection, schema, changedBy?)` | Save runtime schema extensions |

### Live Version

A document (collection, slug, locale) has two versions that matter: its **current version**, the newest row, which is what Studio edits, and its **live version**, the row visitors see, or none. Server-rendered pages (`createContentLoader()` in `@krantho/server`) read only the live version, through `getPublished` and a `published` query; the sitemap and `llms.txt` read it as `summary` items, which carry the fields they need and not the body they do not. Saving a document never changes what visitors see; publishing does.

In the SQL adapters every content version row records `live_version`: the document's live version as of that row, or `NULL`. The document's live version is the current row's `live_version`. Each write decides what it records:

| Write | Live version after the write | Stored status |
|-------|------------------------------|---------------|
| Save (`writeContent` without `publication`): create, update, restore, enrichment, the assistant, a collection import, a media reference rewrite of a document whose current version is not live | Unchanged | `published` while a version is live, else `draft` (`archived` when the document is archived) |
| Publish (`publication: 'publish'`) | The new row, a copy of the current content | `published` |
| Unpublish (`publication: 'unpublish'`) | None | `draft` |
| Archive (`publication: 'archive'`) | None | `archived` |
| Import from a file (`upsertFromFile`): auto-import, the file watcher, content migration | The new row when the file's status is `published`, otherwise none | The file's status (`draft` for any status other than `published` or `archived`) |
| `restoreVersion` | Unchanged (a save) | As a save |
| `deleteContent` | None (a tombstone) | `deleted` |

A file import is the one write whose content says whether it is live, because the file is the source of truth. A checkpoint restore moves `is_current` back, and with it the live version. Version retention (`purgeVersions`) never deletes the live version.

**Publication state is derived from the live version.** On read, the shared row mapper sets `DocumentMeta.status` from the stored status and `live_version` alone:

| Stored status | `live_version` | `DocumentMeta.status` |
|---------------|----------------|-----------------------|
| `deleted` | (null) | `deleted` |
| `archived` | null | `archived` |
| any other | not null | `published` |
| any other | null | `draft` |

Writes store the status the same rule derives, so a raw database read agrees with the mapper, and rows that record a `draft` status alongside a live version read as `published` with changes ahead. When a document's fields hold a `status` key, the mapper aligns it with `meta.status` when that is `draft` or `published`; an archived document's field is left as written (the API writes `archived` when the schema accepts that value, otherwise `draft`).

The filesystem adapter has no history: every file is version 1, live when its status (frontmatter, or the configured default) is `published`, so a save to a published file is live at once (see [persistence-fs.md](persistence-fs.md)).

The rules are exported so every adapter applies them identically:

```typescript
type Publication = 'publish' | 'unpublish' | 'archive'
type LiveDirective = 'self' | 'clear' | 'keep'

function liveOnWrite(publication: Publication | undefined): LiveDirective
function publicationOfFile(status: string): Publication
function resolveLiveVersion(directive: LiveDirective, version: number, previous: number | null): number | null
function storedStatus(publication: Publication | undefined, liveVersion: number | null, previousStatus: string | undefined): ContentStatus
function statusOf(stored: string, liveVersion: number | null): ContentStatus
function currentIsLive(meta: { version: number; liveVersion: number | null }): boolean
function statusCondition(status: 'draft' | 'published' | 'archived'): string
```

| Function | Description |
|----------|-------------|
| `liveOnWrite(publication)` | The directive for the appended row: `self` (this row is live) for `publish`, `clear` (nothing is live) for `unpublish` and `archive`, `keep` (the previous live version stays) for a save |
| `publicationOfFile(status)` | The publication a file import makes: `published` publishes, `archived` archives, anything else unpublishes |
| `resolveLiveVersion(directive, version, previous)` | The `live_version` value the row records |
| `storedStatus(publication, liveVersion, previousStatus)` | The status the row stores: `archived` when archiving (and on a save to an archived document), `published` while a version is live, `draft` otherwise |
| `statusOf(stored, liveVersion)` | A row's publication state on read (the table above) |
| `currentIsLive(meta)` | Whether visitors see the current version: `liveVersion !== null && liveVersion === version` |
| `statusCondition(status)` | The SQL condition that selects current rows in a publication state, shared by SQLite and Postgres for `CurrentQuery.status` |

### Capability Predicates

Type-narrowing guards for optional adapter methods. Use these instead of manual null checks to get TypeScript type narrowing.

```typescript
/** Adapter that can answer a content query */
type QueryReader = IPersistenceAdapter & Required<Pick<IPersistenceAdapter, 'query'>>

/** Adapter that can read individual content documents */
type ContentGetter = IPersistenceAdapter &
  Required<Pick<IPersistenceAdapter, 'getContent'>>

/** Adapter that can read the live (published) version of documents */
type PublishedReader = IPersistenceAdapter &
  Required<Pick<IPersistenceAdapter, 'getPublished' | 'query'>>

/** Adapter that can write and delete content */
type ContentWriter = IPersistenceAdapter &
  Required<Pick<IPersistenceAdapter, 'writeContent' | 'deleteContent'>>

/** Adapter with version history capabilities */
type VersioningAdapter = IPersistenceAdapter &
  Required<Pick<IPersistenceAdapter, 'listVersions' | 'getVersion' | 'restoreVersion'>>

/** Adapter with runtime schema capabilities */
type SchemaAdapter = IPersistenceAdapter &
  Required<Pick<IPersistenceAdapter, 'getRuntimeSchema' | 'saveRuntimeSchema'>>
```

Guard functions:

| Function | Narrows to | Checks |
|----------|-----------|--------|
| `canQuery(adapter)` | `QueryReader` | `query` is present |
| `canGetContent(adapter)` | `ContentGetter` | `getContent` is present |
| `canReadPublished(adapter)` | `PublishedReader` | `getPublished` and `query` are present |
| `canWriteContent(adapter)` | `ContentWriter` | `writeContent` and `deleteContent` are present |
| `hasVersioning(adapter)` | `VersioningAdapter` | `listVersions`, `getVersion`, and `restoreVersion` are present |
| `hasRuntimeSchema(adapter)` | `SchemaAdapter` | `getRuntimeSchema` and `saveRuntimeSchema` are present |

### NormalizedContentRow

Canonical shape of a content row as understood by the shared mapper. Each adapter normalizes its raw storage row into this shape before passing it to the mapping functions.

```typescript
interface NormalizedContentRow {
  readonly collection: string
  readonly slug: string
  readonly locale: string
  readonly version: number
  /** The document's live version as of this row; null when nothing is live */
  readonly liveVersion: number | null
  readonly status: string
  readonly source: string
  readonly changedBy: string | null
  /** ISO 8601 timestamp */
  readonly createdAt: string
  readonly fields: Record<string, unknown>
  readonly body: string
  readonly html: string
  readonly sections: Record<string, string>
}
```

Mapping functions:

| Function | Returns | Description |
|----------|---------|-------------|
| `contentDocumentFromRow(row)` | `ContentDocument` | Full document from a normalized row |
| `documentMetaFromRow(row)` | `DocumentMeta` | Metadata only (no body, fields, html, sections) |

Both functions validate `status` and `source` values, warning and falling back to defaults (`'draft'` and `'filesystem'` respectively) for unknown values. `status` is derived with `statusOf(row.status, row.liveVersion)`, and `contentDocumentFromRow` sets a `status` key in `fields`, when one exists, to that derived status when it is `draft` or `published`, and leaves an archived document's as written.

### Runtime Schema

Runtime fields extend code-defined schemas at runtime (e.g., via Studio). Code-defined schemas are read-only; runtime fields are additive-only.

```typescript
interface RuntimeFieldDefinition {
  name: string
  type:
    | 'string' | 'number' | 'boolean' | 'date' | 'enum'
    | 'url' | 'email' | 'textarea' | 'color' | 'reference'
  required: boolean
  default?: unknown | undefined
  description?: string | undefined
  enumValues?: string[] | undefined
  refCollection?: string | undefined
  /** Whether this field holds an array of values (for reference arrays) */
  isArray?: boolean | undefined
  min?: number | undefined
  max?: number | undefined
  pattern?: string | undefined
}

interface RuntimeSchemaDefinition {
  collection: string
  fields: RuntimeFieldDefinition[]
  updatedAt: string
}
```

### PersistenceConfig

```typescript
interface PersistenceConfig {
  /** Path to content pages directory (e.g., 'content/pages') */
  contentPath: string
  /** Path to SEO data directory (e.g., 'content/seo') */
  seoPath: string
}
```

---

## Media

### MediaCrop

Crop region as percentages (0-100).

```typescript
interface MediaCrop {
  x: number
  y: number
  width: number
  height: number
}
```

### MediaHotspot

Hotspot center + ellipse for adaptive aspect-ratio cropping (0-100%).

```typescript
interface MediaHotspot {
  /** Center X as percentage of image width */
  x: number
  /** Center Y as percentage of image height */
  y: number
  /** Ellipse width as percentage of image width (for UI visualization) */
  width: number
  /** Ellipse height as percentage of image height (for UI visualization) */
  height: number
}
```

### MediaItem

Metadata for an uploaded media item.

```typescript
interface MediaItem {
  id: string
  filename: string
  url: string
  altText: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  folder: string | null
  tags: string[]
  crop: MediaCrop | null
  hotspot: MediaHotspot | null
  createdAt: string
}
```

### MediaListOptions

```typescript
interface MediaListOptions {
  limit?: number | undefined
  offset?: number | undefined
  search?: string | undefined
  folder?: string | undefined
  tag?: string | undefined
}
```

### MediaUpdateData

Updates accepted by the media update endpoint.

```typescript
interface MediaUpdateData {
  altText?: string | undefined
  folder?: string | null | undefined
  tags?: string[] | undefined
  crop?: MediaCrop | null | undefined
  hotspot?: MediaHotspot | null | undefined
  filename?: string | undefined
}
```

### BulkDeleteResult

```typescript
interface BulkDeleteResult {
  deleted: string[]
  skipped: Array<{ id: string; reason: string }>
}
```

### MediaUsage

Content item referencing a media item.

```typescript
interface MediaUsage {
  collection: string
  slug: string
  field: string
}
```

### IMediaStorage

The media library the API handlers call. `MediaLibrary` in `@krantho/api` is its one implementation: it composes an `IMediaMetadataAdapter` and an `IFileStore` (below) and owns MIME and size validation, object keys and dimension detection.

```typescript
interface IMediaStorage {
  upload(file: Uint8Array, filename: string, mimeType: string): Promise<MediaItem>
  register(item: {
    filename: string
    url: string
    mimeType: string
    size: number
    width: number | null
    height: number | null
    altText?: string | undefined
  }): Promise<MediaItem>
  list(options?: MediaListOptions): Promise<{ items: MediaItem[]; total: number }>
  get(id: string): Promise<MediaItem | null>
  update(id: string, updates: MediaUpdateData): Promise<MediaItem | null>
  delete(id: string): Promise<void>
  bulkDelete(ids: string[]): Promise<BulkDeleteResult>
  bulkUpdateAltText(ids: string[], altText: string): Promise<number>
  /** Replace the file, keep the id; the url changes */
  replace(id: string, file: Uint8Array, filename: string, mimeType: string): Promise<MediaItem | null>
  duplicate(id: string): Promise<MediaItem | null>
  listTags(): Promise<string[]>
  /** The original file's bytes; null when the item or its file is gone */
  readOriginal(id: string): Promise<Uint8Array | null>
}
```

### IMediaMetadataAdapter

Versioned media metadata in the configured database. `SqliteMediaAdapter` (`@krantho/persistence-sqlite`) and `PostgresMediaAdapter` (`@krantho/persistence-postgres`) implement it on the `media` table (migration `v011-media`). Every change appends a version; a delete appends a tombstone.

```typescript
interface MediaRecord extends MediaItem {
  /** Object key in the file store; null for a registered external URL */
  storageKey: string | null
}
type NewMediaRecord = Omit<MediaRecord, 'createdAt'>
type MediaRecordChanges = Partial<Omit<MediaRecord, 'id' | 'createdAt'>>

interface IMediaMetadataAdapter {
  insert(record: NewMediaRecord): Promise<MediaRecord>
  get(id: string): Promise<MediaRecord | null>
  list(options?: MediaListOptions | undefined): Promise<{ items: MediaRecord[]; total: number }>
  /** Append a new current version; null when the id has no current row */
  appendVersion(id: string, changes: MediaRecordChanges): Promise<MediaRecord | null>
  /** Append a deleted tombstone; returns the record it superseded */
  markDeleted(id: string): Promise<MediaRecord | null>
  listTags(): Promise<string[]>
}
```

### IFileStore

Where media file bytes live. One package per store: `@krantho/media-local`, `@krantho/media-vercel-blob`, `@krantho/media-s3` and `@krantho/media-gcs`; `media.provider` picks one (see [guides/media.md](guides/media.md)). Keys are flat, immutable and never reused, so a store never overwrites an object.

```typescript
interface StoredFile {
  key: string
  /** Public URL the object is served from */
  url: string
}

interface IFileStore {
  /** Human-readable store name, e.g. 'Local disk' or 'Vercel Blob' */
  readonly label: string
  /** Directory or bucket the store writes to; null when it has none to show */
  readonly location: string | null
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredFile>
  /** null when the object does not exist */
  get(key: string): Promise<Uint8Array | null>
  copy(fromKey: string, toKey: string, contentType: string): Promise<StoredFile>
  /** No error when the object is already gone */
  delete(key: string): Promise<void>
}
```

### Media Folders

`SqliteMediaFolderAdapter` and `PostgresMediaFolderAdapter` implement `IMediaFolderStorage` on the `media_folders` table, in the same database as the metadata.

```typescript
interface MediaFolder {
  id: string
  name: string
  parentId: string | null
  createdAt: string
}

interface IMediaFolderStorage {
  listFolders(): Promise<MediaFolder[]>
  createFolder(name: string, parentId?: string | null): Promise<MediaFolder>
  renameFolder(id: string, name: string): Promise<MediaFolder | null>
  deleteFolder(id: string): Promise<void>
}
```

---

## Auth

### Types

```typescript
type Role = 'admin' | 'editor' | 'viewer'

interface UserRecord {
  id: string
  email: string | null
  name: string | null
  roles: Role[]
  oidcSubject: string | null
  oidcIssuer: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface CreateUserData {
  email: string | null
  name: string | null
  roles: Role[]
  oidcSubject?: string | undefined
  oidcIssuer?: string | undefined
}

interface UpdateUserData {
  email?: string | undefined
  name?: string | undefined
  roles?: Role[] | undefined
  isActive?: boolean | undefined
  oidcSubject?: string | undefined
  oidcIssuer?: string | undefined
}

interface RefreshTokenRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  createdAt: string
}

interface UserPermission {
  userId: string
  collection: string
  role: Role
}
```

### IAuthAdapter

Auth adapter interface covering users, refresh tokens, and per-collection permissions.

```typescript
interface IAuthAdapter {
  // Users
  createUser(data: CreateUserData): Promise<UserRecord>
  getUser(id: string): Promise<UserRecord | null>
  getUserByEmail(email: string): Promise<UserRecord | null>
  getUserByOidc(issuer: string, subject: string): Promise<UserRecord | null>
  listUsers(): Promise<UserRecord[]>
  updateUser(id: string, data: UpdateUserData): Promise<UserRecord | null>
  deleteUser(id: string): Promise<boolean>

  // Refresh Tokens
  createRefreshToken(userId: string, tokenHash: string, expiresAt: string): Promise<string>
  getRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>
  deleteRefreshToken(id: string): Promise<void>
  deleteUserRefreshTokens(userId: string): Promise<void>
  deleteExpiredRefreshTokens(): Promise<number>

  // Per-Collection Permissions
  getUserPermissions(userId: string): Promise<UserPermission[]>
  setUserPermission(userId: string, collection: string, role: Role): Promise<void>
  deleteUserPermission(userId: string, collection: string): Promise<boolean>
}
```

---

## SEO Config

```typescript
type SeoConfigScope = 'site' | 'collection' | 'document' | 'route'

interface SeoConfig {
  id: string
  scope: SeoConfigScope
  config: SeoConfigData  // from @krantho/seo-shared
  createdAt: string
  updatedAt: string
}

interface ISeoConfigAdapter {
  /** Get SEO config by ID (e.g., 'site', 'collection:pages', 'doc:pages/home') */
  getConfig(id: string): Promise<SeoConfig | null>
  /** Save SEO config (upsert) */
  saveConfig(config: Omit<SeoConfig, 'createdAt' | 'updatedAt'>): Promise<void>
  /** Delete SEO config */
  deleteConfig(id: string): Promise<void>
  /** List all configs by scope */
  listConfigs(scope?: SeoConfigScope): Promise<SeoConfig[]>
  /** List configs matching an ID prefix (e.g., 'doc:pages/' for all page doc configs) */
  listConfigsByPrefix(prefix: string): Promise<SeoConfig[]>
  /** Delete all SEO configs in a single operation. Returns the number deleted. */
  deleteAllConfigs(): Promise<number>
}
```

---

## Settings

```typescript
interface ISiteSettingsAdapter {
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  getAllSettings(): Promise<Record<string, string>>
}
```

---

## Locking

Advisory locking for content editing concurrency control.

```typescript
interface ContentLock {
  collection: string
  slug: string
  locale: string
  lockedBy: string
  lockedAt: string
  expiresAt: string
}

interface ILockAdapter {
  getLock(collection: string, slug: string, locale: string): Promise<ContentLock | null>
  acquireLock(
    collection: string,
    slug: string,
    locale: string,
    lockedBy: string,
    expiresAt: string,
  ): Promise<void>
  releaseLock(collection: string, slug: string, locale: string): Promise<void>
  /** Every unexpired lock, by collection, slug and locale */
  listLocks(): Promise<ContentLock[]>
}
```

---

## Webhooks

```typescript
interface WebhookDeliveryRecord {
  id: number
  url: string
  event: string
  status: number | null
  attempts: number
  nextRetryAt: string | null
  createdAt: string
  deliveredAt: string | null
}

/** A delivery with the body it sends: what a retry sends again */
interface StoredWebhookDelivery extends WebhookDeliveryRecord {
  payload: string
}

/** A first send to put in the log: `retryAt` is when it is due were it to record no outcome */
interface NewWebhookDelivery {
  url: string
  event: string
  payload: string
  retryAt: Date
}

const MAX_WEBHOOK_ATTEMPTS = 5

interface IWebhookDeliveryAdapter {
  listDeliveries(options: {
    limit: number
    offset: number
    status?: 'pending' | 'delivered' | 'failed' | undefined
  }): Promise<{ deliveries: WebhookDeliveryRecord[]; total: number }>
  /** One delivery with its payload; null when none has the id */
  getDelivery(id: number): Promise<StoredWebhookDelivery | null>
  /** Put a failed delivery back in the queue with one attempt left, due at `dueAt`; null when no failed delivery has the id */
  requeueDelivery(id: number, dueAt: Date): Promise<WebhookDeliveryRecord | null>
  /** Log a first send: one attempt made, no outcome yet. Returns the delivery's id */
  logDelivery(delivery: NewWebhookDelivery): Promise<number>
  /** Record that the webhook accepted the delivery, with its HTTP status */
  markDelivered(id: number, status: number): Promise<void>
  /** Record a failed attempt: the status, one more attempt counted, the time the next is due */
  markFailed(id: number, status: number, nextRetryAt: Date): Promise<void>
  /** Claim the deliveries to send again at `now`, oldest first, for the given URLs only: each is held until `leaseUntil`, so no other sweep claims it meanwhile */
  claimDueDeliveries(options: {
    urls: readonly string[]
    now: Date
    leaseUntil: Date
    limit: number
  }): Promise<StoredWebhookDelivery[]>
}
```

---

## Retention

Version retention for purging old content versions.

```typescript
interface PurgeResult {
  collection: string
  slug: string
  purged: number
  retained: number
}

interface IRetentionAdapter {
  purgeVersions(maxVersionsPerItem: number): Promise<PurgeResult[]>
  countVersions(): Promise<{ total: number; current: number; historical: number }>
}
```

`purgeVersions` deletes the oldest non-current versions and never the live one, so a page with a long run of drafts stays published.

---

## Page Cache

The shared page cache store: rendered pages and fetch results kept in the site's own database, so every instance of a multi-instance Next.js site reads and invalidates one cache. `@krantho/server-next/cache-handler` is its consumer (see [server-next.md](server-next.md#shared-cache-across-instances)); SQLite (`SqlitePageCacheStore`) and Postgres (`PostgresPageCacheStore`) implement it, and `createLockAdapters()` in `@krantho/server` returns it as `pageCacheStore`. The filesystem backend has none.

```typescript
interface IPageCacheStore {
  get(key: string): Promise<PageCacheEntry | null>
  set(key: string, value: PageCacheValue, tags: readonly string[]): Promise<void>
  tagsRevalidatedSince(tags: readonly string[], since: number): Promise<PageCacheTagState>
  markTags(tags: readonly string[], options: PageCacheMarkOptions): Promise<void>
  countTagged(tags: readonly string[]): Promise<number>
}

interface PageCacheEntry {
  value: PageCacheValue // binary leaves restored as Uint8Array
  tags: string[]        // as of the last set, deduplicated
  lastModified: number  // epoch milliseconds on the store's clock
}

type PageCacheTagState = 'fresh' | 'stale' | 'expired'

interface PageCacheMarkOptions {
  expire: boolean
}
```

- `set` upserts: it replaces the value and the tags of an existing entry (tags are never appended) and stamps `lastModified`.
- `markTags` records, per tag, when it was last marked stale and when it was last expired. `expire: true` expires the tags now and marks them stale; `expire: false` only marks them stale. Marks only move forward, and a stale mark never clears an earlier expiry. Every write is safe under concurrent instances.
- `countTagged(tags)` counts the entries (pages and data) that carry any of `tags`; an empty list counts none. The API's publish impact reads it.
- `tagsRevalidatedSince(tags, since)` answers `expired` when any tag was expired at or after `since`, else `stale` when any was marked stale at or after it, else `fresh` (tags never marked are fresh).
- **One clock.** The store stamps `lastModified` and the marks from the same clock: this process's `Date.now()` on SQLite, which has one host, and the database server's clock on Postgres, so instances with skewed clocks still compare an entry and a mark consistently.
- **No eviction.** Nothing deletes an entry: a rewrite replaces it in place, and entries for pages that no longer exist stay, as in Next's own disk cache.

`PageCacheValue` is JSON data whose leaves may be binary (`Uint8Array`, Node `Buffer` included):

```typescript
type PageCacheValue =
  | null | boolean | number | string | Uint8Array
  | readonly PageCacheValue[]
  | { readonly [key: string]: PageCacheValue | undefined }
```

`encodePageCacheValue(value)` writes it as JSON text, each binary leaf as `{ "__kranthoBytes": "<base64>" }` (that key is reserved); `decodePageCacheValue(text)` restores the leaves as `Uint8Array`. Members that are `undefined` are dropped, as in JSON. Maps, Dates and class instances are not values: the caller converts them before `set`. `uniquePageCacheTags(tags)` deduplicates tags in first-seen order.

---

## Migrations

### Schema Migrations

```typescript
interface Migration {
  version: number
  name: string
  apply: MigrationApplyFn
}

type MigrationApplyFn = (db: unknown) => void | Promise<void>

interface AppliedMigration {
  version: number
  name: string
  checksum: string
  appliedAt: string
}

interface MigrationResult {
  applied: AppliedMigration[]
  currentVersion: number
}
```

### Checkpoints

Point-in-time restore via `is_current` flags. Restoring a checkpoint restores each document's live version with its current version.

```typescript
type CheckpointTrigger = 'manual' | 'pre-migration' | 'pre-restore' | 'pre-import'

interface CheckpointInfo {
  id: number
  version: number
  name: string | null
  trigger: CheckpointTrigger
  createdAt: string
}

interface ICheckpointAdapter {
  createCheckpoint(name?: string | undefined, trigger?: CheckpointTrigger | undefined): Promise<CheckpointInfo>
  listCheckpoints(): Promise<CheckpointInfo[]>
  getCheckpoint(version: number): Promise<CheckpointInfo | null>
  restoreCheckpoint(version: number): Promise<CheckpointInfo>
  deleteCheckpoint(version: number): Promise<boolean>
}
```

### Content Migration

```typescript
interface ContentManifest {
  version: number
  generatedAt: string
  files: Record<string, { checksum: string; size: number }>
}

interface ContentManifestRecord {
  id: number
  repoVersion: number
  importedAt: string
  fileChecksums: Record<string, string>
}

interface ContentConflict {
  id: number
  migrationId: number
  collection: string
  slug: string
  repoChecksum: string
  dbChecksum: string
  resolved: boolean
  resolvedAt: string | null
  resolution: 'keep_db' | 'use_repo' | 'merged' | null
}

type ConflictResolution = 'keep_db' | 'use_repo'

interface IContentMigrationAdapter {
  getContentManifestVersion(): Promise<number | null>
  getContentManifest(): Promise<ContentManifestRecord | null>
  saveContentManifest(manifest: ContentManifestRecord): Promise<void>
  listConflicts(): Promise<ContentConflict[]>
  resolveConflict(conflictId: number, resolution: ConflictResolution): Promise<boolean>
  recordConflict(
    conflict: Omit<ContentConflict, 'id' | 'resolved' | 'resolvedAt' | 'resolution'>,
  ): Promise<void>
}

interface MigrationStatus {
  schemaVersion: number
  checkpointEnabled: boolean
  contentMigrationEnabled: boolean
  repoContentVersion: number | null
  dbContentVersion: number | null
  unresolvedConflicts: number
}
```

### Migration Utilities

Shared utilities used by all persistence adapters.

```typescript
interface MigrationIdentity {
  version: number
  name: string
}

type MigrationDecision =
  | { action: 'skip'; reason: string }
  | { action: 'full-import' }
  | { action: 'migrate'; repoVersion: number }
```

| Function | Description |
|----------|-------------|
| `validateChecksums(migrations, appliedMap, computeChecksum)` | Verify applied migrations have not been modified (checksum comparison) |
| `resolveCurrentVersion(appliedVersions, newlyApplied)` | Determine current schema version from all applied migrations |
| `migrationFailedMessage(version, name, err)` | Format a migration failure error message |
| `decideMigration(repoManifest, dbVersion)` | Determine what content migration action to take (`skip`, `full-import`, or `migrate`) |

---

## Utilities

### escapeSqlLikePattern

Escape special LIKE pattern characters (`%`, `_`, `\`) for safe prefix matching.

```typescript
function escapeSqlLikePattern(prefix: string): string
```

---

## Usage

### Implementing a custom adapter

```typescript
import type {
  IPersistenceAdapter,
  WriteContentData,
  ContentDocument,
  ContentQuery,
  QueryPage,
  QueryProjection,
} from '@krantho/persistence'

export class MyAdapter implements IPersistenceAdapter {
  // Required: IContentLoader methods
  async exists(slug: string): Promise<boolean> { /* ... */ }
  async read(slug: string): Promise<string> { /* ... */ }
  async getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>> { /* ... */ }

  // Required: IPersistenceAdapter methods
  async listSlugs(): Promise<string[]> { /* ... */ }

  // Optional: implement any subset of optional methods.
  // writeContent applies the live-version rules: liveOnWrite(data.publication), storedStatus(...)
  async writeContent(data: WriteContentData): Promise<void> { /* ... */ }
  async getContent(collection: string, slug: string): Promise<ContentDocument | null> { /* ... */ }
  async getPublished(collection: string, slug: string, locale?: string): Promise<ContentDocument | null> { /* ... */ }
  async query<P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>> { /* ... */ }
}
```

### Using capability predicates

```typescript
import { canWriteContent, hasVersioning } from '@krantho/persistence'

if (canWriteContent(adapter)) {
  // TypeScript knows adapter.writeContent and adapter.deleteContent exist
  await adapter.writeContent(data)
}

if (hasVersioning(adapter)) {
  // TypeScript knows adapter.listVersions, getVersion, restoreVersion exist
  const versions = await adapter.listVersions('pages', 'about')
}
```

Server-rendered pages read through `getPublished` and `query`; `createContentLoader()` rejects an adapter without them (`canReadPublished`).

### Passing an adapter to the content engine

Any `IPersistenceAdapter` is a valid `IContentLoader`, so it plugs directly into core:

```typescript
import { ContentEngineFactory } from '@krantho/core'

const adapter = new MyAdapter(config)
const engine = ContentEngineFactory.create(adapter)
```

## Dependencies

| Type | Package | Purpose |
|------|---------|---------|
| Workspace | `@krantho/core` | `IContentLoader`, `ContentMetadata` types |
| Workspace | `@krantho/seo-shared` | `SeoConfigData` type (used by `SeoConfig`) |
| Dev | `typescript` | Build |
