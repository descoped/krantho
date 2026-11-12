---
title: Choose SQLite or Postgres
sample: persistence-config
stack: any
language: bash
order: 1
status: published
---

```bash
# SQLite is the default: one file, .krantho/content.db, no database server.

# Postgres: add the adapter and its driver to the app...
pnpm add @krantho/persistence-postgres postgres

# ...and select it from the environment (the URL is a secret)
KRANTHO_PERSISTENCE_PROVIDER=postgres
KRANTHO_PERSISTENCE_POSTGRES_URL=postgres://user:password@host:5432/db
```
