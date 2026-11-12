---
title: Render a page (SvelteKit)
sample: render-page
stack: sveltekit
filename: src/routes/features/[slug]/+page.server.ts
language: ts
order: 2
status: published
---

```ts
import { error } from '@sveltejs/kit'
import { loadContent, loadJsonLd } from '$lib/cms'

// /features/<slug>. Reads happen inside the page render, so each one records
// its cache tags: behind a CDN, a change in /studio purges the pages that showed it.
export async function load({ params }: { params: { slug: string } }) {
  const feature = await loadContent('features', params.slug)
  if (!feature) error(404, 'Page not found')
  const jsonLd = await loadJsonLd('features', params.slug)
  return { fields: feature.fields, html: feature.html, jsonLd }
}

// +page.svelte renders it:
//
//   <h1>{data.fields.title}</h1>
//   <p>{data.fields.benefit}</p>
//   {@html data.html}
```
