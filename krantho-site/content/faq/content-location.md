---
title: 'Where does my content live?'
topic: product
order: 6
docs-page: content-model
status: published
---

In your database, SQLite or Postgres, reached through one adapter interface, `IPersistenceAdapter`. Every save appends a version, so the history stays with the content. Media metadata is stored in the same database, and the files in the store you choose: local disk, Vercel Blob, an S3-compatible bucket or Google Cloud Storage.

Markdown files in your repository seed an empty database on first boot. After that, the database is where editors work.

Content leaves your infrastructure only if you turn on AI enrichment: the content being enriched is then sent to the LLM provider you configured.
