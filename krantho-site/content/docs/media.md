---
title: Media
description: Upload images, organize them in folders, set crop regions and hotspots, and bind media to content fields.
area: guides
order: 20
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [installation, persistence]
next: [deploy-vercel]
related: [configuration, studio, api, package-media-local, package-media-vercel-blob, package-media-s3, package-media-gcs]
status: published
---

The media library lets you upload, organize and edit images in Studio. Media metadata — alt text, tags, folder, crop, hotspot — is versioned in your database, SQLite or Postgres. The file bytes go to a **file store** you pick: local disk, Vercel Blob, an S3-compatible bucket or Google Cloud Storage.

## Enable media

Media is on when `media.provider` is set, and off when it is not — there is no default store. Pick the store in `krantho.config.ts` and install its package:

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  media: {
    provider: 'local',
    local: { dir: 'public/uploads' }, // SvelteKit: 'static/uploads'
    maxFileSize: 50 * 1024 * 1024,
  },
})
```

```bash
pnpm add @krantho/media-local
```

The one-install packages (`@krantho/next`, `@krantho/sveltekit`, `@krantho/node`) already include `@krantho/media-local`; add any other store yourself.

The route file does not change: media is configuration, not wiring. The server loads the store's package when it starts. If the package is missing, or a required setting such as a bucket or token is, startup fails with a message naming it. Media needs SQLite or Postgres persistence.

## Choose a file store

The stores are alternatives, in no preferred order. Every setting has an environment variable, which wins over `krantho.config.ts`.

| Store | `media.provider` | Package | Needs from the host | Required settings |
|-------|------------------|---------|---------------------|-------------------|
| Local disk | `local` | `@krantho/media-local` | A persistent disk shared by every instance, served at a URL prefix | none |
| Vercel Blob | `vercel-blob` | `@krantho/media-vercel-blob` | A public Blob store | `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` |
| S3-compatible | `s3` | `@krantho/media-s3` | A bucket with publicly readable objects | `KRANTHO_MEDIA_S3_BUCKET`, `KRANTHO_MEDIA_S3_REGION` |
| Google Cloud Storage | `gcs` | `@krantho/media-gcs` | A bucket with publicly readable objects | `KRANTHO_MEDIA_GCS_BUCKET` |

### Local disk

The local store writes to `media.local.dir` (`KRANTHO_MEDIA_LOCAL_DIR`, default `public/uploads`) and returns URLs under `media.local.urlPrefix` (`KRANTHO_MEDIA_LOCAL_URL_PREFIX`, default `/uploads`), which your framework serves. It suits development and a single server with a volume — not serverless functions, whose filesystems are read-only and per instance. A framework that copies `public/` or `static/` at build time may not serve files uploaded after the build at `urlPrefix`; the image endpoint reads the file from disk itself, so `/api/media/:id/image` URLs work either way.

### Vercel Blob

The Blob store writes public blobs with the store's read-write token, passed explicitly — krantho does not read `BLOB_READ_WRITE_TOKEN`. Create the store with public access. See [Deploy to Vercel](/docs/deploy-vercel#media).

### S3-compatible

The S3 store covers AWS S3, Cloudflare R2 and MinIO:

```bash title=".env"
# AWS S3 — the public URL is derived; credentials from the default chain (IAM role) unless set
KRANTHO_MEDIA_PROVIDER=s3
KRANTHO_MEDIA_S3_BUCKET=my-site-media
KRANTHO_MEDIA_S3_REGION=eu-north-1

# Cloudflare R2
KRANTHO_MEDIA_S3_REGION=auto
KRANTHO_MEDIA_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
KRANTHO_MEDIA_S3_PUBLIC_URL=https://media.example.com
KRANTHO_MEDIA_S3_ACCESS_KEY_ID=...
KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY=...

# MinIO
KRANTHO_MEDIA_S3_ENDPOINT=http://localhost:9000
KRANTHO_MEDIA_S3_FORCE_PATH_STYLE=true
KRANTHO_MEDIA_S3_PUBLIC_URL=http://localhost:9000/media
```

With an `endpoint`, the public URL is required. The access key pair is set together or not at all; without it, the AWS SDK's default credential chain applies (environment, shared files, ECS task role, web identity, EC2 metadata). The credentials need `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on the bucket's objects.

### Google Cloud Storage

The GCS store needs only the bucket on Cloud Run, GKE or Compute Engine, where it gets its token from the metadata server. Elsewhere, set `KRANTHO_MEDIA_GCS_CREDENTIALS` to a service-account key JSON, or `KRANTHO_MEDIA_GCS_CREDENTIALS_FILE` to the key file. The public URL defaults to `https://storage.googleapis.com/<bucket>`. The service account needs to create, read and delete objects in the bucket; the Storage Object User role (`roles/storage.objectUser`) covers it. The store calls the Cloud Storage JSON API with plain `fetch`, so it installs no Google SDK.

### Public objects

Objects must be publicly readable at their URL — through a bucket policy, public access, or a CDN in front with the public URL set to it. Private buckets and signed URLs are not supported.

## Upload images

### From Studio

Open **Media** in Studio's navigation. Drop files on the drop zone, or click **Choose files**. The library accepts JPEG, PNG, GIF, WebP, AVIF and SVG.

### From the API

```ts
// Upload with multipart/form-data
const formData = new FormData()
formData.append('file', imageFile)

const response = await fetch('/api/media/upload', {
  method: 'POST',
  body: formData,
})
const item = await response.json()
// item.id — UUID
// item.url — the public URL the file store returned, e.g. '/uploads/1712345678901-3f2a9c1b-hero-banner.jpg'
// item.width, item.height — read from the image header
```

Every file is stored under a fresh key that is never reused. The upload takes the file only; set alt text, tags and folder afterwards with `PUT /api/media/:id`.

Image dimensions are detected from PNG, JPEG, GIF and WebP headers, with no external image library.

### Register a file hosted elsewhere

`POST /api/media/register` adds an item for a file that already lives at an absolute `http(s)` URL, with a JSON body of `filename`, `url`, `mimeType` and `size` (and optionally `width`, `height` and `altText`). The file store never holds it: the image endpoint fetches the URL to render variants, and a delete removes only the record.

## Organize with folders

Create folders in the media library to group related images. Folders nest.

In Studio, the folder list beside the media grid has **New folder**, **Rename folder** and **Delete folder**; a folder that holds files cannot be deleted. Drag a file onto a folder to move it, or choose its folder in the file's details.

From the API:

```ts
// Create a folder
const folder = await fetch('/api/media/folders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Product Photos', parentId: null }),
}).then((response) => response.json())

// Move an item to a folder (folderId: null moves it to the root)
await fetch(`/api/media/${item.id}/move`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ folderId: folder.id }),
})
```

## Set crop and hotspot

The image editor (**Crop & hotspot** in a file's details, at `/studio/media/:id/edit`) lets you define two regions:

- **Crop** — a rectangular region (x, y, width, height as percentages) that defines the visible area.
- **Hotspot** — a center point (x, y) with an ellipse (width, height), all as percentages, that marks the focal point for cropping to other aspect ratios.

When your frontend renders an image at different aspect ratios — a square thumbnail, a wide banner, a tall portrait — the hotspot keeps the important part of the image visible.

### Save crop and hotspot from the API

```ts
await fetch(`/api/media/${itemId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    crop: { x: 0, y: 10, width: 100, height: 80 },
    hotspot: { x: 50, y: 30, width: 20, height: 20 },
  }),
})
```

All coordinates are percentages (0–100), so they are independent of resolution.

## Bind media to content fields

Mark a field as a media picker in your schema with `.describe('media')` on a Zod string:

```ts title="krantho.collections.ts"
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

export const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: 'content/pages',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    'hero-image': z.string().describe('media').optional(),
    'og-image': z.string().describe('media').optional(),
  }),
})
```

The Studio editor sees `describe('media')` and renders a media picker instead of a plain text input. The field stores the media item's ID. Render it through the image endpoint, which follows a replace:

```tsx
<img src={`/api/media/${mediaId}/image?preset=lg`} alt="" />
```

To put an image in a page body, open it in the media drawer and click **Copy markdown**. It copies `![<alt text>](/api/media/<id>/image?preset=xl)`, ready to paste into the markdown editor.

## Use the image optimizer

When media is enabled, the server serves optimized variants at `/api/media/:id/image`. Sizes are fixed presets rather than arbitrary dimensions, so the cache stays bounded:

```text
GET /api/media/:id/image?preset=lg&fmt=webp&aspect=16:9
```

| Parameter | Purpose | Default |
|-----------|---------|---------|
| `preset` | `xs`, `sm`, `md`, `lg`, `xl` or `full` — widths come from `media.image.presets` | `md` |
| `w` | A pixel width, mapped to a preset (`xs` up to 64, `sm` up to 160, `md` up to 384, `lg` up to 768, `xl` above); wins over `preset` | — |
| `fmt` | `avif`, `webp`, `jpeg` or `png` | Negotiated from the `Accept` header, else `avif` |
| `aspect` | Crop to an aspect ratio such as `16:9`, centered on the hotspot when one is set | Original |

A stored crop is applied unless a hotspot and `aspect` are both in play; then the hotspot decides the crop. Encoder quality per format is `media.image.quality`. SVGs are served as they are unless `fmt` asks for a raster format. `GET /api/media/:id/image/info` returns the image metadata.

### Fresh after a replace, cached everywhere else

The URL you embed is the **stable URL** — no `rev`. It never serves bytes: it answers `302` with `Cache-Control: no-cache` to a **versioned URL** that pins the variant and the image's current revision:

```text
GET /api/media/<id>/image?preset=xl
302 Location: /api/media/<id>/image?preset=xl&fmt=avif&rev=3f9c0a1b2d4e
```

The versioned URL is served with `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable` and an `ETag`, so browsers and any CDN keep it for a year. The revision changes when the file is replaced or its crop or hotspot changes — not on alt text, tags, folder or rename edits. So:

- the page view after a replace follows the redirect to the new revision, with no CDN purge;
- an unchanged image keeps its versioned URL and stays cached;
- the format is negotiated from `Accept` only on the uncached redirect, so the cached response is correct even behind CDNs that ignore `Vary`.

Each image view costs one small request to your API for the redirect. A stale `rev` redirects to the current one.

Optimized variants are cached in memory, per server instance. The limits are the `media.image.cache` leaves of the configuration, so they can be set in `krantho.config.ts` or from the environment:

| Variable | Default | Purpose |
|----------|---------|---------|
| `KRANTHO_IMAGE_CACHE_MAX_ENTRIES` | 1000 | Maximum cached variants |
| `KRANTHO_IMAGE_CACHE_MAX_MB` | 256 | Maximum cache memory |
| `KRANTHO_IMAGE_CACHE_TTI_SECS` | 3600 | Time-to-idle per entry |

## Manage metadata

Every metadata update creates a new version. Previous versions are kept.

```ts
// Update alt text, tags and folder
await fetch(`/api/media/${itemId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    altText: 'Mountain landscape at sunset',
    tags: ['hero', 'landscape'],
    folder: folderId,
  }),
})
```

### Bulk operations

```ts
// Delete several items
await fetch('/api/media/bulk', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ids: [id1, id2, id3] }),
})
```

In Studio, **Bulk select** on the media grid selects files across pages, and **Delete** removes them after a confirmation. Bulk select's **Delete** is for admins; an editor deletes one file at a time from its details.

## Replace and duplicate

Replace the file of an existing item while keeping its ID, alt text, tags and folder (crop and hotspot reset):

```ts
const formData = new FormData()
formData.append('file', newFile)

await fetch(`/api/media/${itemId}/replace`, {
  method: 'POST',
  body: formData,
})
// The new file gets a new key and URL; the old object is deleted from the store
```

Content that holds the old file URL — an `og-image` field, a link in a body — is rewritten to the new one. Images embedded through `/api/media/:id/image` need no rewrite: the stable URL follows the replace.

Duplicate an item with a new ID (the file is copied to a new key):

```ts
await fetch(`/api/media/${itemId}/duplicate`, { method: 'POST' })
```

A delete removes the file from the store too. Restoring a checkpoint rewinds the media records but not the store, so it can bring back an item whose file a later replace or delete removed; its image then answers 404.

## Limits

- **Vercel Functions** reject request bodies over 4.5 MB before krantho sees them. On Vercel, set `KRANTHO_MEDIA_MAX_SIZE=4194304` (4 MiB) so Studio reports oversized files itself. Uploads always go through the API.
- **Google Cloud Storage** objects get Cloud Storage's default cache lifetime on their raw URL; images served through the image endpoint carry their own.
- **SVG** files are served from the site's origin as uploaded, so upload only SVGs you trust — or leave `image/svg+xml` out of `KRANTHO_MEDIA_ALLOWED_MIME_TYPES`.
- **Old SQLite development databases**, created before media moved into the persistence packages, fail the media table migration. Delete the data directory (`.krantho/` by default) and restart.

## Environment variables

Every scalar and list `media` setting can be set from the environment, which wins over `krantho.config.ts`:

| Variable | Overrides | Default |
|----------|-----------|---------|
| `KRANTHO_MEDIA_PROVIDER` | `media.provider` | unset (media off) |
| `KRANTHO_MEDIA_LOCAL_DIR` | `media.local.dir` | `public/uploads` |
| `KRANTHO_MEDIA_LOCAL_URL_PREFIX` | `media.local.urlPrefix` | `/uploads` |
| `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` | `media.vercelBlob.token` | unset |
| `KRANTHO_MEDIA_S3_BUCKET`, `_REGION`, `_ENDPOINT`, `_FORCE_PATH_STYLE`, `_PUBLIC_URL`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | `media.s3.*` | see above |
| `KRANTHO_MEDIA_GCS_BUCKET`, `_PUBLIC_URL`, `_CREDENTIALS` | `media.gcs.*` | see above |
| `KRANTHO_MEDIA_MAX_SIZE` | `media.maxFileSize` | `10485760` (10 MiB) |
| `KRANTHO_MEDIA_ALLOWED_MIME_TYPES` | `media.allowedMimeTypes` | JPEG, PNG, GIF, WebP, AVIF, SVG |

Secrets — the Blob token, the S3 secret key, the GCS credentials — also accept a `_FILE` suffix naming a file to read. The image pipeline under `media.image.*` follows the same rule, except `media.image.presets`, which is structured and set in code only. See [Configuration](/docs/configuration) for the full list.
