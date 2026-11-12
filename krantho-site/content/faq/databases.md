---
title: 'Which databases does krantho support?'
topic: product
order: 5
docs-page: persistence
status: published
---

SQLite and Postgres. SQLite is the default: one file, suited to development and to a single server with a persistent disk. Postgres is the production database, and the one to use on serverless hosts, which have no persistent disk. Switching is configuration: `KRANTHO_PERSISTENCE_PROVIDER=postgres` and a connection URL, plus the adapter's package.

A third backend reads and writes the markdown files directly, with no version history and no media. It is meant for development.

Webhook deliveries are logged and retried on both. Other databases need a custom adapter that implements `IPersistenceAdapter`.
