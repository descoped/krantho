# @krantho/media-local

Media file store on local disk. Implements `IFileStore` from `@krantho/persistence`: it writes, reads, copies and deletes the bytes of uploaded media in one directory, which the host framework serves as static files.

## Context

krantho keeps media metadata and folders in the configured database and the file bytes in a file store picked by `media.provider` (see [guides/media.md](guides/media.md)). `@krantho/media-local` is the store for `media.provider: 'local'` -- local development, and a single server or container with a persistent volume. `@krantho/server` loads it when that provider is set; an app never constructs it itself.

## Rationale

- **Bytes only.** Metadata, versioning, folders, validation and key naming belong to `MediaLibrary` in `@krantho/api` and the SQL persistence packages. The store knows nothing about media items, so it has no database dependency.
- **Flat, guarded keys.** Keys must match `/^[a-z0-9][a-z0-9._-]*$/`: no separators, no leading dot. Anything else throws, so a key cannot escape the directory.
- **The host serves the files.** The store returns `<urlPrefix>/<key>` as the public URL and leaves serving to the framework's static-file handling (`public/` in Next.js and Vite, `static/` in SvelteKit).
- **Separate package.** Each store is an optional peer of `@krantho/server`, so an app installs only the store it uses.

## Architecture

```
local-file-store.ts   LocalFileStore -- IFileStore on node:fs/promises
                      createLocalFileStore(section) -- the factory @krantho/server calls
```

## API Reference

### `createLocalFileStore(section: LocalMediaSection): IFileStore`

Builds the store from the resolved `media.local` section.

| Field | Type | Description |
|-------|------|-------------|
| `dir` | `string` | Directory files are written to, resolved against the working directory. Created on the first write. |
| `urlPrefix` | `string` | URL prefix the host serves `dir` under. |

### `LocalFileStore`

| Member | Behaviour |
|--------|-----------|
| `label` | `'Local disk'` |
| `location` | `dir` -- shown in Studio's media settings |
| `put(key, bytes, contentType)` | Writes `<dir>/<key>`; returns `{ key, url: '<urlPrefix>/<key>' }` |
| `get(key)` | The file's bytes, or `null` when it does not exist |
| `copy(fromKey, toKey, contentType)` | Copies the file; returns the new key's `StoredFile` |
| `delete(key)` | Removes the file; no error when it is already gone |

## Usage

```bash
pnpm add @krantho/media-local
```

```typescript
// krantho.config.ts
export default defineKranthoConfig({
  media: { provider: 'local', local: { dir: 'public/uploads', urlPrefix: '/uploads' } },
})
```

| Setting | Variable | Default |
|---------|----------|---------|
| `media.local.dir` | `KRANTHO_MEDIA_LOCAL_DIR` | `public/uploads` |
| `media.local.urlPrefix` | `KRANTHO_MEDIA_LOCAL_URL_PREFIX` | `/uploads` |

SvelteKit apps set `dir: 'static/uploads'`. The directory must persist across restarts and be shared by every instance, so this store does not fit serverless functions -- use a remote store there.

## Dependencies

### Runtime Dependencies

None beyond Node.js built-ins (`node:fs/promises`, `node:path`).

### Workspace Dependencies

| Package | What's imported |
|---------|-----------------|
| `@krantho/config` | `LocalMediaSection` |
| `@krantho/persistence` | `IFileStore`, `StoredFile` |
