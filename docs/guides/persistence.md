# Persistence Guide

This guide covers how krantho abstracts content storage behind the `IPersistenceAdapter` interface, the capability predicate pattern, version history and the live (published) version, media storage, locking, webhooks, and the migration/checkpoint system.

## Interface

All content storage flows through the `IPersistenceAdapter` interface defined in `@krantho/persistence`. This interface extends `IContentLoader` from `@krantho/core`, which provides the minimal read-only surface that `ContentEngine` requires.

### IContentLoader (from @krantho/core)

```typescript
interface IContentLoader {
  exists(slug: string): Promise<boolean>
  read(slug: string): Promise<string>
  getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>>
  listSlugs?(): Promise<string[]>
}
```

`IContentLoader` is the dependency that `ContentEngineFactory.create()` accepts. Any object satisfying this interface can power the content engine. `listSlugs` is optional at this level because not all loaders need enumeration.

### IPersistenceAdapter (from @krantho/persistence)

```typescript
interface IPersistenceAdapter extends IContentLoader {
  // Required
  listSlugs(): Promise<string[]>

  // Optional CRUD
  writeContent?(data: WriteContentData, changedBy?: string): Promise<void>
  deleteContent?(collection: string, slug: string, locale?: string, changedBy?: string): Promise<void>
  getContent?(collection: string, slug: string, locale?: string): Promise<ContentDocument | null>
  getPublished?(collection: string, slug: string, locale?: string): Promise<ContentDocument | null>
  query?<P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>>

  // Optional version history
  listVersions?(collection: string, slug: string, locale?: string): Promise<DocumentMeta[]>
  getVersion?(collection: string, slug: string, version: number, locale?: string): Promise<ContentDocument | null>
  restoreVersion?(collection: string, slug: string, version: number, changedBy?: string, locale?: string): Promise<boolean>

  // Optional runtime schema
  getRuntimeSchema?(collection: string): Promise<RuntimeSchemaDefinition | null>
  saveRuntimeSchema?(collection: string, schema: RuntimeSchemaDefinition, changedBy?: string): Promise<void>
}
```

Required method:

- **`listSlugs()`** -- enumerate all content slugs.

Optional CRUD methods (used by Studio API and database-backed adapters):

- **`writeContent(data, changedBy?)`** -- write a document, appending a new version. `WriteContentData` includes `collection`, `slug`, `fields`, `body`, and optional `html`, `sections`, `publication`, `locale`. Without `publication` the write is a save and keeps the live version; `'publish'`, `'unpublish'` and `'archive'` change what visitors see. A fields-only edit is a save of the current fields merged with the edited ones, with the body kept -- the API's save does this.
- **`deleteContent(collection, slug, locale?, changedBy?)`** -- soft-delete content by creating a tombstone version.
- **`getContent(collection, slug, locale?)`** -- get a single `ContentDocument`: the current version, whatever its status.
- **`getPublished(collection, slug, locale?)`** -- get the live (published) version, or `null` when nothing is live. Server-rendered pages read through this.
- **`query(spec)`** -- the one read behind every list: a projection (`meta`, `summary` or `full`) of the current or live versions over one or many collections, filtered by locale, `status` (publication state) and a text match, sorted, and answered as one page, `{ items, hasMore }`. Server-rendered lists, the sitemap, Studio's lists, the content tree and search all read through it. See [ContentQuery](../persistence.md#contentquery).

Optional version history methods:

- **`listVersions(collection, slug, locale?)`** -- list version history (newest first). Returns `DocumentMeta[]`.
- **`getVersion(collection, slug, version, locale?)`** -- get a specific historical version.
- **`restoreVersion(collection, slug, version, changedBy?, locale?)`** -- restore to a historical version by creating a new version from the old one. A restore is a save: the live version is kept.

Optional runtime schema methods:

- **`getRuntimeSchema(collection)`** -- retrieve runtime field extensions for a collection.
- **`saveRuntimeSchema(collection, schema, changedBy?)`** -- persist runtime field extensions (upsert).

### ContentDocument

The canonical content type returned by database-backed adapters:

```typescript
interface ContentDocument {
  meta: DocumentMeta
  fields: Record<string, unknown>     // schema-validated content fields
  body: string                        // raw markdown
  html: string                        // rendered HTML
  sections: Record<string, string>    // extracted h2 sections
}

interface DocumentMeta {
  collection: string
  slug: string
  locale: string
  version: number
  liveVersion: number | null          // the live version as of this version; null when nothing is live
  status: 'draft' | 'published' | 'archived' | 'deleted'  // derived from liveVersion
  source: 'filesystem' | 'api' | 'import'
  changedBy: string | null
  createdAt: string
}
```

### WriteContentData

```typescript
interface WriteContentData {
  collection: string
  slug: string
  fields: Record<string, unknown>
  body: string
  html?: string
  sections?: Record<string, string>
  publication?: 'publish' | 'unpublish' | 'archive'  // absent: a save, the live version is kept
  locale?: string
}
```

### ContentQuery

```typescript
interface QueryBase<P extends 'meta' | 'summary' | 'full'> {
  collections?: readonly string[]  // every collection when omitted
  locale?: string                  // every locale when omitted
  projection: P                    // meta | summary (meta + fields) | full (the whole document)
  match?: { text: string; in: readonly ('slug' | 'fields' | 'body')[] }  // case-insensitive substring
  sort?: string                    // `field` or `field:asc|desc`
  limit?: number                   // read as limit + 1; every match when omitted
  offset?: number
}

// state: 'current' (drafts included; optional status: draft | published | archived)
// or state: 'published' (the live version of each document that has one)
// The answer is { items, hasMore }; an item whose body or fields contain the match carries a
// `snippet`, and one that matched only on its slug has none
```

### PersistenceConfig

```typescript
interface PersistenceConfig {
  contentPath: string      // e.g., 'content/pages'
  seoPath: string          // e.g., 'content/seo'
}
```

## Capability Predicates

The interface uses optional methods for advanced features. Instead of manual null checks, `@krantho/persistence` exports type-narrowing predicates:

```typescript
import {
  canQuery,            // adapter has query
  canGetContent,       // adapter has getContent
  canReadPublished,    // adapter has getPublished + query
  canWriteContent,     // adapter has writeContent + deleteContent
  hasVersioning,       // adapter has listVersions + getVersion + restoreVersion
  hasRuntimeSchema,    // adapter has getRuntimeSchema + saveRuntimeSchema
} from '@krantho/persistence'

if (canWriteContent(adapter)) {
  // TypeScript knows writeContent and deleteContent exist
  await adapter.writeContent({ collection: 'pages', slug: 'home', fields: {...}, body: '...' })
}

if (hasVersioning(adapter)) {
  // TypeScript knows listVersions, getVersion, restoreVersion exist
  const versions = await adapter.listVersions('pages', 'home')
}
```

Each predicate narrows to a branded type: `QueryReader`, `ContentGetter`, `PublishedReader`, `ContentWriter`, `VersioningAdapter`, or `SchemaAdapter`.

## Persistence Backends

### Filesystem

`@krantho/persistence-fs` provides `FileSystemAdapter`, reading markdown files from disk.

```typescript
import { FileSystemAdapter } from '@krantho/persistence-fs'

const adapter = new FileSystemAdapter({ defaultLocale: 'en' })
// Or with custom paths:
const adapter = new FileSystemAdapter({
  defaultLocale: 'en',
  contentPath: 'src/content/pages',
  seoPath: 'src/content/seo',
})
```

Default paths: `content/pages` for content, `content/seo` for SEO data. Slug `about` resolves to `content/pages/about.md`. The filesystem adapter provides the slug-based reads, `query` over the files of its collections, writes, and `getPublished` -- a file is live when its status (frontmatter, or the default) is `published`. It has no version history, so it cannot hold a version ahead of live: a save to a published file is live at once.

### SQLite (default)

`@krantho/persistence-sqlite` provides `SQLiteAdapter`, the default database backend. When `krantho.config.ts` sets no `persistence` section, the handler uses SQLite at `.krantho/content.db` (`persistence.sqlite.path`, derived from `paths.dataDir`).

```typescript
import { SQLiteAdapter } from '@krantho/persistence-sqlite'
```

Full CRUD, version history, runtime schema storage, content migration, checkpoints, advisory locking, webhook delivery tracking, version retention, media metadata and media folders. Schema is created automatically via migration system. Uses `better-sqlite3` with zero external service dependencies.

### Postgres

`@krantho/persistence-postgres` provides `PostgresAdapter` with feature parity with SQLite:

```typescript
import { PostgresAdapter } from '@krantho/persistence-postgres'
```

Same CRUD, versioning, runtime schemas, migrations, checkpoints, locking, retention, webhook delivery logging, media metadata and media folders. Uses connection pooling.

Select it with `persistence: { provider: 'postgres' }` in `krantho.config.ts` (or `KRANTHO_PERSISTENCE_PROVIDER=postgres`); the connection URL is the secret leaf `persistence.postgres.url`, read from `KRANTHO_PERSISTENCE_POSTGRES_URL`.

## Version History

Database-backed adapters (SQLite, Postgres) implement append-only versioning:

- Every `writeContent()` call -- a save, a publish, an unpublish or an archive -- creates a new version
- `deleteContent()` creates a tombstone version (soft delete)
- `restoreVersion()` creates a new version from a historical one (copy-on-restore); it is a save
- Versions are immutable once written

The API exposes version endpoints: `listVersions`, `getVersion`, `restoreVersion`. Studio shows version history with diff view and one-click restore.

### The live version

The current version is what Studio edits; the live version is what visitors see. Each version row records `live_version` -- the document's live version as of that row, or none -- and the current row's value is the document's live version. Pages and the sitemap read it through `getPublished` and a `published` query. Saving never changes what visitors see; publishing does.

- A save -- create, update, restore, enrichment, the assistant, a collection import, a media reference rewrite of a document whose current version is not live -- keeps the live version. A media reference rewrite of a live current version, and a bundle item marked `published`, are written as a publish. The saved version is ahead of live until it is published.
- Publishing (`publication: 'publish'`) appends a copy of the current content and makes it live. Unpublishing and archiving append a version and leave nothing live. Each is a write in the history, so the history shows who changed what visitors see, and when.
- An import from a file (`upsertFromFile`) follows the file's status: `published` goes live, anything else leaves nothing live. The file is the source of truth.
- `deleteContent` leaves nothing live.
- A checkpoint restore restores the live version together with `is_current`. Version retention never purges the live version.

The publication state is derived from the live version: `published` while one is live, `archived` when the document was archived, otherwise `draft` (`deleted` for a tombstone). `DocumentMeta.liveVersion` lets a client tell a live current version (`liveVersion === version`) from unpublished changes (`liveVersion < version`). Writes store the same status, and rows written with a `draft` status alongside a live version read as published with changes ahead, so the derivation needs no data migration.

The rules are shared by the adapters through `liveOnWrite`, `publicationOfFile`, `resolveLiveVersion`, `storedStatus` and `statusOf` in `@krantho/persistence` (see [persistence.md](../persistence.md#live-version)). Schema migration `v010-content-live-version` adds the column and backfills it: the latest published version at or before each row, unless a deletion lies between.

## Media Storage

Media is split in two, and both halves are chosen by configuration:

- **Metadata and folders** live in the configured database, on the same handle as content. `SqliteMediaAdapter` / `SqliteMediaFolderAdapter` and `PostgresMediaAdapter` / `PostgresMediaFolderAdapter` implement `IMediaMetadataAdapter` and `IMediaFolderStorage` with the same behaviour on both databases. The filesystem adapter has no media tables, so media needs SQLite or Postgres.
- **File bytes** go to the `IFileStore` that `media.provider` names: local disk, Vercel Blob, S3-compatible or Google Cloud Storage, each in its own package. Unset means media is off; there is no default store.

`MediaLibrary` in `@krantho/api` composes the two into the `IMediaStorage` the API calls:

```typescript
interface IMediaStorage {
  upload(file: Uint8Array, filename: string, mimeType: string): Promise<MediaItem>
  register(item: { filename, url, mimeType, size, width, height, altText? }): Promise<MediaItem>
  list(options?: MediaListOptions): Promise<{ items: MediaItem[]; total: number }>
  get(id: string): Promise<MediaItem | null>
  update(id: string, updates: MediaUpdateData): Promise<MediaItem | null>
  delete(id: string): Promise<void>
  bulkDelete(ids: string[]): Promise<BulkDeleteResult>
  bulkUpdateAltText(ids: string[], altText: string): Promise<number>
  replace(id: string, file: Uint8Array, filename: string, mimeType: string): Promise<MediaItem | null>
  duplicate(id: string): Promise<MediaItem | null>
  listTags(): Promise<string[]>
  readOriginal(id: string): Promise<Uint8Array | null>
}
```

`MediaItem` includes `id`, `filename`, `url`, `altText`, `mimeType`, `size`, `width`, `height`, `folder`, `tags`, `crop` (percentage-based region), and `hotspot` (center + ellipse for adaptive aspect-ratio cropping). The persisted `MediaRecord` adds `storageKey`, the object's key in the file store (null for a registered external URL).

Metadata is append-only like content: every update appends a version, and a delete appends a tombstone. A checkpoint restore rewinds media rows too, but not the file store -- a restored record whose file a later replace or delete removed answers 404 on its image. See [media.md](media.md) for the stores, their settings and the image URLs.

## Auth Adapter

```typescript
interface IAuthAdapter {
  // User CRUD, refresh token management, permission checks
}
```

Supports `UserRecord`, `CreateUserData`, `UpdateUserData`, `RefreshTokenRecord`, and `UserPermission` types. Role-based access with `Role` type.

## Advisory Locking

```typescript
interface ILockAdapter {
  getLock(collection: string, slug: string, locale: string): Promise<ContentLock | null>
  acquireLock(collection: string, slug: string, locale: string, lockedBy: string, expiresAt: string): Promise<void>
  releaseLock(collection: string, slug: string, locale: string): Promise<void>
  listLocks(): Promise<ContentLock[]>   // every unexpired lock
}
```

`ContentLock` includes `collection`, `slug`, `locale`, `lockedBy`, `lockedAt`, and `expiresAt`. Studio acquires locks when editing to prevent concurrent modifications. The API enforces them: while another user holds an unexpired lock on a document, saving, restoring, publishing, unpublishing, archiving and deleting it answer `423` (see [api.md](../api.md)). Expired locks block no one.

## Webhook Delivery

```typescript
interface IWebhookDeliveryAdapter {
  listDeliveries(options: {
    limit: number
    offset: number
    status?: 'pending' | 'delivered' | 'failed'
  }): Promise<{ deliveries: WebhookDeliveryRecord[]; total: number }>
  getDelivery(id: number): Promise<StoredWebhookDelivery | null>
  requeueDelivery(id: number, dueAt: Date): Promise<WebhookDeliveryRecord | null>
  logDelivery(delivery: NewWebhookDelivery): Promise<number>
  markDelivered(id: number, status: number): Promise<void>
  markFailed(id: number, status: number, nextRetryAt: Date): Promise<void>
  claimDueDeliveries(options: {
    urls: readonly string[]
    now: Date
    leaseUntil: Date
    limit: number
  }): Promise<StoredWebhookDelivery[]>
}
```

Webhook records track `url`, `event`, `status`, `attempts`, `nextRetryAt`, `createdAt`, and `deliveredAt`. Failed deliveries are retried on a fixed backoff schedule; after the last attempt (`MAX_WEBHOOK_ATTEMPTS`) the delivery is marked `failed`.

## Version Retention

```typescript
interface IRetentionAdapter {
  purgeVersions(maxVersionsPerItem: number): Promise<PurgeResult[]>
  countVersions(): Promise<{ total: number; current: number; historical: number }>
}
```

Purges old versions while keeping the N most recent per content item, and never the live version. `PurgeResult` reports per-item counts.

## Migration and Checkpoint System

### Schema Migrations

Database adapters use numbered migrations for schema evolution:

```typescript
interface Migration {
  version: number        // monotonic: 1, 2, 3, ...
  name: string           // e.g., 'initial_tables', 'add_locale_column'
  apply: MigrationApplyFn
}

interface MigrationResult {
  applied: AppliedMigration[]
  currentVersion: number
}
```

Each migration is idempotent within its transaction. Applied migrations are recorded with checksums in `schema_migrations`. The `decideMigration()` utility determines whether to skip, apply, or reject based on checksum validation.

### Checkpoints

Point-in-time restore via `is_current` flags:

```typescript
interface ICheckpointAdapter {
  createCheckpoint(name?: string, trigger?: CheckpointTrigger): Promise<CheckpointInfo>
  listCheckpoints(): Promise<CheckpointInfo[]>
  getCheckpoint(version: number): Promise<CheckpointInfo | null>
  restoreCheckpoint(version: number): Promise<CheckpointInfo>
  deleteCheckpoint(version: number): Promise<boolean>
}
```

Triggers: `'manual'`, `'pre-migration'`, `'pre-restore'`, `'pre-import'`. Checkpoints record a timestamp marker -- restoring rewinds `is_current` flags to the checkpoint time without copying data, and with them each document's live version.

### Content Migration

For syncing filesystem content manifests with the database:

```typescript
interface IContentMigrationAdapter {
  getContentManifestVersion(): Promise<number | null>
  getContentManifest(): Promise<ContentManifestRecord | null>
  saveContentManifest(manifest: ContentManifestRecord): Promise<void>
  listConflicts(): Promise<ContentConflict[]>
  resolveConflict(conflictId: number, resolution: ConflictResolution): Promise<boolean>
  recordConflict(conflict: Omit<ContentConflict, 'id' | 'resolved' | 'resolvedAt' | 'resolution'>): Promise<void>
}
```

Content manifests track file checksums. When the repo version advances, the migration system detects new, changed, and deleted files. Conflicts arise when both repo and database have changed the same content -- resolution options are `'keep_db'` or `'use_repo'`.

## Writing a Custom Adapter

Implement `IPersistenceAdapter` from `@krantho/persistence`. Start with the required methods, add optional capabilities as needed.

```typescript
import type { ContentMetadata } from '@krantho/core'
import type { IPersistenceAdapter } from '@krantho/persistence'

export class InMemoryAdapter implements IPersistenceAdapter {
  private pages = new Map<string, string>()

  async exists(slug: string): Promise<boolean> {
    return this.pages.has(slug)
  }

  async read(slug: string): Promise<string> {
    const content = this.pages.get(slug)
    if (!content) throw new Error(`Not found: ${slug}`)
    return content
  }

  async getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>> {
    const content = await this.read(slug)
    return { size: content.length, lastModified: new Date() }
  }

  async listSlugs(): Promise<string[]> {
    return [...this.pages.keys()]
  }
}
```

The handler's `persistence.provider` leaf selects one of the built-in backends (`sqlite`, `postgres`, `filesystem`); it does not take a custom adapter. Plug a custom adapter into the content engine directly:

```typescript
import { ContentEngineFactory } from '@krantho/core'

const engine = ContentEngineFactory.create(new InMemoryAdapter())
const result = await engine.loadContent('home')
```

Server components read through an `IPublishedContentLoader` (from `@krantho/core`) registered with `initServerLoader()` from `@krantho/ui-react/server`. To serve pages from a custom store, implement that interface -- `getPublished(ref)`, `listPublished(collection, locale?)` and `listPublishedSummaries(collection, locale?)` (the same documents without their body), returning only live content -- over it.

## Rendering Modes

| Rendering mode | Read pattern | Write support | Adapter requirements |
|----------------|-------------|---------------|---------------------|
| **SSG** | Build-time only | No | `getPublished` + `query` |
| **SSR** | Per-request | Yes | Must handle concurrent reads |
| **ISR** | Background revalidation | No | Must return fresh data |

Every mode renders the live (published) version. Caching layers stack independently:

```
Next.js cache (SSG/ISR page cache)
  -> content loader read cache (createContentLoader, per content.cache)
    -> IPersistenceAdapter (getPublished / query)
```

The filesystem adapter is safe for concurrent reads (independent file handles). Database adapters should use connection pooling. The loader's read cache reduces adapter calls within the TTL window.

## Site Settings

```typescript
interface ISiteSettingsAdapter {
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  getAllSettings(): Promise<Record<string, string>>
}
```

Runtime key-value store for site configuration that can be changed without code deployment.

## SEO Configuration

```typescript
interface ISeoConfigAdapter {
  getConfig(id: string): Promise<SeoConfig | null>
  saveConfig(config: Omit<SeoConfig, 'createdAt' | 'updatedAt'>): Promise<void>
  deleteConfig(id: string): Promise<void>
  listConfigs(scope?: SeoConfigScope): Promise<SeoConfig[]>
  listConfigsByPrefix(prefix: string): Promise<SeoConfig[]>
  deleteAllConfigs(): Promise<number>
}
```

Stores SEO archetype configuration at four scopes (`'site'`, `'collection'`, `'document'`, `'route'`). Config IDs follow a convention: `'site'`, `'collection:pages'`, `'doc:pages/home'`, `'route:/blog/*'`.

---

For API details, see: [persistence](../persistence.md), [core](../core.md), [schema](../schema.md).
