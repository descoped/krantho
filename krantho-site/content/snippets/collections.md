---
title: Define a collection
sample: collections
stack: any
filename: krantho.collections.ts
language: ts
order: 1
status: published
---

```ts
import { join } from 'path'
import { defineCollection } from '@krantho/schema'
import { z } from 'zod'

const dir = (name: string): string => join(process.cwd(), 'content', name)
const status = z.enum(['draft', 'published']).default('published')
const ref = (collection: string) => z.string().describe(`ref:${collection}`)

/** Capabilities: cards on the landing page and a page each */
const features = defineCollection({
  name: 'features',
  source: 'filesystem',
  directory: dir('features'),
  path: '/features/:slug',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    benefit: z.string(),
    order: z.number().default(99),
    icon: z.enum(['content', 'studio', 'seo', 'cache', 'media', 'database', 'skills', 'config', 'frameworks']),
    'proof-sample': z.string().optional(),
    'docs-page': ref('docs').optional(),
    status,
  }),
})
```
