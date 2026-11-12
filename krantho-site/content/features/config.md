---
title: 'Typed configuration'
description: 'One typed configuration tree from krantho.config.ts and the environment, resolved once at startup, with every problem reported together.'
benefit: 'The same code runs on every host; what differs between them is configuration you can read in one place.'
order: 8
icon: config
proof-sample: config
docs-page: configuration
status: published
---

## Problem

Configuration spread across files, environment variables and code paths is hard to reason about. A typo in a variable name shows up as odd behavior in production. A missing secret is found one error at a time, on each restart.

## Approach

`@krantho/config` resolves one typed tree in one pass at startup: defaults, then `krantho.config.ts`, then the environment, which wins. The tree covers site identity, persistence, authentication, page caching, media, SEO seeds and the LLM provider.

- **The environment wins.** Every leaf can be set from an environment variable, except structured ones such as the SEO types of each collection, which are set in code.
- **Every problem at once.** A bad value, a missing required field and a rule spanning two leaves are reported together, each naming its path, and most also the variable that sets it.
- **Secrets stay on the server.** A secret leaf also reads from a file named by its `_FILE` variable, is redacted in any dump of the tree, and never reaches a browser; only the public part of the tree is serialized.
- **Data, not wiring.** Configuration holds values. Collections, plugins and hooks are code, passed to the handler.

## Proof

A deployment that picks S3 for media but forgets two settings fails at startup with one message:

```text title="Startup"
Invalid krantho configuration:
  - media.s3.bucket: required when media.provider is "s3" (KRANTHO_MEDIA_S3_BUCKET)
  - media.s3.region: required when media.provider is "s3" (KRANTHO_MEDIA_S3_REGION)
```

The configuration reference is generated from the same tree by `envReference()` in `@krantho/config`, so it lists every variable the code reads.

## Limits

- Configuration is resolved once, at startup. Changing a value means a restart.
- Some settings are stored in the database after first boot and edited in Studio from then on, such as the LLM provider and model used for enrichment.
