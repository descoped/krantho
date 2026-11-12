---
title: Configure a site
sample: config
stack: any
filename: krantho.config.ts
language: ts
order: 1
status: published
---

```ts
import { defineKranthoConfig } from '@krantho/config'

// krantho.com's own configuration. Data only, resolved once at startup:
// defaults, then this file, then the environment.
export default defineKranthoConfig({
  site: {
    domain: 'krantho.com',
    name: 'Krantho',
    language: 'en',
    baseUrl: 'https://krantho.com',
  },
  // The site's own Schema.org identity and collection archetypes, seeded into
  // the database on first boot; /studio → SEO edits them from there
  seo: {
    configDir: './krantho.seo',
  },
  // Pages stay cached until a content change invalidates them
  cache: { pages: 'next-isr' },
})

// In production the environment sets the rest, secrets included:
//   KRANTHO_PERSISTENCE_PROVIDER=postgres
//   KRANTHO_PERSISTENCE_POSTGRES_URL=postgres://…
//   KRANTHO_AUTH=oidc
```
