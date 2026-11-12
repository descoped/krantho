# @krantho/media-gcs

Media file store on Google Cloud Storage. Implements `IFileStore` from `@krantho/persistence` over the Cloud Storage JSON API with plain `fetch` and `node:crypto` -- no Google SDK.

## Context

krantho keeps media metadata and folders in the configured database and the file bytes in a file store picked by `media.provider` (see [guides/media.md](guides/media.md)). `@krantho/media-gcs` is the store for `media.provider: 'gcs'`. `@krantho/server` loads it when that provider is set.

## Rationale

- **Zero dependencies.** The store needs four HTTP calls (upload, download, copy, delete) and an access token. `@google-cloud/storage` and `google-auth-library` pull in a large dependency tree for that; the token flows are short and specified, so they are implemented directly.
- **Credentials from config, else the metadata server.** A service-account key in `media.gcs.credentials` is exchanged for tokens with the JWT-bearer flow. Without one, the store asks the metadata server of Cloud Run, GKE or Compute Engine for the attached service account's token -- a platform read, the deliberate exception to krantho's config-only environment rule. Tokens are reused until five minutes before they expire.
- **Public objects.** `MediaItem.url` is `<publicUrl>/<key>` and must be readable there. Private buckets and signed URLs are not supported.

## Architecture

```
gcs-file-store.ts   GcsFileStore -- IFileStore over the JSON API
                    createGcsFileStore(section) -- the factory @krantho/server calls
gcs-token.ts        createAccessTokenSource(credentials) -- service-account JWT or metadata-server
                    tokens, cached until shortly before expiry (internal)
```

## API Reference

### `createGcsFileStore(section: GcsMediaSection): IFileStore`

Builds the store from the resolved `media.gcs` section. Throws `<path>: required when media.provider is "gcs"` when `bucket` or `publicUrl` is missing (configuration validation reports a missing bucket earlier; `publicUrl` is derived from it). A `credentials` value that is not a service-account key JSON with `client_email` and `private_key` throws at startup.

| Member | Behaviour |
|--------|-----------|
| `label` | `'Google Cloud Storage'` |
| `location` | the bucket name |
| `put(key, bytes, contentType)` | Simple upload: `POST …/upload/storage/v1/b/<bucket>/o?uploadType=media&name=<key>` |
| `get(key)` | `GET …/o/<key>?alt=media`; `null` on 404 |
| `copy(fromKey, toKey, contentType)` | `POST …/o/<from>/copyTo/b/<bucket>/o/<to>` with the content type |
| `delete(key)` | `DELETE …/o/<key>`; a 404 is not an error |

Every request carries `Authorization: Bearer <token>` with the `devstorage.read_write` scope. A non-2xx answer throws with the operation, key and status.

## Usage

```bash
pnpm add @krantho/media-gcs
```

| Setting | Variable | Default |
|---------|----------|---------|
| `media.gcs.bucket` | `KRANTHO_MEDIA_GCS_BUCKET` | unset -- required |
| `media.gcs.publicUrl` | `KRANTHO_MEDIA_GCS_PUBLIC_URL` | `https://storage.googleapis.com/<bucket>` |
| `media.gcs.credentials` | `KRANTHO_MEDIA_GCS_CREDENTIALS` (secret) | unset (metadata server) |

`KRANTHO_MEDIA_GCS_CREDENTIALS_FILE` can name the key file instead of holding its JSON.

On Cloud Run, with the service's service account allowed to manage the bucket's objects (`roles/storage.objectUser`):

```bash
KRANTHO_MEDIA_PROVIDER=gcs
KRANTHO_MEDIA_GCS_BUCKET=my-site-media
```

Make the objects publicly readable (`allUsers` with `roles/storage.objectViewer` on the bucket), or put a CDN in front and set `publicUrl` to it.

The simple upload sets no `Cache-Control` on the object, so its raw URL gets Cloud Storage's default for public objects. Variants served through `/api/media/:id/image` carry their own immutable caching and are unaffected.

## Dependencies

### Runtime Dependencies

None beyond Node.js built-ins (`fetch`, `node:crypto`).

### Workspace Dependencies

| Package | What's imported |
|---------|-----------------|
| `@krantho/config` | `GcsMediaSection` |
| `@krantho/persistence` | `IFileStore`, `StoredFile` |
