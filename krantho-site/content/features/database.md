---
title: 'Your database'
description: 'Content, versions, users, settings and SEO configuration live in your own SQLite or Postgres database, behind one adapter interface you can read.'
benefit: 'Your content stays in a database you own, and moving from SQLite to Postgres is a configuration change.'
order: 6
icon: database
proof-sample: persistence-config
docs-page: persistence
status: published
---

## Problem

A hosted CMS keeps your content in its database. Leaving means an export, a migration and a rewrite of every place that reads content. Running a separate database only for the CMS adds one more thing to operate.

## Approach

Every read and write goes through one interface, `IPersistenceAdapter` in `@krantho/persistence`. Three backends implement it:

- **SQLite** — the default. A single file in the project's data directory, suited to development and to a single server with a persistent disk.
- **Postgres** — for production and for hosts without a persistent disk, such as serverless functions. Migrations run on startup, serialized with an advisory lock, so several instances can start at once.
- **Filesystem** — reads and writes the markdown files directly. Useful while you model content; it keeps no version history and has no media.

The database holds content and its version history, locks, users, site settings, SEO configuration and media metadata. The content loader your pages use reads published versions through the same adapter as the API.

Markdown files in the repository seed an empty database on first boot. A later deploy brings changed files in only when it ships a content manifest, which records a conflict instead of overwriting an edit made in Studio.

## Proof

Choosing Postgres is two environment variables and the adapter's package; the code stays as it is:

```bash title=".env"
KRANTHO_PERSISTENCE_PROVIDER=postgres
KRANTHO_PERSISTENCE_POSTGRES_URL=postgres://user:password@host:5432/site
```

This site runs on Postgres in production and on SQLite on a developer's machine, from the same code.

## Limits

- SQLite needs a persistent, writable disk. On serverless hosts, use Postgres.
- Without a content manifest, files committed after the first deploy do not reach a database that outlives the deploy. With one, an open issue may record every changed file as a conflict instead of importing it.
- Other databases need a custom adapter that implements `IPersistenceAdapter`.
