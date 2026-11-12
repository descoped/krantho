---
title: Media store
definition: Where uploaded files are kept — local disk, Vercel Blob, an S3-compatible bucket or Google Cloud Storage — chosen by media.provider.
docs-page: media
status: published
---

The file bytes go to the media store, while the metadata — alt text, tags, folder, crop and hotspot — is versioned in your database. Media needs SQLite or Postgres persistence, and it is off while `media.provider` is unset. Each store is a package of its own, so a site installs only the one it uses.
