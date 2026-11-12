---
title: "@krantho/media-s3"
description: The media file store on S3-compatible object storage, such as AWS S3, Cloudflare R2 and MinIO.
area: reference
order: 105
level: intermediate
prerequisites: [media]
related: [package-media-local, package-media-vercel-blob, package-media-gcs, configuration, deploy-cdn]
status: published
---

The media file store for `media.provider: 's3'`. It writes each uploaded file to an S3-compatible bucket with `Cache-Control: public, max-age=31536000, immutable`, using `@aws-sdk/client-s3`.

## Install

> [!NOTE]
> Krantho is in active development and its packages are not on npm yet. The command below is the one the first release will use. To run krantho today, see [Project status](/docs/project-status).

```bash
pnpm add @krantho/media-s3
```

## Configure

| Setting | Variable | Default |
|---------|----------|---------|
| `media.s3.bucket` | `KRANTHO_MEDIA_S3_BUCKET` | unset, required |
| `media.s3.region` | `KRANTHO_MEDIA_S3_REGION` | unset, required (`auto` for R2) |
| `media.s3.endpoint` | `KRANTHO_MEDIA_S3_ENDPOINT` | unset (AWS) |
| `media.s3.forcePathStyle` | `KRANTHO_MEDIA_S3_FORCE_PATH_STYLE` | `false` |
| `media.s3.publicUrl` | `KRANTHO_MEDIA_S3_PUBLIC_URL` | `https://<bucket>.s3.<region>.amazonaws.com` without an endpoint; required with one |
| `media.s3.accessKeyId` | `KRANTHO_MEDIA_S3_ACCESS_KEY_ID` | unset (default chain) |
| `media.s3.secretAccessKey` | `KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY` (secret) | unset (default chain) |

```bash title=".env"
# AWS S3: credentials from the instance or task role
KRANTHO_MEDIA_PROVIDER=s3
KRANTHO_MEDIA_S3_BUCKET=my-site-media
KRANTHO_MEDIA_S3_REGION=eu-north-1
```

Cloudflare R2 uses `region=auto`, the account endpoint and the bucket's public domain as `publicUrl`; MinIO also needs `forcePathStyle=true`. [Media](/docs/media) shows both.

## Credentials

Set both keys or neither. Without them, the AWS SDK's default credential chain applies: environment variables, shared config files, the ECS task role, web identity, EC2 instance metadata. The credentials need `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on the bucket's objects.

## Public read

A file's URL is `<publicUrl>/<key>`, and it must be readable there: a bucket policy granting `s3:GetObject`, public access on R2 or MinIO, or a CDN in front of the bucket with `publicUrl` set to it. Private buckets and signed URLs are not supported.

## How it is verified

krantho's tests check the requests the store sends through a mocked S3 client: keys, content types, `Cache-Control`, copies and the URLs it returns. They do not run against a live AWS, R2 or MinIO bucket. Before relying on it in production, upload, replace and delete one image on a staging bucket and open its URL.

## Next steps

- The other stores and image URLs: [Media](/docs/media)
