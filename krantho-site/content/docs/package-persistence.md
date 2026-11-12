---
title: "@krantho/persistence"
description: The persistence contract, with the interfaces for content, versions, media, auth, SEO configuration and the shared page cache.
area: reference
order: 107
level: advanced
prerequisites: [persistence]
related: [package-server, package-schema, package-core, media, rendering-modes]
status: published
---

The persistence contract. It defines the interfaces for content storage, versioning, media, auth, SEO configuration and the shared page cache. The adapters (SQLite, Postgres, filesystem) implement them in their own packages.

## Install

> [!NOTE]
> Krantho is in active development and its packages are not on npm yet. The command below is the one the first release will use. To run krantho today, see [Project status](/docs/project-status).

```bash
pnpm add @krantho/persistence
```

## Choose an adapter

| Adapter | Package | Best for |
|---------|---------|----------|
| SQLite | `@krantho/persistence-sqlite` | The default. A single-file database with no setup. |
| Postgres | `@krantho/persistence-postgres` | Production. Content, versions, locks, settings, SEO configuration, auth, media, webhook delivery logging and the shared page cache. |
| Filesystem | `@krantho/persistence-fs` | Development. Reads and writes the markdown files directly, with no version history, media or shared page cache. |

You rarely create an adapter yourself. The server handler creates one from the `persistence` section of `krantho.config.ts`:

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  // Omit the section for SQLite at .krantho/content.db, or:
  persistence: { provider: 'postgres' }, // URL from KRANTHO_PERSISTENCE_POSTGRES_URL
})
```

See [Configuration](/docs/configuration) for every persistence setting and its environment variable.

## IPersistenceAdapter

The primary interface. It extends `IContentLoader` from `@krantho/core`.

Required methods:

| Method | Purpose |
|--------|---------|
| `exists(slug)` | Check whether content exists |
| `read(slug)` | Read the raw content string |
| `getMetadata(slug)` | Get size and lastModified |
| `listSlugs()` | List all content slugs |

Optional methods for richer behavior:

| Method | Purpose |
|--------|---------|
| `writeContent(data)` | Append a new version: a save, or a publish, unpublish or archive with `data.publication` |
| `deleteContent(collection, slug, locale?, changedBy?)` | Soft-delete one locale's version of a document with a tombstone version; the filesystem adapter removes the file |
| `getContent(collection, slug, locale?)` | Get a full `ContentDocument` (the current version) |
| `getPublished(collection, slug, locale?)` | Get the published (live) version, or `null` |
| `query(spec)` | Read one page of documents: a projection (`meta`, `summary` or `full`), the current or published version, one or many collections, a locale, a status, a text match, a sort and a page. Answers `{ items, hasMore }` |
| `listVersions(collection, slug, locale?)` | Version history |
| `restoreVersion(collection, slug, version, changedBy?, locale?)` | Restore an earlier version as the current one |

### Published and current versions

The current version is what Studio edits; the published (live) version is what visitors see. Server-rendered pages and the sitemap read only the published version, through `getPublished` and a `published` `query`. What a `writeContent` does to the live version depends on its `publication`:

| `publication` | Live version after the write | Stored status |
|---------------|------------------------------|---------------|
| absent (a save) | Unchanged | `published` while a version is live, otherwise `draft`, or `archived` for an archived document |
| `'publish'` | The written version | `published` |
| `'unpublish'` | None | `draft` |
| `'archive'` | None | `archived` |

```ts
interface WriteContentData {
  collection: string
  slug: string
  locale?: string
  fields: Record<string, unknown>
  body: string
  html?: string
  sections?: Record<string, string>
  publication?: 'publish' | 'unpublish' | 'archive' // absent: a save
}
```

- A write addresses one document by collection, slug and locale. To change some fields, merge them into the current `fields` and write the document back with its `body`.
- `restoreVersion` is a save: the restored content becomes the current version and the live version stays. Deleting the document leaves nothing live. Version retention never removes the live version.
- Importing a markdown file publishes it when its `status` is `published`; the file is the source of that document.

The SQLite and Postgres adapters record the live version on every version row, and `DocumentMeta.liveVersion` carries it: equal to `version` when visitors see the current version, lower when the current version has unpublished changes, `null` when nothing is live. `DocumentMeta.status` is derived from it — `published` while a version is live, `draft` when none is, `archived` for an archived document, `deleted` for a tombstone. The shared rules are exported for adapter authors: `liveOnWrite`, `resolveLiveVersion`, `storedStatus`, `statusOf`, `publicationOfFile`, `statusCondition` and `currentIsLive`.

The filesystem adapter has no history: each file is version 1, live when its status is `published`, so a save to a published file is live at once.

## ContentDocument

A content document in the CMS.

```ts
interface ContentDocument {
  meta: DocumentMeta
  fields: Record<string, unknown>
  body: string
  html: string
  sections: Record<string, string>
}

interface DocumentMeta {
  collection: string
  slug: string
  locale: string
  version: number             // the current version
  liveVersion: number | null  // what visitors see; null when nothing is live
  status: 'draft' | 'published' | 'archived' | 'deleted'
  source: 'filesystem' | 'api' | 'import'
  changedBy: string | null
  createdAt: string
}
```

When the collection's schema declares a `status` field, `fields.status` states the same publication state as `meta.status` — for an archived document, `archived` when the schema allows that value, otherwise `draft`.

## Capability predicates

Type guards check what an adapter supports, and narrow its type for TypeScript.

```ts
import { canWriteContent, hasVersioning } from '@krantho/persistence'

if (canWriteContent(adapter)) {
  await adapter.writeContent(data)
}

if (hasVersioning(adapter)) {
  const versions = await adapter.listVersions('pages', 'about')
}
```

| Guard | Checks for |
|-------|-----------|
| `canQuery(adapter)` | `query` |
| `canGetContent(adapter)` | `getContent` |
| `canReadPublished(adapter)` | `getPublished` + `query` |
| `canWriteContent(adapter)` | `writeContent` + `deleteContent` |
| `hasVersioning(adapter)` | `listVersions` + `getVersion` + `restoreVersion` |
| `hasRuntimeSchema(adapter)` | `getRuntimeSchema` + `saveRuntimeSchema` |

## Media storage

Media is split in two. Versioned metadata and folders live in the database, as `IMediaMetadataAdapter` and `IMediaFolderStorage`, implemented by the SQLite and Postgres packages. The filesystem adapter has neither, so media needs SQLite or Postgres.

`IMediaMetadataAdapter` is append-only: `insert` writes a record's first version, `appendVersion` writes a new current version, `markDeleted` writes a tombstone, and `get`, `list` and `listTags` read the current versions. Each record carries the `storageKey` of its file, or `null` for a registered external URL.

File bytes go to an `IFileStore`, one package per store:

```ts
interface IFileStore {
  readonly label: string              // 'Local disk', 'Vercel Blob', 'S3', 'Google Cloud Storage'
  readonly location: string | null    // directory or bucket
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredFile>  // { key, url }
  get(key: string): Promise<Uint8Array | null>
  copy(fromKey: string, toKey: string, contentType: string): Promise<StoredFile>
  delete(key: string): Promise<void>  // no error when already gone
}
```

`MediaLibrary` in `@krantho/api` composes the two into `IMediaStorage`, the interface the media API calls: upload, register, list, get, update, delete, bulk operations, replace, duplicate, tags, and `readOriginal` for the image optimizer. The server builds it from `media.provider`; see [Media](/docs/media) and the store packages: [@krantho/media-local](/docs/package-media-local), [@krantho/media-vercel-blob](/docs/package-media-vercel-blob), [@krantho/media-s3](/docs/package-media-s3) and [@krantho/media-gcs](/docs/package-media-gcs).

## Page cache store

`IPageCacheStore` keeps the Next.js page cache in the site's own database, so several instances of one site share a cache and its invalidations. `@krantho/server-next/cache-handler` uses it; `next.config.ts` sets that handler when `cache.shared` is `database` (see [Rendering modes](/docs/rendering-modes)). The SQLite and Postgres packages implement it.

```ts
interface IPageCacheStore {
  get(key: string): Promise<PageCacheEntry | null>      // { value, tags, lastModified }
  set(key: string, value: PageCacheValue, tags: readonly string[]): Promise<void>
  tagsRevalidatedSince(tags: readonly string[], since: number): Promise<PageCacheTagState> // 'fresh' | 'stale' | 'expired'
  markTags(tags: readonly string[], options: { expire: boolean }): Promise<void>
  countTagged(tags: readonly string[]): Promise<number>
}
```

- `set` is an upsert. It replaces an entry's value and tags, and stamps `lastModified` from the store's clock (the database server's clock on Postgres), so instances with skewed clocks still agree.
- `markTags` marks tags stale, or with `expire: true` expired, as of now. A mark never moves backwards.
- An entry whose tags were expired after it was written must not be served. One whose tags were only marked stale may be served while it is refreshed.
- A value is JSON data whose leaves may be binary (`Uint8Array`).
- `countTagged` counts the entries (pages and data) that carry any of the tags. The API's publish impact uses it to say how many cached entries a publish refreshes.

Open it with `openPageCacheStore()` from [@krantho/server](/docs/package-server#share-one-next-js-cache-across-instances).

## Lock adapter

`ILockAdapter` holds the editing locks, one per document and locale. The SQLite and Postgres packages implement it; the filesystem adapter has no locks.

```ts
interface ILockAdapter {
  getLock(collection: string, slug: string, locale: string): Promise<ContentLock | null>
  acquireLock(collection: string, slug: string, locale: string, lockedBy: string, expiresAt: string): Promise<void>
  releaseLock(collection: string, slug: string, locale: string): Promise<void>
  listLocks(): Promise<ContentLock[]> // every unexpired lock
}
```

A `ContentLock` has `collection`, `slug`, `locale`, `lockedBy`, `lockedAt` and `expiresAt`. The API refuses writes to a document while another user holds an unexpired lock on it — see [REST API](/docs/api#versions-locks-and-bulk-operations).

## Auth adapter

`IAuthAdapter` covers users, refresh tokens and per-collection permissions.

```ts
interface IAuthAdapter {
  createUser(data: CreateUserData): Promise<UserRecord>
  getUser(id: string): Promise<UserRecord | null>
  getUserByEmail(email: string): Promise<UserRecord | null>
  listUsers(): Promise<UserRecord[]>
  // ... refresh tokens, permissions
}
```

Roles: `admin`, `editor`, `viewer`.

## Implementing a custom adapter

```ts title="my-adapter.ts"
import type { IPersistenceAdapter } from '@krantho/persistence'

export class MyAdapter implements IPersistenceAdapter {
  async exists(slug: string) { /* ... */ }
  async read(slug: string) { /* ... */ }
  async getMetadata(slug: string) { /* ... */ }
  async listSlugs() { /* ... */ }
}
```

Any `IPersistenceAdapter` is a valid `IContentLoader`, so it plugs directly into the content engine:

```ts
import { ContentEngineFactory } from '@krantho/core'
import { MyAdapter } from './my-adapter'

const engine = ContentEngineFactory.create(new MyAdapter())
```

## Next steps

- Set up the server with a persistence provider: [@krantho/server](/docs/package-server)
- Define content schemas for validation: [@krantho/schema](/docs/package-schema)
- Add media: [Media](/docs/media)
