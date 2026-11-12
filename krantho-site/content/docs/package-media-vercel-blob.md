---
title: "@krantho/media-vercel-blob"
description: The media file store on Vercel Blob, so uploads survive deploys on Vercel Functions.
area: reference
order: 106
level: intermediate
prerequisites: [media]
related: [deploy-vercel, package-media-local, package-media-s3, package-media-gcs, configuration]
status: published
---

The media file store for `media.provider: 'vercel-blob'`. It writes each uploaded file to a Vercel Blob store as a public blob with a one-year cache lifetime. It fits Vercel, whose functions have no persistent disk, and works from any other host too.

## Install

> [!NOTE]
> Krantho is in active development and its packages are not on npm yet. The command below is the one the first release will use. To run krantho today, see [Project status](/docs/project-status).

```bash
pnpm add @krantho/media-vercel-blob
```

## Configure

Create a Blob store with **public** access, then set:

```bash title=".env"
KRANTHO_MEDIA_PROVIDER=vercel-blob
KRANTHO_MEDIA_VERCEL_BLOB_TOKEN=vercel_blob_rw_...
KRANTHO_MEDIA_MAX_SIZE=4194304   # on Vercel, stay under the 4.5 MB function body limit
```

| Setting | Variable | Default |
|---------|----------|---------|
| `media.vercelBlob.token` | `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` (secret) | unset, required |

The token is passed explicitly on every call, so krantho does not read `BLOB_READ_WRITE_TOKEN` and the store needs no project connection. Like every secret, the token also accepts `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN_FILE`.

## How it stores files

- Blobs are written with `access: 'public'`, no random suffix and no overwrite: each key is fresh and never reused.
- A file's URL is the blob URL Vercel returns.
- A replace writes a new blob and deletes the old one; a delete removes the blob.

## How it is verified

krantho's tests check the calls the store makes through a mocked `@vercel/blob`. They do not run against a live Blob store. Before relying on it in production, upload, replace and delete one image on a staging deployment and open its URL.

## Next steps

- Everything specific to Vercel, including the upload cap and CDN caching: [Deploy to Vercel](/docs/deploy-vercel)
- The other stores and image URLs: [Media](/docs/media)
