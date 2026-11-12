# @krantho/persistence-sqlite

SQLite implementation of `IPersistenceAdapter`. Stores content, version history, runtime schemas, and all sub-adapter data in a single SQLite file using `better-sqlite3`. Uses an append-only versioning model where every write creates a new version row, with `is_current` flags to track the latest state.

## Context

SQLite is the default persistence backend for krantho. It provides zero-config setup (just a file path), ACID transactions, and excellent read performance for content workloads. The single-file model makes backup, migration, and development straightforward.

## Rationale

- **Append-only versioning** -- every content write inserts a new row with an incremented version number. The previous current row has `is_current` flipped to `FALSE`. This provides full version history without separate audit tables.
- **WAL journal mode** -- enabled on connection for concurrent read/write access.
- **Prepared statements** -- all frequent queries are prepared once at construction time for performance.
- **Sub-adapters share the database handle** -- checkpoint, auth, lock, webhook, retention, settings, SEO config and media adapters all receive the same `Database` instance, so they participate in the same connection pool and transaction scope.
- **Self-bootstrapping migrations** -- the migration runner creates the `schema_migrations` table if it does not exist, so a fresh database is ready after construction.

## Architecture

### Directory Layout

```
src/
  sqlite-adapter.ts          -- SQLiteAdapter (IPersistenceAdapter)
  migration-runner.ts        -- runMigrations, getSchemaVersion, getAppliedMigrations
  migrations/index.ts        -- sqliteMigrations array
  migrations/*.ts            -- individual migration definitions
  queries.ts                 -- prepareStatements, the row types and the META_COLUMNS and SUMMARY_COLUMNS projections
  content-query.ts           -- buildContentQuery, runContentQuery: the SQL of the one content list read
  row-mapping.ts             -- the row-to-document mappers
  checkpoints.ts             -- SqliteCheckpointAdapter
  content-migration.ts       -- SqliteContentMigrationAdapter, computeContentChecksum, decideMigration
  auth-adapter.ts            -- SqliteAuthAdapter
  lock-adapter.ts            -- SqliteLockAdapter
  webhook-delivery-adapter.ts -- SqliteWebhookDeliveryAdapter
  retention-adapter.ts       -- SqliteRetentionAdapter
  site-settings-adapter.ts   -- SqliteSiteSettingsAdapter
  seo-config-adapter.ts      -- SqliteSeoConfigAdapter
  media-adapter.ts           -- SqliteMediaAdapter (IMediaMetadataAdapter)
  media-folder-adapter.ts    -- SqliteMediaFolderAdapter (IMediaFolderStorage)
  page-cache-store.ts        -- SqlitePageCacheStore
```

### Data Model

The core `content` table stores all content versions:

- `id` (UUID), `collection`, `slug`, `locale`, `version`, `is_current` (BOOLEAN)
- `live_version` -- the version of the document live (published) as of this row, or `NULL`; the current row's value is the document's live version (see [Live Version](persistence.md#live-version))
- `status` (draft/published/archived/deleted, kept consistent with `live_version`; reads derive the publication state from `live_version`), `fields` (JSON TEXT), `body`, `html`, `sections` (JSON TEXT)
- `source` (filesystem/api), `file_path`, `changed_by`, `deleted_at`, `created_at`

The `collection_schemas` table stores runtime field extensions with the same append-only pattern.

The shared page cache (migration `v012-page-cache`) has two tables. `page_cache_entries` holds one row per cache key: `key` (primary key), `value` (TEXT, `encodePageCacheValue` — JSON, binary leaves base64), `tags` (a JSON array, replaced on every write) and `last_modified`. `page_cache_tags` holds one row per tag ever marked: `tag` (primary key), `stale_at`, and `expired_at` (`NULL` until the tag is first expired). Timestamps are epoch milliseconds (INTEGER).

## API Reference

### `SQLiteAdapter`

Implements `IPersistenceAdapter`. Constructor takes a `dbPath` string and options (`defaultLocale` is required), creates the database with WAL mode, runs migrations, and prepares statements.

```typescript
const adapter = new SQLiteAdapter('/path/to/content.db', { defaultLocale: 'en' })

// With explicit tuning — what the server passes from the resolved config tree
const tuned = new SQLiteAdapter('/path/to/content.db', {
  defaultLocale: 'en',
  busyTimeoutMs: 10000,
  walRetries: 10,
  walRetryDelayMs: 50,
  defaultStatus: { filesystem: 'published' },
})
```

**Constructor options (`SQLiteAdapterOptions`):**

| Option | Default | Effect |
|---|---|---|
| `defaultLocale` | required | The locale of every read and write that names none: the site's default locale, `site.defaultLocale` in the configuration. The adapter has no fallback of its own |
| `busyTimeoutMs` | `10000` | How long a statement waits for another connection's write lock |
| `walRetries` | `10` | Attempts to switch a brand-new file into WAL mode |
| `walRetryDelayMs` | `50` | Pause between those attempts |
| `defaultStatus.filesystem` | `'published'` | Status for `upsertFromFile` when the frontmatter declares none |

A deployment sets these through `persistence.sqlite` and `content.defaultStatus.filesystem` in
the krantho configuration tree; `createKranthoHandler` passes the resolved values down. The
defaults exported as `DEFAULT_SQLITE_CONNECTION_OPTIONS` and `DEFAULT_SQLITE_STATUS` are the
standalone-library fallback and mirror that tree. A write through `writeContent` takes no
status: the stored status follows from the live version the write leaves.

**Properties:**
- `database` -- the underlying `better-sqlite3` Database instance (exposed for sub-adapter construction)

**Content methods:**
- `exists(slug): Promise<boolean>` -- check if a current, non-deleted document exists
- `read(slug): Promise<string>` -- reconstruct raw markdown with YAML frontmatter
- `getMetadata(slug): Promise<{ size, lastModified }>` -- file-like metadata for a document
- `listSlugs(): Promise<string[]>` -- all distinct slugs of current, non-deleted documents
- `getContent(collection, slug, locale?): Promise<ContentDocument | null>` -- full document with fields, body, html, sections
- `getPublished(collection, slug, locale?): Promise<ContentDocument | null>` -- the live (published) version, or `null` when nothing is live; newer saved versions do not replace it
- `query(spec): Promise<QueryPage<P>>` -- the one list read: a projection (`meta`, `summary`, `full`) of the current or live versions over one or many collections, with locale, status, text match, sort and a page, in one statement (see [ContentQuery](persistence.md#contentquery)). `status` filters by publication state (`statusCondition`), so `published` includes documents with changes ahead of live. A text match folds with `kr_lower`, a function the connection registers (`openDatabase`) that is JavaScript `toLowerCase`, because SQLite's own `lower()` folds ASCII only

**Write methods:**
- `writeContent(data, changedBy?): Promise<void>` -- append a new version from API data: a save without `data.publication`, or a publish, unpublish or archive with it
- `deleteContent(collection, slug, locale?, changedBy?): Promise<void>` -- soft-delete by inserting a `status: 'deleted'` version
- `upsertFromFile(collection, slug, fields, body, html, sections, filePath, locale?, modifiedAt?): Promise<void>` -- `modifiedAt` (ISO 8601) dates the new version by when the file last changed; without it, now. -- import from filesystem, skips if unchanged

Every write records the row's live version and stored status by the shared rules in `@krantho/persistence` ([Live Version](persistence.md#live-version)): a save keeps the live page, publishing makes the new version live, unpublishing, archiving or deleting takes it offline, and a file import is live when the file's status is `published`.

**Version methods:**
- `listVersions(collection, slug, locale?): Promise<DocumentMeta[]>` -- all versions, newest first
- `getVersion(collection, slug, version, locale?): Promise<ContentDocument | null>` -- specific version
- `restoreVersion(collection, slug, version, changedBy?, locale?): Promise<boolean>` -- a save: creates a new current version from an old one and keeps the live version

**Schema methods:**
- `getRuntimeSchema(collection): Promise<RuntimeSchemaDefinition | null>` -- current runtime field extensions
- `saveRuntimeSchema(collection, schema, changedBy?): Promise<void>` -- append a new schema version

**Lifecycle:**
- `close(): void` -- close the database connection

### `openDatabase`

```typescript
function openDatabase(dbPath: string, options?: Partial<SqliteConnectionOptions>): Database
```

Opens a connection, applies `busy_timeout`, switches the file into WAL mode with the
configured retries, and turns on `foreign_keys`. Every connection to a krantho SQLite file
should go through it so the whole process shares one set of pragmas.

### Migration System

```typescript
import { runMigrations, getSchemaVersion, getAppliedMigrations, sqliteMigrations } from '@krantho/persistence-sqlite'
```

- `runMigrations(db, migrations): MigrationResult` -- runs pending migrations in transactions, validates checksums of applied migrations
- `getSchemaVersion(db): number` -- current max version from `schema_migrations`
- `getAppliedMigrations(db): AppliedMigration[]` -- full list of applied migrations with checksums
- `sqliteMigrations` -- the built-in migration array (`v010-content-live-version` adds `live_version` and backfills it: the latest published version at or before each row, unless a deletion lies between; tombstones get `NULL`. `v011-media` adds the media table; `v012-page-cache` adds the page cache tables; `v013-content-contracts` adds authored metadata to content rows, metadata groups to runtime schemas and a locale to import conflicts, and moves document SEO from `seo_config` into document metadata)

```typescript
interface SqliteMigration {
  version: number
  name: string
  apply: (db: Database.Database) => void
}
```

### Sub-Adapters

All sub-adapters take the `Database` instance from `SQLiteAdapter.database`.

**SqliteCheckpointAdapter** -- implements `ICheckpointAdapter`. Lightweight timestamp markers for snapshotting database state. Creating a checkpoint records the current time; restoring rewinds `is_current` flags, and with them each document's live version.

**SqliteContentMigrationAdapter** -- implements `IContentMigrationAdapter`. Tracks content manifest versions and file checksums for incremental import. Exports `computeContentChecksum` and `decideMigration` utilities.

**SqliteAuthAdapter** -- implements `IAuthAdapter`. User management (create, find by email/ID/OIDC subject), role assignment, refresh token storage, and per-collection permissions.

**SqliteLockAdapter** -- implements `ILockAdapter`. Advisory content locking with automatic expiration. Supports acquire, release, refresh, and force-break operations; `listLocks()` deletes expired locks and returns the rest, ordered by collection, slug and locale.

**SqliteWebhookDeliveryAdapter** -- implements `IWebhookDeliveryAdapter`. Logs a first send (`logDelivery`), records its outcome (`markDelivered`, `markFailed`), lists the deliveries that are due again (`claimDueDeliveries`), claims due deliveries in one `UPDATE … RETURNING`, lists the delivery log by status, reads one delivery with its payload, and re-queues a failed one for a retry.

**SqliteRetentionAdapter** -- implements `IRetentionAdapter`. Purges old content versions beyond a configurable threshold per document, never the live version.

**SqliteSiteSettingsAdapter** -- implements `ISiteSettingsAdapter`. Key-value store for runtime site settings (LLM config, etc.) with upsert semantics.

**SqliteSeoConfigAdapter** -- implements `ISeoConfigAdapter`. CRUD for SEO archetype configuration scoped by site, collection, route, and document.

**SqliteMediaAdapter** -- implements `IMediaMetadataAdapter`. Versioned media metadata in the `media` table (`v011-media`): every change appends a version and flips `is_current` in one transaction; a delete appends a tombstone. Search is a case-insensitive `LIKE` on the file name; the tag filter matches the JSON tag list. The file bytes live in the file store `media.provider` picks (see [guides/media.md](guides/media.md)).

**SqliteMediaFolderAdapter** -- implements `IMediaFolderStorage`. The media folder tree in `media_folders`. Creating under a missing parent, or deleting a folder that has child folders or media, throws.

**SqlitePageCacheStore** -- implements `IPageCacheStore` (see [Page Cache](persistence.md#page-cache)), the shared Next.js page cache. Timestamps come from this process's clock (`Date.now()`): a SQLite database has one host. Every instance that shares it must open the same database file. `countTagged` matches an entry's JSON `tags` array against the requested tags. Nothing is evicted; the tables grow with the pages and data the site caches.

### Additional Exports

- `ContentRow` type -- raw row shape from the content table

## Usage

### Direct Usage

```typescript
import { SQLiteAdapter, SqliteCheckpointAdapter } from '@krantho/persistence-sqlite'

const adapter = new SQLiteAdapter('./data/content.db', { defaultLocale: 'en' })
const checkpoints = new SqliteCheckpointAdapter(adapter.database)

// Write content
await adapter.writeContent({
  collection: 'pages',
  slug: 'about',
  fields: { title: 'About Us', description: 'Our story' },
  body: '# About Us\n\nWelcome.',
  html: '<h1>About Us</h1><p>Welcome.</p>',
})

// Read back: the current version, not live yet (a save keeps the live version)
const doc = await adapter.getContent('pages', 'about')
// doc.meta: { version: 1, liveVersion: null, status: 'draft', ... }

// Publish the current version: appends version 2 and makes it live
if (doc) {
  await adapter.writeContent({
    collection: 'pages',
    slug: 'about',
    fields: doc.fields,
    body: doc.body,
    publication: 'publish',
  })
}
const live = await adapter.getPublished('pages', 'about')
```

### Via @krantho/server (typical)

Most consumers use this package indirectly through `@krantho/server`. SQLite is the default `persistence.provider`; the file is `persistence.sqlite.path` (default `.krantho/content.db`, env `KRANTHO_PERSISTENCE_SQLITE_PATH`). See [server.md](server.md) and [configuration.md](configuration.md).

## Dependencies

### Runtime Dependencies

- `better-sqlite3` -- synchronous SQLite3 bindings for Node.js

### Workspace Dependencies

- `@krantho/core` -- `ContentMetadata` type
- `@krantho/persistence` -- `IPersistenceAdapter`, `ICheckpointAdapter`, and all sub-adapter interfaces; shared helpers (`contentDocumentFromRow`, `documentMetaFromRow`, `validateChecksums`, etc.)
- `@krantho/seo-shared` -- `SeoConfigData` type for SEO config adapter
