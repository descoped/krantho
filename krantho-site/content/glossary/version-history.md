---
title: Version history
definition: The list of every saved version of a document, kept so any earlier version can be read or restored.
docs-page: studio
status: published
---

With SQLite or Postgres, each save appends a new version; nothing is overwritten in place. Restoring an old version creates a new version from it, so the history stays complete. Purging keeps the latest versions of each document, as many as `content.versions.keep` says.
