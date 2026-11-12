---
title: Render a page (Express)
sample: render-page
stack: express
filename: server.ts
language: ts
order: 3
status: published
---

```ts
// server.ts, continued: `app` and `config` come from the API wiring
import { renderCachedPage } from '@krantho/server-node'
import { loadContent } from './src/lib/cms'

// A feature page. Reads happen inside the render, so each one records its cache tags
async function renderFeature(slug: string): Promise<{ status: number; html: string }> {
  const feature = await loadContent('features', slug)
  if (!feature) return { status: 404, html: '<h1>Page not found</h1>' }
  return { status: 200, html: `<article>${feature.html}</article>` }
}

// After the API and Studio middleware. Pass req.originalUrl, which keeps the
// mount path and the query string a signed draft preview carries.
app.get('/features/:slug', async (req, res) => {
  const request = { url: req.originalUrl, method: req.method }
  const page = await renderCachedPage(request, config, () => renderFeature(req.params.slug))
  for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value)
  res.status(page.status).type('html').send(page.html)
})
```
