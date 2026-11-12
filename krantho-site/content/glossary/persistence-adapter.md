---
title: Persistence adapter
definition: The part of krantho that stores content, versions, settings and users — SQLite by default, Postgres in production, or plain files in development.
docs-page: persistence
status: published
---

Every read and write goes through one interface, `IPersistenceAdapter` from `@krantho/persistence`, so the rest of krantho does not know which database it runs on. You pick the backend with `persistence.provider`. Markdown files in your content directory are imported into the database on first boot.
