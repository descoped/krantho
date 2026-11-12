---
title: Cache pages (SvelteKit)
sample: cache-pages
stack: sveltekit
filename: src/hooks.server.ts
language: ts
order: 2
status: published
---

```ts
import type { Handle } from '@sveltejs/kit'
import { createPageCacheHandle } from '@krantho/server-sveltekit'
import config from '../krantho.config'

// Pages carry CDN cache headers and cache tags; a change purges them.
// Keep this the outermost handle, first in sequence().
export const handle: Handle = createPageCacheHandle({ config })

// The CDN is chosen by the environment, with no code change:
//   KRANTHO_CACHE_PAGES=cdn
//   KRANTHO_CACHE_CDN_PROVIDER=cloudfront   # or gcp, or vercel
//   KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID=E2EXAMPLE
```
