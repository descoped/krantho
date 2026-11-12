---
title: Wire the API and Studio (SvelteKit)
sample: api-route
stack: sveltekit
filename: src/routes/api/[...path]/+server.ts
language: ts
order: 2
status: published
---

```ts
import { createApiHandlers } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'
import { collections } from '../../../../krantho.collections'

// The content API at /api/*: content, media, SEO, auth and the sitemap
export const { GET, POST, PUT, DELETE, PATCH } = createApiHandlers({
  config,
  collections,
  // Editors preview drafts through a short-lived signed link
  sitePreview: 'signed-url',
})

// Studio at /studio, in src/routes/studio/[...path]/+server.ts:
//
//   import { createStudioHandler } from '@krantho/server-sveltekit'
//   export const { GET } = createStudioHandler()
```
