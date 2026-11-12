---
title: Open the content loader (Next.js)
sample: content-loader
stack: next
filename: lib/krantho.ts
language: ts
order: 1
status: published
---

```ts
import { notFound } from 'next/navigation'
import { createContentLoader } from '@krantho/server-next'
import { getCMSContent, initServerLoader, NetworkError } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'
import config from '../krantho.config'
import { collections } from '../krantho.collections'

// Server components read the database the API route opens, in-process
initServerLoader(createContentLoader({ config, collections }))

/** A page's published content; 404 when it has no published version */
export async function requirePublished(collection: string, slug: string): Promise<CMSContent> {
  try {
    return await getCMSContent(collection, slug)
  } catch (error) {
    if (error instanceof NetworkError && error.status === 404) notFound()
    throw error
  }
}
```
