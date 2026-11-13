---
title: Persistence
description: Choose where content lives — SQLite, Postgres or the filesystem — and work with migrations, capability predicates, version history, locks and checkpoints.
area: concepts
order: 50
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [content-model]
next: [media, deploy-vercel]
related: [configuration, rendering-modes, package-persistence]
status: published
---

All content storage in krantho goes through one interface, `IPersistenceAdapter`. You choose where content lives in the `persistence` section of `krantho.config.ts`, and the server creates the adapter for you. Without a `persistence` section, content lives in SQLite.

## Choose a provider

SQLite needs no setup, Postgres suits production and several instances, and the filesystem provider serves markdown files straight from disk.

### SQLite (default)

The default database: full create, read, update and delete, version history, runtime schema, checkpoints, locking, users, SEO configuration, the media library and webhooks. There is no database server to run — the database is one file, opened in WAL mode. It suits development and a site served from one machine.

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

// No persistence section: SQLite at .krantho/content.db
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
})
```

Or choose the file:

```ts title="krantho.config.ts"
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  persistence: {
    provider: 'sqlite',
    sqlite: { path: './data/content.db' },
  },
})
```

### Postgres (production)

The production store. Content, versions, locks, users, settings, SEO configuration, checkpoints, the media library, webhook deliveries and the shared Next.js page cache all work on Postgres as they do on SQLite. Use it when several instances serve one site, on serverless hosts, or with a managed database.

Add the adapter and its driver to the app that runs krantho. Both are optional dependencies, so an app on SQLite never installs them:

```bash
pnpm add @krantho/persistence-postgres postgres
```

```ts title="krantho.config.ts"
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  persistence: { provider: 'postgres' }, // the URL comes from KRANTHO_PERSISTENCE_POSTGRES_URL
})
```

The connection URL is a secret, so it belongs in the environment. The pool is tuned by environment too:

| Variable | Default | Purpose |
|----------|---------|---------|
| `KRANTHO_PERSISTENCE_POSTGRES_URL` | unset (required) | The connection string |
| `KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS` | the driver's 10 | Pool size per process; keep it small on serverless |
| `KRANTHO_PERSISTENCE_POSTGRES_PREPARE` | the driver's (on) | Set `false` behind a transaction pooler such as PgBouncer or a pooled Neon URL |
| `KRANTHO_PERSISTENCE_POSTGRES_IDLE_TIMEOUT_SEC` | unset (idle connections stay open) | Seconds before an idle connection closes |

Every persistence setting has an environment variable — see the [configuration reference](/docs/configuration).

### Filesystem (development)

Reads the `.md` files themselves. Suits development and content that lives only in your repository.

```ts title="krantho.config.ts"
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  persistence: {
    provider: 'filesystem',
    filesystem: { contentPath: 'content/pages' },
  },
})
```

The filesystem adapter reads, lists and writes each collection's markdown files in that collection's `directory`, and a collection without one in `contentPath` (default: `paths.contentDir`, `content`): a write replaces the file and a delete removes it, with no version history. It has no database, so there are no checkpoints, content locks, runtime schema, users, SEO configuration storage, media library or shared page cache. A file is published when its `status` is `published`, which is the default for a file that omits it (`content.defaultStatus.filesystem`). A document is dated by its file's last git commit, so a page's publish date and its sitemap `lastmod` stay the same from one checkout to the next. Without the repository's history (a shallow clone), it takes the file's modification time. The pages' structured data comes from the `seo` section of the configuration, held in memory. With no history, a file cannot hold changes ahead of what visitors see: each document is version 1, and a save to a published file is live at once.

### The route stays the same

The API route carries the wiring, not the configuration, so it is the same whichever provider you choose:

```ts title="app/api/[...path]/route.ts"
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiRouteHandlers({ config, collections })
```

## Seed content and the database

With SQLite or Postgres, the markdown files of your `filesystem` collections are seed content. When the server opens an empty database, it imports every file that passes its collection's schema; a file that fails is skipped with a warning naming the field. From then on the database holds the content, and editors change it in Studio.

A `content/manifest.json` — a version number and the checksum of each file, written at build time by `generateManifest` from `@krantho/server` — lets a later deploy bring new and changed files in. When its version is higher than the one the database last imported, the server compares each file with its document and imports the new files and the changed ones. A document an editor has changed in Studio keeps the editor's version; when its file changed too, the server records a conflict. A document deleted in Studio stays deleted. A file removed from the repository deletes its document, unless an editor changed it in Studio. The server takes a checkpoint before it imports into, or deletes from, a database that already holds content. In development, `content.watch` (`KRANTHO_CONTENT_WATCH=true`) syncs file changes into the database without a restart.

## Schema migrations

The database schema migrates itself. When the server opens the database — on the first request to the API route, to a page reading through the content loader, or to the shared Next.js cache handler — the adapter applies every pending migration before it answers. There is no separate migrate command.

- **Once, however many start together.** Pending migrations run in one transaction under a lock — SQLite's write lock, a Postgres advisory lock — so processes or instances that open the database at the same moment wait for each other, and each migration is applied once. A failed run rolls back as a whole, and the next request tries again.
- **Checksummed.** If a migration already applied to the database differs from the same migration in the running krantho, the database fails to open with a checksum mismatch.
- **The build opens no database** when your page routes have the cached shape (see [Rendering modes](/docs/rendering-modes#cached-until-changed-isr)). A route the build prerenders that reads content makes the build open, and migrate, the database.

## Check adapter capabilities

Not every adapter supports every operation: the filesystem adapter writes files but keeps no version history or runtime schema. Instead of checking for missing methods, use the type-narrowing predicates:

```ts
import {
  canQuery,
  canReadPublished,
  canWriteContent,
  hasRuntimeSchema,
  hasVersioning,
} from '@krantho/persistence'

if (canWriteContent(adapter)) {
  // TypeScript knows writeContent and deleteContent exist
  await adapter.writeContent({
    collection: 'pages',
    slug: 'home',
    fields: { title: 'Home' },
    body: 'Welcome.',
  })
}

if (canQuery(adapter)) {
  // TypeScript knows query exists
  const { items, hasMore } = await adapter.query({
    state: 'current',
    collections: ['pages'],
    projection: 'summary',
    status: 'published',
    sort: 'created_at:desc',
    limit: 10,
  })
}

if (hasVersioning(adapter)) {
  // TypeScript knows listVersions, getVersion and restoreVersion exist
  const versions = await adapter.listVersions('pages', 'home')
}

if (hasRuntimeSchema(adapter)) {
  // TypeScript knows getRuntimeSchema and saveRuntimeSchema exist
  const schema = await adapter.getRuntimeSchema('pages')
}
```

Each predicate narrows the adapter to a branded type, so TypeScript enforces correct use at compile time. `canGetContent` narrows the same way for single reads.

`query` is the one read behind every list. You say what you want of each document with `projection` (`'meta'`, `'summary'` for meta and fields, or `'full'`), which versions (`state: 'current'` or `'published'`), and optionally `collections`, `locale`, `status`, a `match` on the slug, fields or body, a `sort` and a page (`limit`, `offset`). It answers `{ items, hasMore }`: with a `limit` the adapter reads one row more than asked for and `hasMore` says whether it came back, so there is no total. Items are ordered by `sort`, then by collection, slug and locale, so pages neither skip nor repeat a document. A sort on a field puts documents without it first, then numbers in numeric order, then text, on every adapter; `:desc` reverses that. A `match` is a case-insensitive substring; an item whose body or fields contain it carries a `snippet` of the text around the first match, and an item that matched only on its slug has none. Ask for the smallest projection your list shows: a `'meta'` or `'summary'` query on SQLite and Postgres never returns the body, and reads it only to search it when the `match` includes the body.

A `writeContent()` without `publication` is a save: it leaves what visitors see as it is. Pass `publication` to change that in the same write — `'publish'` makes the written version live, `'unpublish'` and `'archive'` take the document offline:

```ts
await adapter.writeContent({
  collection: 'pages',
  slug: 'home',
  locale: 'en',
  fields: { title: 'Home' },
  body: 'Welcome.',
  publication: 'publish',
})
```

A write addresses one document by collection, slug and locale. To change only some fields, read the document, merge your values into its `fields`, and write it back with its `body`. The REST API's update does this for you when you send no `body`.

## Version history

The database adapters (SQLite, Postgres) keep an append-only history:

- Every `writeContent()` call creates a new version, a publish or unpublish included, so the history shows who changed what visitors see and when.
- `deleteContent()` creates a tombstone version, a soft delete.
- `restoreVersion()` creates a new version from a historical one. It is a save: the live version stays as it was.
- A version never changes once written.

```ts
if (hasVersioning(adapter)) {
  // Every version, newest first
  const versions = await adapter.listVersions('pages', 'home')

  // One historical version
  const oldVersion = await adapter.getVersion('pages', 'home', 3)

  // Restore version 3, as a new version
  await adapter.restoreVersion('pages', 'home', 3, 'admin@example.com')
}
```

Studio shows the history with a diff view and one-click restore.

### Published and current versions

A document has a current version, its newest, which is what Studio edits, and at most one live version, which is what visitors see. A save appends a new current version and keeps the live one. Publishing makes the current version live; unpublishing, archiving or deleting takes the page offline.

Each version records the document's live version as of that version, and `meta.liveVersion` carries it: equal to `meta.version` when visitors see the current version, lower when the current version has unpublished changes, `null` when nothing is live. `meta.status` follows from it — `published` while a version is live, `draft` when none is, `archived` for an archived document — and so does a `status` field the collection declares (for an archived document, `archived` when the schema allows that value, otherwise `draft`). `currentIsLive(meta)` from `@krantho/persistence` tells you whether visitors see the current version.

Importing a markdown file is the one write whose content decides whether it is live: a file whose `status` is `published` is published by its import, any other is not.

Pages read the live version with `getPublished` and a `published` query:

```ts
if (canReadPublished(adapter)) {
  const live = await adapter.getPublished('pages', 'home') // null when nothing is live
  const { items: pages } = await adapter.query({
    state: 'published',
    collections: ['pages'],
    projection: 'full',
  })
}
```

## Content locking

Advisory locks keep two editors from overwriting each other:

```ts
// Studio takes a lock when it opens the editor
await lockAdapter.acquireLock('pages', 'home', 'en', 'user@example.com', expiresAt)

// Who holds the lock, if anyone
const lock = await lockAdapter.getLock('pages', 'home', 'en')
if (lock) {
  console.log(`Locked by ${lock.lockedBy} at ${lock.lockedAt}`)
}

// Release it when editing is done
await lockAdapter.releaseLock('pages', 'home', 'en')

// Every unexpired lock
const locks = await lockAdapter.listLocks()
```

Studio handles locking for you: it takes a lock on edit, sends a heartbeat every 2 minutes, and releases the lock when the editor navigates away. A lock Studio takes expires after `content.lock.leaseMs` (5 minutes by default) without a heartbeat.

The API enforces the lock. While another user holds an unexpired lock on a document, saving, publishing, unpublishing, archiving, restoring and deleting it answer `423` with `lockedBy` and `expiresAt`. An editor can release only their own lock; an admin can release anyone's. See [REST API](/docs/api#versions-locks-and-bulk-operations).

## Checkpoints

Checkpoints give point-in-time restore for the whole database:

```ts
// Before a risky operation
await checkpointAdapter.createCheckpoint('before-bulk-import', 'manual')

// The checkpoints you can return to
const checkpoints = await checkpointAdapter.listCheckpoints()

// Restore one
await checkpointAdapter.restoreCheckpoint(checkpoints[0].version)
```

A checkpoint is also created automatically before a checkpoint restore, before a content bundle import, and before content files are migrated from a newer content manifest. Studio manages checkpoints under **Setup › Checkpoints**.

## Write a custom adapter

Implement `IPersistenceAdapter` from `@krantho/persistence`, starting with the required methods:

```ts title="my-adapter.ts"
import type { ContentMetadata } from '@krantho/core'
import type { IPersistenceAdapter } from '@krantho/persistence'

export class MyAdapter implements IPersistenceAdapter {
  async exists(slug: string): Promise<boolean> { /* ... */ }
  async read(slug: string): Promise<string> { /* ... */ }
  async getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>> { /* ... */ }
  async listSlugs(): Promise<string[]> { /* ... */ }
}
```

The `persistence.provider` setting selects one of the built-in backends — `sqlite`, `postgres` or `filesystem`. A custom adapter plugs straight into the content engine:

```ts
import { ContentEngineFactory } from '@krantho/core'

const engine = ContentEngineFactory.create(new MyAdapter())
```

Add the optional methods (`writeContent`, `query`, `listVersions` and the rest) one at a time for full Studio support.
