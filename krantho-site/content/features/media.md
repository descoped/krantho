---
title: 'Media on any store'
description: 'A media library with folders, tags, crop and hotspots. Files go to local disk, Vercel Blob, an S3-compatible bucket or Google Cloud Storage.'
benefit: 'Media files live where your site runs, and the choice is one configuration value.'
order: 7
icon: media
proof-sample: media-config
docs-page: media
status: published
---

## Problem

Images and files need a home that fits the host. A local folder does not survive on serverless functions, and a hosted asset service is one more account and one more bill. Changing hosts should not mean changing how every image is stored and linked.

## Approach

Media is two things, kept in two places. Metadata — name, alt text, tags, folder, crop, hotspot and dimensions — lives in your database, versioned like content. The file bytes live in a file store chosen by `media.provider`:

| Store | `media.provider` | Fits |
|---|---|---|
| Local disk | `local` | development, a single server or container with a volume |
| Vercel Blob | `vercel-blob` | Vercel |
| S3-compatible | `s3` | AWS, Cloudflare R2, MinIO, any S3 API |
| Google Cloud Storage | `gcs` | Cloud Run, GKE, Compute Engine, any host with a key |

Each store is its own package, so an app installs only the SDK it uses. Every file gets a new key that is never reused, so a file's URL can be cached for good; replacing an image writes a new key and updates the content that pointed at the old one.

In Studio, editors upload by drag and drop, organize files in folders, tag them, write alt text, and set a crop and a hotspot for images.

## Proof

Media is configuration, not code. Choosing a store is one leaf of `krantho.config.ts`, or its environment variable:

```bash title=".env"
KRANTHO_MEDIA_PROVIDER=s3
KRANTHO_MEDIA_S3_BUCKET=site-media
KRANTHO_MEDIA_S3_REGION=eu-north-1
```

A missing setting stops startup with a message that names the setting and its variable.

## Limits

- Media is off until `media.provider` is set.
- Media needs SQLite or Postgres. The filesystem backend has no media.
- Local disk only works where every instance shares one persistent disk. It does not fit serverless hosts.
- S3 and Google Cloud Storage objects must be publicly readable, from the bucket itself or through a CDN in front of it.
- On Express and Vite sites, an open issue corrupts binary uploads on their way through the Node adapter. Next.js and SvelteKit sites are not affected.
