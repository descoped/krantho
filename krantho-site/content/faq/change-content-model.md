---
title: 'Can I change the content model after launch?'
topic: content
order: 12
docs-page: content-model
status: published
---

Yes. Collections are Zod schemas in your code, so you change them like any other code and deploy.

Between deploys, Studio's schema editor can add runtime fields to a collection. They only add keys: a field defined in code cannot be changed or removed from Studio, and code always wins. Studio exports the merged schema as Zod code, so a runtime field that proves useful can move into the codebase.
