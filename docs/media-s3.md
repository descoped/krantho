# @krantho/media-s3

Media file store on S3-compatible object storage. Implements `IFileStore` from `@krantho/persistence` over `@aws-sdk/client-s3`, for AWS S3, Cloudflare R2, MinIO and any other service that speaks the S3 API.

## Context

krantho keeps media metadata and folders in the configured database and the file bytes in a file store picked by `media.provider` (see [guides/media.md](guides/media.md)). `@krantho/media-s3` is the store for `media.provider: 's3'`. `@krantho/server` loads it when that provider is set.

## Rationale

- **One package for every S3 API.** `endpoint` and `forcePathStyle` point the client at a non-AWS service; `publicUrl` says where that service serves objects.
- **Public objects.** `MediaItem.url` is `<publicUrl>/<key>` and must be readable there -- a public bucket policy, or a CDN in front of the bucket. Private buckets and signed URLs are not supported.
- **One-year cache lifetime.** A key never changes content, so objects are written with `Cache-Control: public, max-age=31536000, immutable`.
- **Credentials from config, else the platform.** An explicit key pair wins. Without one, the SDK's default credential chain applies -- environment, shared files, ECS task role, web identity, EC2 metadata. Those reads are the SDK's, a deliberate exception to krantho's config-only environment rule, so an IAM role works without copying a key anywhere.
- **Separate package.** `@aws-sdk/client-s3` is large; only apps that pick this store install it.

## Architecture

```
s3-file-store.ts   S3FileStore -- IFileStore over PutObject, GetObject, CopyObject, DeleteObject
                   createS3FileStore(section) -- the factory @krantho/server calls
```

## API Reference

### `createS3FileStore(section: S3MediaSection): IFileStore`

Builds an `S3Client` from the resolved `media.s3` section -- `region`, `forcePathStyle`, `endpoint` when set, and `credentials` when both keys are set -- and returns the store. Throws `<path>: required when media.provider is "s3"` when `bucket`, `region` or `publicUrl` is missing (configuration validation reports the same earlier).

| Member | Behaviour |
|--------|-----------|
| `label` | `'S3'` |
| `location` | the bucket name |
| `put(key, bytes, contentType)` | `PutObject` with `ContentType` and the immutable `CacheControl` |
| `get(key)` | `GetObject`, then `transformToByteArray()`; `null` on `NoSuchKey` |
| `copy(fromKey, toKey, contentType)` | `CopyObject` with a URL-encoded `CopySource`, `MetadataDirective: 'REPLACE'`, the content type and `CacheControl` |
| `delete(key)` | `DeleteObject`; no error when the object is already gone |

## Usage

```bash
pnpm add @krantho/media-s3
```

| Setting | Variable | Default |
|---------|----------|---------|
| `media.s3.bucket` | `KRANTHO_MEDIA_S3_BUCKET` | unset -- required |
| `media.s3.region` | `KRANTHO_MEDIA_S3_REGION` | unset -- required (`auto` for R2) |
| `media.s3.endpoint` | `KRANTHO_MEDIA_S3_ENDPOINT` | unset (AWS) |
| `media.s3.forcePathStyle` | `KRANTHO_MEDIA_S3_FORCE_PATH_STYLE` | `false` |
| `media.s3.publicUrl` | `KRANTHO_MEDIA_S3_PUBLIC_URL` | `https://<bucket>.s3.<region>.amazonaws.com` without an `endpoint`; required with one |
| `media.s3.accessKeyId` | `KRANTHO_MEDIA_S3_ACCESS_KEY_ID` | unset (default chain) |
| `media.s3.secretAccessKey` | `KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY` (secret, `_FILE` accepted) | unset (default chain) |

The key pair is set together or not at all. The credentials need `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on the bucket's objects.

AWS S3 in a region, credentials from the instance or task role:

```bash
KRANTHO_MEDIA_PROVIDER=s3
KRANTHO_MEDIA_S3_BUCKET=my-site-media
KRANTHO_MEDIA_S3_REGION=eu-north-1
```

Cloudflare R2 and MinIO need `endpoint` and `publicUrl`, and MinIO also `forcePathStyle=true`; see [guides/media.md](guides/media.md#s3-compatible-aws-s3-cloudflare-r2-minio) for both.

## Dependencies

### Runtime Dependencies

| Package | Purpose |
|---------|---------|
| `@aws-sdk/client-s3` | `S3Client` and the object commands |

### Workspace Dependencies

| Package | What's imported |
|---------|-----------------|
| `@krantho/config` | `S3MediaSection` |
| `@krantho/persistence` | `IFileStore`, `StoredFile` |
