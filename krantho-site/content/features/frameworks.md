---
title: 'Your framework'
description: 'Adapters for Next.js, SvelteKit and Express with Vite, and UI packages for React, Svelte, MUI and Tailwind. The same content, API and Studio on each.'
benefit: 'You keep the framework and components you know, and krantho fits around them.'
order: 5
icon: frameworks
proof-sample: render-page
docs-page: installation
status: published
---

## Problem

A CMS that favors one framework asks you to follow it, or to write the glue yourself. Teams that build in more than one framework end up with a different content setup for each.

## Approach

The krantho core knows nothing about React or Svelte. A thin adapter per framework turns its requests and responses into the krantho handler's, and wires the API, Studio and the content loader:

- **Next.js** — `@krantho/server-next`, for the App Router: an API route, a Studio route, and a loader wrapped in Next's data cache.
- **SvelteKit** — `@krantho/server-sveltekit`: `+server.ts` handlers, content in `load` functions, and a hook for CDN caching.
- **Express and Vite** — `@krantho/server-node`: a handler for any Node server, a Vite plugin for development, and a standalone server.

The UI packages are parallel alternatives, not layers. `@krantho/ui-react` has server components for text, markdown sections and SEO; `@krantho/ui-svelte` has Svelte 5 components; `@krantho/ui-mui` and `@krantho/ui-tailwind` style React output with MUI or Tailwind. Rendered HTML carries semantic class names, so plain CSS works as well.

Each framework has a bundle package — `@krantho/next`, `@krantho/sveltekit` or `@krantho/node` — that pulls in its adapter, Studio, the local media store and SEO. The Next.js and SvelteKit bundles also bring `@krantho/ui-react` or `@krantho/ui-svelte`; with Express you pick the UI package yourself.

## Proof

The krantho repository holds example apps that render the same site from the same content:

| Example | Stack |
|---|---|
| `nextjs-shadcn` | Next.js 16, React 19, Tailwind v4 |
| `nextjs-mui` | Next.js 16, React 19, MUI v9 |
| `sveltekit-tailwind` | SvelteKit 2, Svelte 5, Tailwind v4 |
| `sveltekit-shadcn` | SvelteKit 2, Svelte 5, Tailwind v4 |
| `react-ssr` | React 19, Vite 8, Express 5 |
| `react-spa` | React 19, Vite 8, React Router 8 |

Studio is the same React application in each of them, the SvelteKit apps included.

## Limits

- `@krantho/server-next` is built for the Next.js App Router.
- Astro, Nuxt, Remix and other frameworks have no adapter. The Node handler works with any server that speaks Web `Request` and `Response`, but you write the glue.
- The scaffolder, `create-krantho`, sets up Next.js and SvelteKit projects, and a static Next.js site for GitHub Pages. Express projects are set up by hand. A scaffolded project does not add the Studio route yet, so you add it yourself.
