---
title: Wire the API and Studio (Next.js)
sample: api-route
stack: next
filename: app/api/[...path]/route.ts
language: ts
order: 1
status: published
---

```ts
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

// The content API at /api/*: content, media, SEO, auth and the sitemap
export const { GET, POST, PUT, DELETE, PATCH } = createApiRouteHandlers({
  config,
  collections,
})

// Studio at /studio, in app/studio/[[...slug]]/route.ts:
//
//   import { createStudioRouteHandler } from '@krantho/server-next'
//   export const { GET } = createStudioRouteHandler()
```
