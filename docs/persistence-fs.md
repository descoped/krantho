# @krantho/persistence-fs

Filesystem implementation of `IPersistenceAdapter`. Reads and writes markdown content directly to disk, parsing YAML frontmatter into fields and rendering markdown to HTML on read. Suitable for local development and static-site builds.

## Context

The filesystem adapter is the simplest persistence backend. Content lives as `.md` files with YAML frontmatter -- the same format developers author in. There is no database, no migrations, and no version history. It implements `IPersistenceAdapter` so it can be used interchangeably with SQLite or Postgres adapters.

## Rationale

- **Zero infrastructure** -- no database process, no connection string. Content is files in a directory.
- **Direct editing** -- developers can create and edit content with any text editor or IDE.
- **Implements both interfaces** -- implements `IPersistenceAdapter` and `IContentLoader`, so it works with both the content engine and the persistence layer.
- **No version history** -- the filesystem is a flat store. Version tracking, locking, checkpoints, and other stateful features require a database adapter.
- **Markdown rendering on read** -- `getContent` parses frontmatter and renders HTML on every call, and `query` reads and parses every file of the collections it scans (rendering only for the `full` projection). This is acceptable for development but not for production query workloads.

## Architecture

The `FileSystemAdapter` (`filesystem.ts`; its `query` runs in `content-query.ts`) keeps each collection's documents in that collection's `directory` (`{directory}/{slug}.md`), and a collection without one in `contentPath`. It parses frontmatter with `gray-matter` and renders HTML and the `##` sections with `renderContent()` from `@krantho/core`, as the content import does. The server passes every collection's `directory` when it creates the adapter.

## API Reference

### `FileSystemAdapter`

Implements `IPersistenceAdapter` and `IContentLoader`.

```typescript
import { FileSystemAdapter } from '@krantho/persistence-fs'

const adapter = new FileSystemAdapter({
  contentPath: './content',
  defaultLocale: 'en',
  directories: new Map([['pages', './content/pages']]),
})
```

**Constructor config (`FileSystemAdapterOptions`):**

```typescript
interface FileSystemAdapterOptions {
  defaultLocale: string   // required: the locale of a file whose frontmatter declares none
  directories?: ReadonlyMap<string, string>  // each collection's directory, by collection name
  contentPath?: string    // a collection without a directory; defaults to 'content/pages'
  seoPath?: string        // defaults to 'content/seo'
  defaultStatus?: string  // defaults to 'published'
  dateOf?: (filePath: string) => string | undefined  // when each file last changed
}
```

`dateOf` dates a document (`meta.createdAt`, the page's publish date and the sitemap's `lastmod`) by its file's
path. `@krantho/server` passes each file's last git commit date, read once when the adapter opens. A file the
lookup does not know, or every file without the repository's full history (a shallow clone), takes its
modification time, which a fresh checkout sets to the checkout's time.

`defaultStatus` is the status given to a markdown file whose frontmatter declares none. A
deployment sets it through `content.defaultStatus.filesystem` in the krantho configuration
tree; `createKranthoHandler` passes the resolved value down.

**Content methods:**
- `exists(slug): Promise<boolean>` -- checks if `{contentPath}/{slug}.md` exists
- `read(slug): Promise<string>` -- returns raw file contents (frontmatter + body)
- `getMetadata(slug): Promise<{ size, lastModified }>` -- file stat information
- `listSlugs(directory?): Promise<string[]>` -- all `.md` filenames without extension
- `getContent(collection, slug, locale?): Promise<ContentDocument | null>` -- parses frontmatter into fields, renders the body to HTML and sections. A file holds one document, so the locale named does not select it
- `getPublished(collection, slug, locale?): Promise<ContentDocument | null>` -- the document when its status (frontmatter, or `defaultStatus`) is `published`, otherwise `null`
- `query(spec): Promise<QueryPage<P>>` -- the one list read (see [ContentQuery](persistence.md#contentquery)), in JavaScript over the files of the collections the adapter has a directory for (every such collection when `collections` is omitted). It reads and parses each file, then filters (`state`, `status`, `locale`, `match`), sorts (the requested `sort`, then `collection, slug, locale`) and pages (`limit`, `offset`, `hasMore`); a `meta` or `summary` projection drops the body after the read and saves no I/O. A file is one version, so `current` and `published` read the same files and `published` admits those whose status is `published`

With no version history, every document is version 1, and it is live exactly when its status is `published` (`liveVersion` is `1`, otherwise `null`). A file cannot hold changes ahead of what visitors see: a save to a published file is live at once. A frontmatter status other than `published` or `archived` reads as `draft`.

**Write methods:**
- `writeContent(data): Promise<void>` -- creates or overwrites a `.md` file with frontmatter + body. The frontmatter `status` follows `data.publication`: `publish` writes `published`, `unpublish` writes `draft`, `archive` writes `archived`, and a save (no `publication`) keeps the file's current status (`draft` for a new file)
- `deleteContent(collection, slug, locale?): Promise<void>` -- removes the `.md` file from disk

**Not supported** (no database backing):
- `listVersions` / `getVersion` / `restoreVersion` -- no version history
- `getRuntimeSchema` / `saveRuntimeSchema` -- no schema storage

### Re-exported Types

- `IPersistenceAdapter` from `@krantho/persistence`
- `PersistenceConfig` from `@krantho/persistence`

## Usage

### Basic Read/Write

```typescript
import { FileSystemAdapter } from '@krantho/persistence-fs'

const adapter = new FileSystemAdapter({ contentPath: './content/pages', defaultLocale: 'en' })

// Read a document
const doc = await adapter.getContent('pages', 'about')
console.log(doc?.fields.title)

// Save edited fields -- the file keeps its status; a published file is live at once
if (doc) {
  await adapter.writeContent({
    collection: 'pages',
    slug: 'about',
    fields: { ...doc.fields, description: 'Updated description' },
    body: doc.body,
  })
}

// List the published pages (meta and fields, no body)
const { items: pages } = await adapter.query({
  state: 'published',
  collections: ['pages'],
  projection: 'summary',
})
```

## Dependencies

### Runtime Dependencies

- `gray-matter` -- YAML frontmatter parsing and serialization
- `yaml` -- YAML utilities

### Workspace Dependencies

- `@krantho/core` -- `IContentLoader`, `ContentMetadata`, `splitFrontmatter`, `renderContent`
- `@krantho/persistence` -- `IPersistenceAdapter`, `PersistenceConfig`, `WriteContentData`, `ContentDocument`, `ContentStatus`, `DocumentMeta`, `ContentQuery`, `QueryPage`, `QueryProjection`
