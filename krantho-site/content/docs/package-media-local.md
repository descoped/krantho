---
title: "@krantho/media-local"
description: The media file store on local disk, for development and for single servers with a persistent volume.
area: reference
order: 104
level: intermediate
prerequisites: [media]
related: [package-media-vercel-blob, package-media-s3, package-media-gcs, package-studio, configuration]
status: published
---

The media file store for `media.provider: 'local'`. It writes the bytes of uploaded media into one directory, which your framework serves as static files. Metadata, versions and folders live in your database; this package only stores files.

## Install

> [!NOTE]
> Krantho is in active development and its packages are not on npm yet. The command below is the one the first release will use. To run krantho today, see [Project status](/docs/project-status).

```bash
pnpm add @krantho/media-local
```

## Configure

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  media: { provider: 'local', local: { dir: 'public/uploads', urlPrefix: '/uploads' } },
})
```

| Setting | Variable | Default |
|---------|----------|---------|
| `media.local.dir` | `KRANTHO_MEDIA_LOCAL_DIR` | `public/uploads` |
| `media.local.urlPrefix` | `KRANTHO_MEDIA_LOCAL_URL_PREFIX` | `/uploads` |

Next.js and Vite apps use `public/uploads`; SvelteKit apps use `static/uploads`. A file's URL is `<urlPrefix>/<key>`, so the prefix must be where your framework serves the directory. The image endpoint (`/api/media/:id/image`) reads the original through the store, not over HTTP.

> [!CAUTION]
> The directory must survive restarts and be shared by every instance. Serverless functions have read-only, per-instance filesystems: use [Vercel Blob](/docs/package-media-vercel-blob), [S3](/docs/package-media-s3) or [Google Cloud Storage](/docs/package-media-gcs) there.

## How it stores files

- Each file is written under a fresh, flat key such as `1712345678901-3f2a9c1b-hero-banner.jpg` (a millisecond timestamp, a random part and the file name). Keys are never reused, so a file never changes once written.
- Keys that contain a separator or start with a dot are rejected, so nothing can escape the directory.
- A replace writes a new file and deletes the old one; a delete removes the file.

You never construct the store yourself: the server loads it when `media.provider` is `local`. Media also needs SQLite or Postgres persistence, which keeps the metadata.

## Next steps

- Upload, organize and embed images: [Media](/docs/media)
- Manage media from Studio: [@krantho/studio](/docs/package-studio)
