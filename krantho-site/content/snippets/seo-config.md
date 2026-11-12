---
title: Seed Schema.org types
sample: seo-config
stack: any
filename: krantho.config.ts
language: ts
order: 1
status: published
---

```ts
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'krantho.com', name: 'Krantho', language: 'en', baseUrl: 'https://krantho.com' },
  // Seeded into the SEO configuration on startup. Rows already there are
  // kept, so edits made in /studio (Structure › Scopes & archetypes) survive.
  seo: {
    configDir: './krantho.seo',
  },
})

// krantho.seo/ holds one YAML file per entity:
//   site/organization.yaml, site/software-application.yaml, site/website.yaml
//   collections/docs/article.yaml, collections/docs/breadcrumb-list.yaml
//   collections/features/breadcrumb-list.yaml, collections/stacks/…
//
// krantho.seo/collections/docs/article.yaml — each docs page is an Article:
//   "@type": Article
//   role: primary
//   properties: {}
//
// Each page then renders its composed @graph as JSON-LD:
//   Next.js:            <SeoJsonLd collection="features" slug="seo" />
//   SvelteKit, Express: await loader.jsonLd({ collection: 'docs', slug: 'installation' })
```
