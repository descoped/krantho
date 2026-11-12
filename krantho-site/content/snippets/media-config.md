---
title: Choose a media store
sample: media-config
stack: any
filename: krantho.config.ts
language: ts
order: 1
status: published
---

```ts
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: {
    domain: 'example.com',
    name: 'Example',
    language: 'en',
    baseUrl: 'https://example.com',
  },
  // local, vercel-blob, s3 or gcs. Each store has its own package, such as
  // @krantho/media-s3; leaving the provider unset turns media off.
  media: {
    provider: 's3',
    s3: { bucket: 'my-site-media', region: 'eu-north-1' },
  },
})

// Credentials stay in the environment. S3 and Google Cloud Storage can also
// use the host's own identity (an IAM role, a service account):
//   KRANTHO_MEDIA_S3_ACCESS_KEY_ID, KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY
//   KRANTHO_MEDIA_VERCEL_BLOB_TOKEN, KRANTHO_MEDIA_GCS_CREDENTIALS
```
