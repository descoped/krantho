---
title: 'Does krantho work with my framework?'
topic: product
order: 4
docs-page: installation
status: published
---

Krantho has adapters for Next.js (the App Router), SvelteKit, and Express, with a Vite plugin for development. For rendering, `@krantho/ui-react`, `@krantho/ui-svelte`, `@krantho/ui-mui` and `@krantho/ui-tailwind` are alternatives; rendered HTML carries semantic class names, so plain CSS works too.

Studio is the same React application on every framework, so a SvelteKit site ships it without React in its own pages. Other frameworks, such as Astro or Nuxt, have no adapter. The Node handler takes a Web `Request` and returns a `Response`, so it can be wired into other servers by hand.
