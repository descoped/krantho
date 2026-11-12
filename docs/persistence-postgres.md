# @krantho/persistence-postgres

PostgreSQL implementation of `IPersistenceAdapter`. Provides the same content storage, version history, and query capabilities as `@krantho/persistence-sqlite`, but uses PostgreSQL with native JSONB columns for fields and sections. Suitable for production deployments requiring concurrent access, replication, or managed database services.

## Context

While SQLite is the default and simplest persistence backend, production sites with high concurrency or managed infrastructure needs benefit from PostgreSQL. Every sub-adapter is implemented, media metadata, folders and webhook delivery logging included.

## Rationale

- **Native JSONB** -- fields and sections are stored as JSONB columns, enabling PostgreSQL-native JSON queries and indexing. The adapter uses `sql.json()` to bind objects correctly as JSONB parameters.
- **Async initialization** -- unlike SQLite's synchronous constructor, `PostgresAdapter.create()` is an async factory that runs migrations before returning. All methods call `ensureInitialized()` as a safety guard; concurrent calls share one in-flight migration run, and a failed run is retried by the next call.
- **Same append-only model** -- content writes follow the identical pattern: flip `is_current` to `FALSE` on existing rows, insert a new row with incremented version. Transactions use `sql.begin()`.
- **Parameterized unsafe queries** -- dynamic queries (sorting, pagination) use `sql.unsafe()` with positional parameters to prevent SQL injection while supporting dynamic WHERE and ORDER BY clauses.

## Architecture

### Directory Layout

```
src/
  postgres-adapter.ts              -- PostgresAdapter (IPersistenceAdapter)
  content-query.ts                 -- buildContentQuery, runContentQuery: the SQL of the one content list read
  row-mapping.ts                   -- row types, META_COLUMNS, SUMMARY_COLUMNS and the row-to-document mappers
  migration-runner.ts              -- runMigrations, getSchemaVersion, getAppliedMigrations
  migrations/index.ts              -- postgresMigrations array
  migrations/*.ts                  -- individual migration definitions
  content-migration.ts             -- PostgresContentMigrationAdapter
  auth-adapter.ts                  -- PostgresAuthAdapter
  postgres-checkpoints.ts          -- PostgresCheckpointAdapter
  postgres-lock-adapter.ts         -- PostgresLockAdapter
  postgres-site-settings-adapter.ts -- PostgresSiteSettingsAdapter
  postgres-seo-config-adapter.ts   -- PostgresSeoConfigAdapter
  postgres-webhook-delivery-adapter.ts -- PostgresWebhookDeliveryAdapter
  postgres-retention-adapter.ts    -- PostgresRetentionAdapter
  postgres-media-adapter.ts        -- PostgresMediaAdapter (IMediaMetadataAdapter)
  postgres-media-folder-adapter.ts -- PostgresMediaFolderAdapter (IMediaFolderStorage)
  postgres-page-cache-store.ts     -- PostgresPageCacheStore
```

### Data Model

Identical schema to SQLite, but with PostgreSQL types:

- `fields` and `sections` are `JSONB` (not JSON TEXT)
- `created_at` is `TIMESTAMPTZ` (not TEXT)
- `is_current` is native `BOOLEAN`
- `live_version` records the version live (published) as of each row, as on SQLite (see [Live Version](persistence.md#live-version))
- Primary keys use `TEXT` for UUIDs

## API Reference

### `PostgresAdapter`

Implements `IPersistenceAdapter`. Created via the async factory method.

```typescript
import postgres from 'postgres'
const sql = postgres(process.env.KRANTHO_PERSISTENCE_POSTGRES_URL!)
const adapter = await PostgresAdapter.create(sql, { defaultLocale: 'en' })
```

**Factory:**
- `PostgresAdapter.create(sql: Sql, options: PostgresAdapterOptions): Promise<PostgresAdapter>` -- runs migrations, returns initialized adapter

**Constructor options (`PostgresAdapterOptions`):**

| Option | Default | Effect |
|---|---|---|
| `defaultLocale` | required | The locale of every read and write that names none: the site's default locale, `site.defaultLocale` in the configuration. The adapter has no fallback of its own |
| `defaultStatus.filesystem` | `'published'` | Status for `upsertFromFile` when the frontmatter declares none |

A write through `writeContent` takes no status: the stored status follows from the live version the write leaves.

**Content methods** -- identical signatures to `SQLiteAdapter`:
- `exists(slug): Promise<boolean>`
- `read(slug): Promise<string>`
- `getMetadata(slug): Promise<{ size, lastModified }>`
- `listSlugs(): Promise<string[]>`
- `getContent(collection, slug, locale?): Promise<ContentDocument | null>`
- `getPublished(collection, slug, locale?): Promise<ContentDocument | null>` -- the live (published) version, or `null`
- `query(spec): Promise<QueryPage<P>>` -- the one list read: a projection (`meta`, `summary`, `full`) of the current or live versions over one or many collections, with locale, status, text match, sort and a page, in one statement (see [ContentQuery](persistence.md#contentquery))

**Write methods:**
- `writeContent(data, changedBy?): Promise<void>` -- a save without `data.publication`, or a publish, unpublish or archive with it
- `deleteContent(collection, slug, locale?, changedBy?): Promise<void>`
- `upsertFromFile(collection, slug, fields, body, html, sections, filePath, locale?, modifiedAt?): Promise<void>` -- `modifiedAt` (ISO 8601) dates the new version by when the file last changed; without it, now.

Writes record the live version and stored status by the same shared rules as SQLite ([Live Version](persistence.md#live-version)), and `query` filters `status` by publication state through the same `statusCondition`.

**Version methods:**
- `listVersions(collection, slug, locale?): Promise<DocumentMeta[]>`
- `getVersion(collection, slug, version, locale?): Promise<ContentDocument | null>`
- `restoreVersion(collection, slug, version, changedBy?, locale?): Promise<boolean>` -- a save: the live version is kept

**Schema methods:**
- `getRuntimeSchema(collection): Promise<RuntimeSchemaDefinition | null>`
- `saveRuntimeSchema(collection, schema, changedBy?): Promise<void>`

**Lifecycle:**
- `close(): Promise<void>` -- closes the PostgreSQL connection (async, unlike SQLite)

### Migration System

```typescript
import { runMigrations, getSchemaVersion, getAppliedMigrations, postgresMigrations } from '@krantho/persistence-postgres'
```

- `runMigrations(sql, migrations): Promise<MigrationResult>` -- async version; all pending migrations run in one transaction that holds a transaction-scoped advisory lock (`pg_advisory_xact_lock`) with a fixed key. Concurrent runs against one database -- several serverless instances cold-starting at once -- serialize on the lock; a waiting run re-reads the ledger once it holds the lock and applies nothing that is already recorded. A failed migration rolls back the whole run. An already-migrated database takes a lock-free fast path.
- `getSchemaVersion(sql): Promise<number>` -- handles `42P01` (table not found) gracefully
- `getAppliedMigrations(sql): Promise<AppliedMigration[]>`
- `postgresMigrations` -- the built-in migration array (`v010-content-live-version` adds and backfills `live_version`, as on SQLite; `v011-media` adds the media table; `v012-page-cache` adds the page cache tables; `v013-content-contracts` adds authored metadata to content rows, metadata groups to runtime schemas and a locale to import conflicts, and moves document SEO from `seo_config` into document metadata)

```typescript
interface PostgresMigration {
  version: number
  name: string
  apply: (sql: TransactionSql) => Promise<void>
}
```

### Content Query

`query` builds one parameterized statement in `content-query.ts`: the projection's column list (`meta` and `summary` never select `body`, `html`, `sections` or `SELECT *`), the rows of the state (`is_current` rows, or the live row of each current document through a subquery on `live_version`), the match, the order and `LIMIT n + 1`. Every name in the SQL is a whitelisted column; collections, locale, match text and paging are positional parameters run through `sql.unsafe()`. The module exports `buildContentQuery(spec)` and `orderByClause(sort)` for unit tests; they are not part of the package's API.

- `orderByClause(sort)` -- the requested sort, then `collection, slug, locale`. Direct columns: `slug`, `status`, `locale`, `created_at`. Other fields order as SQLite's `json_extract` does: a missing value first, then numbers numerically (`jsonb_typeof` and a `numeric` cast), then other values as text (`fields->>'fieldName'`), so `9` sorts before `10`.
- A text match folds both sides with `lower()` and matches with `LIKE ... ESCAPE '\'`; the `fields` target is `fields::text`, the `jsonb` rendered with Postgres's own spacing and key order. A snippet is `substr` around `strpos` of the folded text.

#### Collation

`lower()` follows the database's collation (`LC_CTYPE`). On a UTF-8 database with a Unicode-aware locale, `lower('ØRRET')` is `ørret` and a search for "ørret" finds "Ørret". A database created with the `C` locale folds ASCII letters only, so a case-insensitive match on a non-ASCII letter (`Ø`, `Æ`, `Å`) fails there: the needle is folded by JavaScript and the stored text is not. Create the database with a UTF-8 locale if content or searches use non-ASCII letters; the test suite runs on `postgres:18-alpine`, which is UTF-8.

### Sub-Adapters

All sub-adapters take the `Sql` instance from the `postgres` driver.

**PostgresCheckpointAdapter** -- implements `ICheckpointAdapter`. Same checkpoint semantics as SQLite.

**PostgresContentMigrationAdapter** -- implements `IContentMigrationAdapter`. Content manifest tracking for incremental import.

**PostgresAuthAdapter** -- implements `IAuthAdapter`. User management, roles, refresh tokens, permissions.

**PostgresLockAdapter** -- implements `ILockAdapter`. Advisory content locking with expiration; `listLocks()` deletes expired locks and returns the rest, ordered by collection, slug and locale.

**PostgresWebhookDeliveryAdapter** -- implements `IWebhookDeliveryAdapter`. Logs a first send (`logDelivery`), records its outcome (`markDelivered`, `markFailed`), claims the deliveries that are due again (`claimDueDeliveries`: one `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` that holds each claimed delivery until the lease ends, so several instances sweeping one database never send a retry twice), lists the log by status, reads one delivery with its payload and re-queues a failed one. The payload column is JSONB, so a retried payload is equivalent JSON, not the first send's bytes: its signature is computed afresh, and a receiver that dedupes should compare the event, collection and slug rather than a hash of the body.

**PostgresRetentionAdapter** -- implements `IRetentionAdapter`. Version purging beyond a configurable threshold.

**PostgresSiteSettingsAdapter** -- implements `ISiteSettingsAdapter`. Key-value runtime settings.

**PostgresSeoConfigAdapter** -- implements `ISeoConfigAdapter`. SEO archetype configuration CRUD.

**PostgresMediaAdapter** -- implements `IMediaMetadataAdapter`. Versioned media metadata in the `media` table (`v011-media`), with the same behaviour as `SqliteMediaAdapter`: `appendVersion` and `markDeleted` run in one transaction, and `UNIQUE (id, version)` rejects a concurrent duplicate. Search uses `ILIKE` and the tag filter JSONB `@>`, matching SQLite's case-insensitive `LIKE` and tag match.

**PostgresMediaFolderAdapter** -- implements `IMediaFolderStorage`. The media folder tree in `media_folders` (`v007-media-folders`), with the same rules as on SQLite.

**PostgresPageCacheStore** -- implements `IPageCacheStore` (see [Page Cache](persistence.md#page-cache)), the Next.js page cache shared by every instance of a site. The tables are those of SQLite with Postgres types: `page_cache_entries` (`key`, `value` TEXT, `tags` TEXT[], `last_modified` BIGINT) and `page_cache_tags` (`tag`, `stale_at` BIGINT, `expired_at` BIGINT, `NULL` until first expired). Timestamps are epoch milliseconds from the database clock (`clock_timestamp()`), so an entry written on one instance and a mark made on another compare on one clock. `markTags` upserts tags in sorted order, so concurrent marks lock rows in one order and cannot deadlock. `countTagged` counts entries whose `tags` array overlaps the requested tags. Nothing is evicted; the tables grow with the pages and data the site caches.

## Usage

### Direct Usage

```typescript
import postgres from 'postgres'
import { PostgresAdapter, PostgresCheckpointAdapter } from '@krantho/persistence-postgres'

const sql = postgres('postgresql://localhost:5432/mysite')
const adapter = await PostgresAdapter.create(sql, { defaultLocale: 'en' })
const checkpoints = new PostgresCheckpointAdapter(sql)

await adapter.writeContent({
  collection: 'pages',
  slug: 'home',
  fields: { title: 'Home', description: 'Welcome' },
  body: '# Welcome',
})
```

### Via @krantho/server (typical)

```typescript
// krantho.config.ts -- the URL comes from KRANTHO_PERSISTENCE_POSTGRES_URL
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  persistence: { provider: 'postgres' },
})

// the route file
import { createKranthoHandler } from '@krantho/server'
import config from './krantho.config'

const handler = await createKranthoHandler({ config, collections })
```

See [server.md](server.md) for full configuration.

The adapter package and the driver are optional peers of `@krantho/server`, loaded only when the provider is `postgres`. An app that selects Postgres lists both in its own dependencies:

```json
{
  "dependencies": {
    "@krantho/persistence-postgres": "^0.1.0",
    "postgres": "^3.4.9"
  }
}
```

Without them, boot fails with an error naming the missing packages.

### Connection Pool

`@krantho/server` creates a `postgres()` client from these leaves for every adapter it opens: the API handler's, the content loader's (a Next.js or SvelteKit page process holds both), and a third when the process runs the shared Next.js cache handler (see [server-next.md](server-next.md#shared-cache-across-instances)). Size `max` with that in mind:

| Leaf | Environment | Unset means |
|---|---|---|
| `persistence.postgres.url` | `KRANTHO_PERSISTENCE_POSTGRES_URL` | required for the postgres provider |
| `persistence.postgres.maxConnections` | `KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS` | driver default, 10 connections |
| `persistence.postgres.prepare` | `KRANTHO_PERSISTENCE_POSTGRES_PREPARE` | driver default, prepared statements on |
| `persistence.postgres.idleTimeoutSec` | `KRANTHO_PERSISTENCE_POSTGRES_IDLE_TIMEOUT_SEC` | idle connections stay open |

An unset leaf is not passed to the driver at all, so the driver's own defaults and any options given as query parameters on the URL still apply.

### Serverless (Vercel, Neon, Supabase)

Every serverless instance holds its own pool, so the database sees the pool size multiplied by the number of warm instances.

- **Use the pooled connection URL** (Neon's `-pooler` host, Vercel Postgres' `POSTGRES_URL`, Supabase's transaction pooler on port 6543). It multiplexes many client connections onto few server connections.
- **Turn prepared statements off** behind a transaction pooler: `KRANTHO_PERSISTENCE_POSTGRES_PREPARE=false`. PgBouncer in transaction mode hands each transaction a different server connection, and a statement prepared on one is missing on the next.
- **Keep the pool small**: `KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS=1` to `3`. A single request rarely needs more.
- **Close idle connections**: `KRANTHO_PERSISTENCE_POSTGRES_IDLE_TIMEOUT_SEC=20`, so frozen instances do not pin server connections.

Migrations run on the first request an instance serves. Concurrent cold starts on a fresh database are safe -- they serialize on the migration lock -- but running migrations once from the build or CI before traffic arrives keeps that work off the request path.

## Dependencies

### Runtime Dependencies

- `postgres` -- PostgreSQL client for Node.js (wire protocol, no native bindings)

### Workspace Dependencies

- `@krantho/core` -- `ContentMetadata` type
- `@krantho/persistence` -- `IPersistenceAdapter` and all sub-adapter interfaces; shared helpers
- `@krantho/seo-shared` -- `SeoConfigData` type for SEO config adapter
