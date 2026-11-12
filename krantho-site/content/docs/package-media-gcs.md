---
title: "@krantho/media-gcs"
description: The media file store on Google Cloud Storage, with no Google SDK dependency.
area: reference
order: 103
level: intermediate
prerequisites: [media]
related: [package-media-local, package-media-s3, package-media-vercel-blob, configuration, deploy-cdn]
status: published
---

The media file store for `media.provider: 'gcs'`. It writes each uploaded file to a Cloud Storage bucket through the JSON API with plain `fetch`. The package has no dependencies beyond krantho's own.

## Install

> [!NOTE]
> Krantho is in active development and its packages are not on npm yet. The command below is the one the first release will use. To run krantho today, see [Project status](/docs/project-status).

```bash
pnpm add @krantho/media-gcs
```

## Configure

| Setting | Variable | Default |
|---------|----------|---------|
| `media.gcs.bucket` | `KRANTHO_MEDIA_GCS_BUCKET` | unset, required |
| `media.gcs.publicUrl` | `KRANTHO_MEDIA_GCS_PUBLIC_URL` | `https://storage.googleapis.com/<bucket>` |
| `media.gcs.credentials` | `KRANTHO_MEDIA_GCS_CREDENTIALS` (secret) | unset (metadata server) |

```bash title=".env"
# Cloud Run, GKE or Compute Engine: the attached service account's token
KRANTHO_MEDIA_PROVIDER=gcs
KRANTHO_MEDIA_GCS_BUCKET=my-site-media
```

## Credentials

Without `credentials`, the store asks the metadata server of Cloud Run, GKE or Compute Engine for a token. Anywhere else, set `KRANTHO_MEDIA_GCS_CREDENTIALS` to a service-account key JSON, or `KRANTHO_MEDIA_GCS_CREDENTIALS_FILE` to the key file. Tokens are cached until shortly before they expire. The service account needs to create, read and delete objects; `roles/storage.objectUser` on the bucket covers it.

## Public read

A file's URL is `<publicUrl>/<key>`, and it must be readable there: grant `allUsers` `roles/storage.objectViewer` on the bucket, or put a CDN in front and set `publicUrl` to it. Private buckets and signed URLs are not supported.

Uploads set no `Cache-Control` on the object, so the raw URL gets Cloud Storage's default for public objects. Images served through `/api/media/:id/image` carry their own immutable caching.

## How it is verified

krantho's tests check the requests the store sends through a stubbed `fetch`: the JSON API calls, the metadata-server and service-account token requests, and the URLs it returns. They do not run against a live bucket. Before relying on it in production, upload, replace and delete one image on a staging bucket and open its URL.

## Next steps

- The other stores and image URLs: [Media](/docs/media)
