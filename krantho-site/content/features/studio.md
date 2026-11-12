---
title: 'Studio'
description: 'One Studio for Next.js, SvelteKit and Express at /studio: forms from your schemas, drafts, preview on the site, version history, media and SEO.'
benefit: 'Editors get a place to work without you building one, whichever framework the site uses.'
order: 2
icon: studio
proof-sample: api-route
docs-page: studio
status: published
---

## Problem

Editors need a place to work: forms, drafts, history, media. Building that yourself is a project of its own, and a hosted CMS brings another service, another login and another place where the content lives.

## Approach

Studio is a prebuilt React application in `@krantho/studio`, served by your app at `/studio`. It talks to the krantho API at `/api/*` and nothing else, so it works the same on Next.js, SvelteKit and Express. A SvelteKit site ships it without adding React to its own pages.

- **Editor.** A form generated from the collection's schema next to a markdown editor, with autosave, a lock that keeps two people from overwriting each other, and publish confirmation.
- **Preview on the site.** When the site enables it, an editor opens a draft on its real page. On Next.js this uses draft mode; on SvelteKit and Express a signed link that is valid for ten minutes and for that page only.
- **Version history.** Every save is a version, with a diff view and restore, plus checkpoints of the whole content store.
- **Collections.** Filter, sort and bulk-publish; see translation coverage per locale.
- **Media and structure.** A media library, and a Structure section with the site's Schema.org graph, its scopes and archetypes, rich results, and what crawlers and assistants read.
- **An assistant, when you turn it on.** A chat in Studio that finds, drafts and improves content and SEO on the language model you configure. It writes drafts, and asks you to confirm before it publishes, deletes or replaces anything.
- **Sign-in.** An access token, or OIDC with any provider that supports it. `/studio` can send a visitor without a session straight to the provider and answer 404 when sign-in is refused.

Everything Studio does goes through the REST API, so the same operations are open to your own tools. The API describes itself in an OpenAPI 3.1 specification at `/api/openapi.json`, with an interactive reference at `/api/docs`. Plugins add endpoints under `/api/plugins/<name>/`, content hooks and field types. The `krantho` command-line tool, written in Go, works with content, schemas, checkpoints and SEO from the terminal through the same API.

## Proof

Studio is one route in your app. On Next.js:

```ts title="app/studio/[[...slug]]/route.ts"
import { createStudioRouteHandler } from '@krantho/server-next'

export const { GET } = createStudioRouteHandler()
```

SvelteKit uses `createStudioHandler()` from `@krantho/server-sveltekit`; Express mounts `createStudioServer(config)` from `@krantho/server-node`. To send visitors without a session straight to the OIDC provider, pass the site's configuration: `createStudioRouteHandler({ config })`.

## Limits

- Roles are admin, editor and viewer, and apply to the whole site. Permissions per collection are stored but not enforced yet.
- Studio's look is its own. It is not themed to your site.
- Editors change content, not layout. There is no visual page designer.
