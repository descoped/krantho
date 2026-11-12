---
title: Open the content loader (Express)
sample: content-loader
stack: express
filename: src/lib/cms.ts
language: ts
order: 3
status: published
---

```ts
import { renderContent } from '@krantho/core'
import { createContentLoader } from '@krantho/server-node'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

// Pages read the published version from the database the API opens
const loader = createContentLoader({ config, collections })

/** A published document with its rendered body; null when it has none */
export async function loadContent(collection: string, slug: string) {
  const doc = await loader.getPublished({ collection, slug })
  if (!doc) return null
  const { html, sections } = await renderContent(doc.fields, doc.body)
  return { fields: doc.fields, html, sections }
}

/** A page's JSON-LD graph, composed from its published version */
export function loadJsonLd(collection: string, slug: string) {
  return loader.jsonLd({ collection, slug })
}
```
