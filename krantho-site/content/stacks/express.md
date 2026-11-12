---
title: Krantho for Express and Vite
description: Add content management, an admin and Schema.org structured data to an Express server or a Vite app with server rendering. The API and Studio mount as middleware; your render function reads published content.
framework: express
tagline: The API and Studio mount as middleware, and your server-side render reads published content from the same database.
packages:
  - '@krantho/node'
  - '@krantho/server-node'
  - '@krantho/ui-react'
ui-packages:
  - '@krantho/ui-react'
  - '@krantho/ui-svelte'
  - '@krantho/ui-mui'
  - '@krantho/ui-tailwind'
order: 3
docs-page: installation
status: published
---

Krantho runs inside a Node server you already have: Express, or a Vite app that renders on the server. The krantho API and Studio mount as middleware; your render function reads published content from the same database, in the same process, and serves the page through one helper that knows which responses a CDN may keep.

## Install

One bundle, `@krantho/node`, pulls in the Node adapter, Studio, the local media store and the SEO package. It includes no UI library on purpose: pick `@krantho/ui-react`, `@krantho/ui-svelte`, `@krantho/ui-mui` or `@krantho/ui-tailwind`, or render with your own components. Also add the packages your files import by name. SQLite is the default store and needs no database server.

{{sample:install}}

The packages are not on npm yet; this is the install the first release will use. [Project status](/docs/project-status) explains how to run krantho from source today.

## Wire

The API and Studio are handlers over Web `Request` and `Response`. `toWebRequest` turns the Node request into a Web request, and `writeResponseHeaders` copies the response headers back, one `Set-Cookie` line per cookie. Mount them without a path: the handler routes on the full URL.

{{sample:api-route}}

In a Vite dev server, the `@krantho/server-node/vite` plugin serves the API and Studio for you.

## Render

A module opens the content loader over the database the API uses. Your render function reads the published version of a document, so a saved draft never changes what visitors see.

{{sample:content-loader}}

{{sample:render-page}}

Serve every page through `renderCachedPage`, with the full URL from `req.originalUrl`. Return every header the page sets — a cookie above all — from the render instead of setting it on `res`: the helper must see a cookie to keep that page off a CDN. With `sitePreview: 'signed-url'` on the API, Live mode and **Open on site** in Studio send the editor to the page with a signed token, and the draft renders with `Cache-Control: private, no-store`.

## Deploy

An Express server runs as a plain Node process in a container or on a VM. The code is the same for every host; the environment picks how pages are cached.

{{sample:cache-pages}}

- **Behind Amazon CloudFront or Google Cloud CDN**, set `cache.pages` to `cdn` and name the provider. Each page carries CDN cache headers and tags for every read it made, and every live change purges exactly those tags. A `vercel` provider exists as well, for a server that runs on Vercel. See [Deploy behind a CDN](/docs/deploy-cdn).
- **Without a CDN**, keep the default `cache.pages: 'none'`. Every request renders the page from reads the content loader keeps for `content.cache.ttlMs` (five minutes by default), so a publish shows within that time.
- **Previews** are signed with `KRANTHO_JWT_SECRET`. Set it on every deployment that previews drafts; without it, a preview link renders the published page.
