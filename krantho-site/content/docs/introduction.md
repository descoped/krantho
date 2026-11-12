---
title: Introduction
description: What krantho is, how its parts fit together in your app, and how these docs are organized.
area: get-started
order: 10
level: beginner
stacks: [next, sveltekit, express]
next: [project-status, installation]
related: [content-model, templates, configuration, glossary]
status: published
---

Krantho is a CMS you install as a library in the site you already build. It adds content storage, a REST API, an admin for editors and Schema.org structured data to a Next.js, SvelteKit or Express/Vite app — on the host and the database you choose. This page explains the parts and how they fit together.

## A library in your app

Krantho is not a hosted service and does not run beside your site. You add its packages to your app, and your app serves everything:

- **Your pages** read published content in-process, through a content loader, from the same database the API uses — no request to a separate service.
- **The API** answers under `/api/*`, from a route you add. It serves content, media, versions and SEO data, and describes itself as an OpenAPI spec at `/api/openapi.json`, with interactive docs at `/api/docs`.
- **Studio** is served at `/studio`, from another route you add.

Layout stays yours. Krantho has no page builder and no visual design tool: content is fields and a markdown body, and how it looks is decided by your components.

## Content templates and page templates

Two ideas carry a krantho site.

A **content template** is a collection: a named group of documents with a Zod schema, defined in `krantho.collections.ts`. The schema is the contract for the content and the form an editor fills in Studio. A document has **fields** (the YAML frontmatter of its markdown file) and a **body** (the markdown below it), and every `##` heading in the body is a **section** your page can render on its own.

{{sample:collections}}

A **page template** is your own code: a route and its components that read one or more published documents and render them. On krantho.com, the features list at `/features` and each feature's page at `/features/<slug>` are page templates; `features` is the content template behind them, and `pages` the one behind standalone pages such as About.

Content can start as markdown files in your repository. With a database, krantho imports them on first boot, and from then on Studio edits the database. Each save appends a version and leaves the live page as it is; publishing makes the current version live.

## Studio

Studio is one React single-page app that talks only to the API, so the same Studio works on Next.js, SvelteKit and Express. Editors write in a split-view markdown editor with forms generated from your schemas, save changes, preview them on the site, publish them, and restore earlier versions. Studio also holds the media library, the SEO tools and the site settings. Sign-in is off by default, and can use a token or OpenID Connect with Studio, editor and viewer roles.

## SEO

Structured data is configured through archetypes — Schema.org types assigned at four levels: the site (the business or organization behind it), each collection (for example `Article` for pages), optional URL patterns, and single documents. Krantho composes them into one JSON-LD `@graph` per page and fills properties a document does not set from its metadata and path, so authors fill in what needs human judgment. Your pages render meta tags, Open Graph and Twitter fields with `resolveSeoContent()` and the JSON-LD with `<SeoJsonLd>`. An LLM of your choice can fill missing meta descriptions and properties without overwriting edits.

SEO is optional. The CMS does not depend on it: your pages opt in by rendering its meta tags and JSON-LD, and the archetypes come from the `seo` section of the configuration and Studio.

## Rendering and caching

Pages render on the server and show only the published version of each document. `cache.pages` in the configuration picks how they are cached:

- `none` (the default) renders every request.
- `next-isr` keeps each Next.js page until a content change invalidates it.
- `cdn` lets a CDN in front of a SvelteKit or Express site keep each page until a change purges it, at CloudFront, Cloud CDN or Vercel.

Every committed change is mapped to the cache tags of the pages that read the changed content, so a publish refreshes those pages and leaves the rest cached.

## Persistence and media

Content, versions, settings and SEO configuration are stored through a persistence adapter:

- **SQLite** is the default: a single file, no database server.
- **Postgres** is the production store for hosted and multi-instance sites.
- **The filesystem** reads the markdown files directly, for prototypes and developer-only sites. It has no database, so there is no version history, media library or SEO configuration storage.

Media is off until you choose a file store: local disk, Vercel Blob, S3-compatible storage or Google Cloud Storage. Switching the adapter or the store does not change your collections, components or SEO configuration.

## Frameworks

| Framework | Server package | UI |
|-----------|----------------|----|
| Next.js (App Router) | `@krantho/server-next` | `@krantho/ui-react`, `@krantho/ui-mui`, `@krantho/ui-tailwind` |
| SvelteKit | `@krantho/server-sveltekit` | `@krantho/ui-svelte` |
| Express / Vite | `@krantho/server-node` | any of the UI packages |

The UI packages render plain HTML with semantic CSS classes, so you style the output with the CSS you already use.

## How it fits together

```text
your app (Next.js, SvelteKit or Express/Vite)
├── krantho.config.ts       configuration: site, persistence, media, cache, SEO, auth, LLM
├── krantho.collections.ts  content templates: collections and their Zod schemas
├── routes and components   page templates: your code, reading published content
├── /api/*                  the krantho API, from a route you add
└── /studio                  Studio, from a route you add
        │
        ├── persistence adapter  →  SQLite (default), Postgres or the filesystem
        └── media file store     →  local disk, Vercel Blob, S3-compatible or Google Cloud Storage
```

Configuration is data: defaults, then `krantho.config.ts`, then the environment, resolved once at startup. A deployment sets its database URL, secrets and provider choices as environment variables. Collections, pages and plugins are wiring and stay in code.

## How these docs are organized

- **Get started** — this introduction, the project status, installation, a first page and adding SEO. Read them in order.
- **Concepts** — how the content model, templates, configuration, rendering and caching, persistence, media and Studio work.
- **Guides** — how to do a specific task, such as authoring content or storing media.
- **Deploy** — running a site on Vercel or behind a CDN.
- **Reference** — configuration, content fields, semantic styles, each package, the API, the CLI and a [glossary](/docs/glossary).
- **Agent skills** — the krantho plugin for Claude Code.

Code samples follow the stack you pick in a code block's tabs, and remember it across pages.
