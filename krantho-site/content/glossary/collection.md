---
title: Collection
definition: A named group of documents that share one schema, such as pages, features or globals.
docs-page: content-model
status: published
---

You define a collection in code with `defineCollection()` from `@krantho/schema`: a name, where its seed files live, and a Zod schema for its fields. The schema is also the form editors fill in Studio. Collections group content by type — a list of documents that each get a page, or site-wide data read by the layout.
