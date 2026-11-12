# Media

How krantho stores media, how to pick and configure a file store for the host a site runs on, and how image URLs stay fresh after a replace while remaining cacheable behind any CDN.

## The model

Media is two things, stored in two places:

- **Metadata and folders** -- file name, alt text, tags, folder, crop, hotspot, dimensions -- live in the configured database, SQLite or Postgres, in the `media` and `media_folders` tables. They are versioned append-only like content, and behave the same on both databases.
- **File bytes** live in a **file store** chosen by `media.provider`: local disk, Vercel Blob, an S3-compatible bucket, or Google Cloud Storage. Each store is its own package, so an app installs only the SDK it uses.

`media.provider` has no default. Unset, media is off: the media routes are not registered and Studio hides the Media section. Set, media is on -- there is no separate switch. Media needs SQLite or Postgres; setting a provider with `persistence.provider: 'filesystem'` is a startup error.

```
Studio / API ──► MediaLibrary (@krantho/api)
                  ├── IMediaMetadataAdapter + IMediaFolderStorage ──► SQLite or Postgres
                  └── IFileStore ──► local disk | Vercel Blob | S3-compatible | Google Cloud Storage
```

`MediaLibrary` owns the rules: accepted MIME types (`media.allowedMimeTypes`), the upload size cap (`media.maxFileSize`), dimension detection, and object keys.

### Object keys and URLs

Every file gets a fresh key -- `<timestamp>-<random>-<slugified name>`, flat, never reused -- so an object's content never changes once written. The store returns the public `url` of the object at write time.

| Operation | Metadata | File store |
|-----------|----------|------------|
| Upload | inserts version 1 | writes a new key |
| Rename | appends a version with the new display name | nothing; key and `url` stay |
| Alt text, tags, folder, crop, hotspot | appends a version | nothing |
| Replace | appends a version pointing at the new key (crop and hotspot reset) | writes a new key, then deletes the old one |
| Duplicate | inserts a new item | copies the object to a new key |
| Delete | appends a tombstone | deletes the key |

A file written for an insert that then fails is deleted again. A replace also rewrites content that holds the old `url` -- such as an `og-image` field or a markdown link -- to the new one, since the old object is gone.

**Registered items** (`POST /api/media/register`) point at a file hosted elsewhere. They have no key: the `url` must be an absolute `http(s)` URL (anything else is a 400), the image endpoint fetches it to render variants, and a delete removes only the record.

## Choosing a store

The stores are alternatives, listed here in no preferred order. Pick the one that matches where the site runs.

| | Local disk | Vercel Blob | S3-compatible | Google Cloud Storage |
|---|---|---|---|---|
| `media.provider` | `local` | `vercel-blob` | `s3` | `gcs` |
| Package | `@krantho/media-local` | `@krantho/media-vercel-blob` | `@krantho/media-s3` | `@krantho/media-gcs` |
| SDK | none (`node:fs`) | `@vercel/blob` | `@aws-sdk/client-s3` | none (`fetch` + `node:crypto`) |
| Needs from the host | a persistent, writable disk shared by every instance, served at a URL prefix | a public Blob store and its read-write token | a bucket whose objects are publicly readable | a bucket whose objects are publicly readable |
| Required settings | none (defaults) | `media.vercelBlob.token` | `media.s3.bucket`, `media.s3.region` (+ `publicUrl` with an `endpoint`) | `media.gcs.bucket` |
| Credentials | -- | the token | key pair in config, else the AWS default chain | service-account key in config, else the GCP metadata server |
| Fits | local development, a single server or container with a volume | Vercel | AWS, Cloudflare R2, MinIO, any S3 API | Cloud Run, GKE, Compute Engine, any host with a key |

Add the store's package to the dependencies of the app that runs krantho. The server loads it with a literal dynamic import when `media.provider` names it; when it cannot be loaded, startup fails:

```
media.provider is "s3", but @krantho/media-s3 could not be loaded. Add it to the dependencies of the app that runs krantho.
```

A missing setting is reported with the other configuration problems at startup, naming the path and its variable:

```
media.s3.bucket: required when media.provider is "s3" (KRANTHO_MEDIA_S3_BUCKET)
```

Every setting below is a leaf of the configuration tree: set it in the `media` section of `krantho.config.ts` or from the environment, which wins. Secret leaves also accept a `_FILE` suffix naming a file to read the value from. The full list is in [configuration.md](../configuration.md#media-and-images).

### Local disk

Files are written to a directory; the host framework serves that directory as static files.

```typescript
// krantho.config.ts
media: { provider: 'local', local: { dir: 'public/uploads', urlPrefix: '/uploads' } }
```

| Setting | Variable | Default |
|---------|----------|---------|
| `media.local.dir` | `KRANTHO_MEDIA_LOCAL_DIR` | `public/uploads` |
| `media.local.urlPrefix` | `KRANTHO_MEDIA_LOCAL_URL_PREFIX` | `/uploads` |

- `dir` resolves against the working directory. Next.js and Vite apps use `public/uploads`; SvelteKit uses `static/uploads`.
- An item's `url` is `<urlPrefix>/<key>`, so `urlPrefix` must be where the host serves `dir`. A framework that copies `public/` or `static/` at build time may not serve files added after the build; the image endpoint reads the file from disk itself, so `/api/media/:id/image` URLs work either way.
- The disk must survive restarts and be shared by every instance. That rules out serverless functions (read-only, per-instance filesystems) -- use a remote store there.

### Vercel Blob

Files are written to a Vercel Blob store as public blobs, with a one-year cache lifetime.

```typescript
media: { provider: 'vercel-blob' } // token from KRANTHO_MEDIA_VERCEL_BLOB_TOKEN
```

| Setting | Variable | Default |
|---------|----------|---------|
| `media.vercelBlob.token` | `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` (secret) | unset -- required |

- Create the store with **public** access. krantho writes public blobs only (`access: 'public'`); private stores are not supported.
- The token is passed explicitly on every call, so krantho never reads `BLOB_READ_WRITE_TOKEN` and the store needs no project connection.
- The store works from any host, not only Vercel.
- On Vercel, cap uploads below the function body limit -- see [Limits](#limits) and [deploy-vercel.md](deploy-vercel.md#media).

### S3-compatible (AWS S3, Cloudflare R2, MinIO)

Files are written with `PutObject` and `Cache-Control: public, max-age=31536000, immutable`.

| Setting | Variable | Default |
|---------|----------|---------|
| `media.s3.bucket` | `KRANTHO_MEDIA_S3_BUCKET` | unset -- required |
| `media.s3.region` | `KRANTHO_MEDIA_S3_REGION` | unset -- required |
| `media.s3.endpoint` | `KRANTHO_MEDIA_S3_ENDPOINT` | unset (AWS) |
| `media.s3.forcePathStyle` | `KRANTHO_MEDIA_S3_FORCE_PATH_STYLE` | `false` |
| `media.s3.publicUrl` | `KRANTHO_MEDIA_S3_PUBLIC_URL` | `https://<bucket>.s3.<region>.amazonaws.com` when `endpoint` is unset |
| `media.s3.accessKeyId` | `KRANTHO_MEDIA_S3_ACCESS_KEY_ID` | unset (default chain) |
| `media.s3.secretAccessKey` | `KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY` (secret) | unset (default chain) |

An item's `url` is `<publicUrl>/<key>`. The two keys are set together or not at all. The credentials need `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on the bucket's objects.

**AWS S3** -- set `bucket` and `region`; `publicUrl` is derived. Make the objects publicly readable with a bucket policy granting `s3:GetObject` (which needs the bucket's Block Public Access settings to allow it), or put CloudFront in front and set `publicUrl` to its domain.

```bash
KRANTHO_MEDIA_PROVIDER=s3
KRANTHO_MEDIA_S3_BUCKET=my-site-media
KRANTHO_MEDIA_S3_REGION=eu-north-1
```

**Cloudflare R2** -- `region` is `auto`, `endpoint` is the account's S3 endpoint, and `publicUrl` is the bucket's public domain (a custom domain or the `r2.dev` URL). Use an R2 API token's access key pair.

```bash
KRANTHO_MEDIA_PROVIDER=s3
KRANTHO_MEDIA_S3_BUCKET=my-site-media
KRANTHO_MEDIA_S3_REGION=auto
KRANTHO_MEDIA_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
KRANTHO_MEDIA_S3_PUBLIC_URL=https://media.example.com
KRANTHO_MEDIA_S3_ACCESS_KEY_ID=...
KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY=...
```

**MinIO** -- MinIO addresses buckets by path, so set `forcePathStyle`. Give the bucket an anonymous download policy (`mc anonymous set download <alias>/<bucket>`).

```bash
KRANTHO_MEDIA_PROVIDER=s3
KRANTHO_MEDIA_S3_BUCKET=media
KRANTHO_MEDIA_S3_REGION=us-east-1
KRANTHO_MEDIA_S3_ENDPOINT=http://localhost:9000
KRANTHO_MEDIA_S3_FORCE_PATH_STYLE=true
KRANTHO_MEDIA_S3_PUBLIC_URL=http://localhost:9000/media
KRANTHO_MEDIA_S3_ACCESS_KEY_ID=...
KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY=...
```

With an `endpoint`, `publicUrl` is required: krantho cannot guess where a non-AWS service serves objects.

### Google Cloud Storage

Files are written through the Cloud Storage JSON API with plain `fetch` -- no Google SDK.

| Setting | Variable | Default |
|---------|----------|---------|
| `media.gcs.bucket` | `KRANTHO_MEDIA_GCS_BUCKET` | unset -- required |
| `media.gcs.publicUrl` | `KRANTHO_MEDIA_GCS_PUBLIC_URL` | `https://storage.googleapis.com/<bucket>` |
| `media.gcs.credentials` | `KRANTHO_MEDIA_GCS_CREDENTIALS` (secret) | unset (metadata server) |

- `credentials` is a service-account key JSON. `KRANTHO_MEDIA_GCS_CREDENTIALS_FILE` can point at the key file instead.
- Without it, the store asks the metadata server of Cloud Run, GKE (Workload Identity) or Compute Engine for the attached service account's token. Elsewhere, set `credentials`.
- The service account needs to create, read and delete objects in the bucket -- the Storage Object User role (`roles/storage.objectUser`) covers it.
- Make the objects publicly readable: grant `allUsers` the Storage Object Viewer role (`roles/storage.objectViewer`) on the bucket, or put a CDN in front and set `publicUrl` to it.

```bash
KRANTHO_MEDIA_PROVIDER=gcs
KRANTHO_MEDIA_GCS_BUCKET=my-site-media
```

### Credentials

Credentials come from configuration first. A store that gets none falls back to the platform's own identity:

- **S3**: the AWS SDK default credential chain -- environment variables, shared config files, ECS task role, web identity, EC2 instance metadata.
- **Google Cloud Storage**: the GCP metadata server.

These are reads by the SDK or the platform, not by krantho. They are a deliberate exception to "environment values reach package code only through `resolveConfig()`", next to `NODE_ENV`: workload identity is how these platforms hand out credentials, and a key copied into configuration would be worse.

### Public read

`MediaItem.url` is shown in Studio and stored in fields such as `og-image`, where crawlers fetch it directly. Every store therefore writes objects that must be publicly readable at `url` -- directly, or through `publicUrl`. Private buckets and signed URLs are not supported.

## Image URLs

Pages should embed the image endpoint, not the raw `url`:

```markdown
![Mountain at dawn](/api/media/<id>/image?preset=xl)
```

The media drawer's **Copy markdown** button copies exactly this, with the item's alt text. A field marked `.describe('media')` stores the item id; render it through the same endpoint.

The endpoint answers two kinds of URL:

1. **The stable URL** -- no `rev`. It resolves the variant (`w` maps to a preset, `fmt` is explicit or negotiated from `Accept`, an SVG is served as the original) and answers `302` to the versioned URL of the item's current revision, with `Cache-Control: no-cache` and `Vary: Accept`.
2. **The versioned URL** -- `?preset=xl&fmt=avif&rev=3f9c0a1b2d4e`. At the current revision it serves the bytes with `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable` and an `ETag`, and no `Vary`. A stale `rev` redirects to the current one.

The revision is a hash of the item's `url`, crop and hotspot. A replace, crop or hotspot change gives a new revision; alt text, tags, folder and rename edits do not.

Why this is safe behind any CDN, with no purge:

- **Every page view follows the redirect**, which is never cached, so the view after a replace lands on the new versioned URL. No CDN has to be told anything.
- **A versioned URL never changes content**, so any cache may keep it for a year. Unchanged images keep their URL and stay cached.
- **Format negotiation happens only on the uncached redirect.** The cached response does not depend on `Accept`, so it is correct even behind CDNs that ignore `Vary`.
- A page cached by `next-isr` embeds the stable URL, so a media change invalidates no page.

The price is one request to the API per image view for the redirect. Rendered variants are also cached in memory per instance (`media.image.cache.*`). See [api.md](../api.md#image-urls) for the parameters and headers.

## Limits

- **Vercel's request body limit.** A Vercel Function rejects a request body over 4.5 MB with `413 FUNCTION_PAYLOAD_TOO_LARGE` before krantho sees it, whatever the store. On Vercel, lower `media.maxFileSize` below that -- `KRANTHO_MEDIA_MAX_SIZE=4194304` (4 MiB) -- so krantho reports an oversized file itself. The response limit is the same, so a very large `preset=full` variant can hit it. Uploads always pass through the API; direct browser-to-store uploads are not supported.
- **Google Cloud Storage cache lifetime.** The simple upload sets no `Cache-Control` on the object, so the raw object `url` gets Cloud Storage's default for public objects. Variants served through the image endpoint are unaffected: they carry their own immutable caching.
- **Checkpoints and deleted files.** A replace or delete removes the superseded object for good. A checkpoint restore rewinds the metadata, not the file store, so it can bring back a record whose file is gone. Its image endpoint then answers `404 Original file not found`, and its raw `url` is dead. Replace the file, or delete the record.
- **SVG** is served from the site's origin as uploaded.

## Development databases

Media tables are created by the `v011-media` schema migration. A SQLite development database created before this layout -- when `@krantho/media-local` created its own `media` table -- fails that migration because the table already exists. Delete the data directory (`.krantho/` by default, `paths.dataDir`) and let the next start recreate it; files already in the upload directory are no longer referenced.
