---
title: Cache pages (Express)
sample: cache-pages
stack: express
filename: server.ts
language: ts
order: 3
status: published
---

```ts
// server.ts, continued: `app` and `config` come from the API wiring
import { renderCachedPage } from '@krantho/server-node'

// Every page goes through renderCachedPage. render() is your SSR entry,
// returning { status, html, headers? }; the helper records the cache tags of
// the reads inside it and sets the CDN headers. A change purges those tags.
app.use(async (req, res) => {
  const request = { url: req.originalUrl, method: req.method }
  const page = await renderCachedPage(request, config, () => render(req.originalUrl))
  for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value)
  res.status(page.status).type('html').send(page.html)
})

// The CDN is chosen by the environment, with no code change:
//   KRANTHO_CACHE_PAGES=cdn
//   KRANTHO_CACHE_CDN_PROVIDER=gcp   # or cloudfront, or vercel
//   KRANTHO_CACHE_CDN_GCP_PROJECT=my-project
//   KRANTHO_CACHE_CDN_GCP_URL_MAP=my-url-map
```
