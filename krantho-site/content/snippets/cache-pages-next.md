---
title: Cache pages (Next.js)
sample: cache-pages
stack: next
filename: krantho.config.ts
language: ts
order: 1
status: published
---

```ts
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: {
    domain: 'krantho.com',
    name: 'Krantho',
    language: 'en',
    baseUrl: 'https://krantho.com',
  },
  cache: {
    // Each page renders on its first request and stays cached until a change
    // in /studio invalidates it. Content routes need the ISR shape:
    // generateStaticParams returns [] and revalidate is false.
    pages: 'next-isr',
    // Several `next start` instances: keep Next's cache in the site's database,
    // with the cache handler from @krantho/server-next set in next.config.ts
    // shared: 'database',
  },
})
```
