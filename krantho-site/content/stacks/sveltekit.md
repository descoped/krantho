---
title: Krantho for SvelteKit
description: Add content management, an admin and Schema.org structured data to a SvelteKit app. Load functions read published content, and a CDN can keep each page until an editor changes it.
framework: sveltekit
tagline: Load functions read published content in-process, and a CDN in front can keep each page until an editor changes it.
packages:
  - '@krantho/sveltekit'
  - '@krantho/server-sveltekit'
  - '@krantho/ui-svelte'
ui-packages:
  - '@krantho/ui-svelte'
order: 2
docs-page: installation
status: published
---

Krantho runs inside your SvelteKit app. The API and Studio are two `+server.ts` endpoints; your `load` functions read published content from the same database, in the same process. Studio is the same React application every stack serves, delivered as static files, so your app stays Svelte.

## Install

One bundle, `@krantho/sveltekit`, pulls in the SvelteKit adapter, the Svelte components, Studio, the local media store and the SEO package. Also add the packages your files import by name, including `@krantho/core` for `renderContent`. SQLite is the default store and needs no database server.

{{sample:install}}


## Wire

Two endpoints connect krantho to the app: the API at `/api/*` and Studio at `/studio`. A module in `src/lib` opens the content loader over the database the API uses.

{{sample:api-route}}

{{sample:content-loader}}

The API endpoint and the loader both take the collections, so whichever a fresh deployment serves first opens the database and imports the markdown content into it. `sitePreview: 'signed-url'` lets an editor open a draft on the site through a short-lived signed link.

## Render

A `load` function reads the published version of a document, renders its body with `renderContent`, and composes its JSON-LD graph. A saved draft never changes what visitors see.

{{sample:render-page}}

Render the HTML with your own components, or with `@krantho/ui-svelte`, which has Svelte 5 components for fields, markdown, images and JSON-LD. Live mode and **Open on site** in Studio send the editor to the page with a signed token, valid for ten minutes and for that page only; the draft renders with `Cache-Control: private, no-store`, so no cache ever keeps it.

## Deploy

A SvelteKit site builds with `@sveltejs/adapter-node` into a Node server for a container or a VM, or with `@sveltejs/adapter-vercel` on Vercel. The code is the same on every host.

{{sample:cache-pages}}

- **Behind a CDN** — Amazon CloudFront, Google Cloud CDN or Vercel's — set `cache.pages` to `cdn` and name the provider. Each page carries CDN cache headers and tags for every read it made, and every live change purges exactly those tags. See [Deploy behind a CDN](/docs/deploy-cdn).
- **Without a CDN**, keep the default `cache.pages: 'none'`. Every request renders the page from reads the content loader keeps for `content.cache.ttlMs` (five minutes by default), so a publish shows within that time.
- **Previews** are signed with `KRANTHO_JWT_SECRET`. Set it on every deployment that previews drafts; without it, a preview link renders the published page.
