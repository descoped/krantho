# @krantho/media-vercel-blob

Media file store on Vercel Blob. Implements `IFileStore` from `@krantho/persistence` over `@vercel/blob`, writing each media file as a public blob.

## Context

krantho keeps media metadata and folders in the configured database and the file bytes in a file store picked by `media.provider` (see [guides/media.md](guides/media.md)). `@krantho/media-vercel-blob` is the store for `media.provider: 'vercel-blob'`. It suits sites on Vercel, whose functions have no persistent disk, and works from any other host too. `@krantho/server` loads it when that provider is set.

## Rationale

- **Public blobs only.** `MediaItem.url` is shown in Studio and stored in fields such as `og-image`, so every object must be readable at its URL. The store writes with `access: 'public'` and needs a public Blob store.
- **Never overwrite.** Keys are fresh and immutable, so writes pass `addRandomSuffix: false` and `allowOverwrite: false`: a collision is an error, not a silent replace.
- **One-year cache lifetime.** A key never changes content, so blobs are written with `cacheControlMaxAge: 31536000`.
- **Explicit token.** Every call passes `media.vercelBlob.token`. The SDK's `BLOB_READ_WRITE_TOKEN` fallback is never used, so the store needs no Vercel project connection and the token is managed like every other secret leaf.

## Architecture

```
vercel-blob-file-store.ts   VercelBlobFileStore -- IFileStore over put, get, copy, del
                            createVercelBlobFileStore(section) -- the factory @krantho/server calls
```

## API Reference

### `createVercelBlobFileStore(section: VercelBlobMediaSection): IFileStore`

Builds the store from the resolved `media.vercelBlob` section. Throws `media.vercelBlob.token: required when media.provider is "vercel-blob"` without a token (configuration validation reports the same earlier).

| Member | Behaviour |
|--------|-----------|
| `label` | `'Vercel Blob'` |
| `location` | `null` |
| `put(key, bytes, contentType)` | `put(key, body, { access: 'public', token, contentType, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 31536000 })`; the `url` is the blob URL Vercel returns |
| `get(key)` | `get(key, { access: 'public', token })`; `null` when the blob does not exist |
| `copy(fromKey, toKey, contentType)` | `copy()` with the same write options, content type included (Blob does not carry it over) |
| `delete(key)` | `del(key, { token })`; no error when the blob is already gone |

## Usage

```bash
pnpm add @krantho/media-vercel-blob
```

```bash
KRANTHO_MEDIA_PROVIDER=vercel-blob
KRANTHO_MEDIA_VERCEL_BLOB_TOKEN=vercel_blob_rw_...
KRANTHO_MEDIA_MAX_SIZE=4194304   # on Vercel: stay under the 4.5 MB function body limit
```

| Setting | Variable | Default |
|---------|----------|---------|
| `media.vercelBlob.token` | `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` (secret, `_FILE` accepted) | unset -- required |

Create the store with public access, preferably in the functions' region. On Vercel, uploads pass through a function, so cap `media.maxFileSize` below 4.5 MB -- see [guides/deploy-vercel.md](guides/deploy-vercel.md#media).

## Dependencies

### Runtime Dependencies

| Package | Purpose |
|---------|---------|
| `@vercel/blob` | `put`, `get`, `copy`, `del` |

### Workspace Dependencies

| Package | What's imported |
|---------|-----------------|
| `@krantho/config` | `VercelBlobMediaSection` |
| `@krantho/persistence` | `IFileStore`, `StoredFile` |
