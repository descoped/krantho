---
title: "@krantho/studio"
description: Studio, the krantho dashboard for content, structured data, media and setup, served at /studio by every krantho server.
area: reference
order: 100
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [package-server]
next: [studio]
related: [package-server, package-schema, package-seo, content-authoring]
status: published
---

Studio, the dashboard of a krantho site. Editors see what needs them, edit and publish documents — in place on the page, as a form, or as the data the page emits — manage media, check how search engines read the site, and configure it. It works the same with every framework: Next.js, SvelteKit or plain Node.js.

## How it works

Studio is a React single-page app served at `/studio` by the krantho server. It talks to your backend only through the REST endpoints under `/api/*`, and knows nothing about your persistence layer. It works the same whether the site runs on SQLite, Postgres or the filesystem.

## Build Studio

The server serves Studio from its built `dist/` directory. It finds that directory through your app's dependencies (the one-install bundles `@krantho/next`, `@krantho/sveltekit` and `@krantho/node` list `@krantho/studio`), or, in the krantho repository, at `packages/studio/dist`.

When you run krantho from source (see [Project status](/docs/project-status)), build Studio once before you serve it:

```bash
pnpm --filter @krantho/studio run build
```

This writes static assets to `packages/studio/dist/`. Until they exist, `/studio` answers 503 with the build command.

## Destinations

The navigation holds five destinations, and a site tree with every collection and the Layout's globals. [Studio](/docs/studio) walks through each screen.

| Destination | Holds |
|-------------|-------|
| **Pulse** | Key figures, what needs attention, each collection's live and draft counts, and recent activity |
| **Site** | Every collection and the globals; a collection view with a status filter, sort, bulk Publish and Delete, Export and Import |
| **Structure** | The site's Schema.org graph, in the tabs Graph, Scopes & archetypes, Rich results, and Crawlers & assistants |
| **Media** | Folders, upload, search and tags, a details drawer, and the image editor for crop and hotspot |
| **Setup** | The tabs Collections & schema, Locales, AI provider, Integrations, Checkpoints, People and Environment |

A **⌘K** palette runs commands and finds documents. A destination or tab the server does not support, or the role does not allow, is not shown.

## The editor

Each document opens in the editor. A page has three modes:

- **Live** — the site's own draft preview of the page, edited in place through the preview-only marks your templates render ([Live editing](/docs/live-editing)). It needs site preview (`sitePreview` in the [handler options](/docs/package-server#handler-options)) and shows the default locale only.
- **Structure** — a form built from the collection's schema, with each field's type and the SEO output that reads it, and the markdown body.
- **Data** — the search result and social previews, the page's JSON-LD graph with the source of each value, rich results, enrichment, and the version history with diff and restore.

The header holds one status chip — **Live**, **Unpublished changes** or **Not published** — and **Save draft** and **Publish**. Saving never changes the live page; Publish makes the saved version live, for the locale being edited. See [Published and current versions](/docs/package-persistence#published-and-current-versions). Saves carry the version they were made on, so a newer save is a conflict, not an overwrite. While another user holds the edit lock, the editor is read-only and the API refuses your writes. Unsaved work is kept in the browser and offered back. **Open on site** opens the saved draft on the page itself, or, when the site renders no drafts for you, the live page when one is live.

A global has **Fields** and **Where it appears** instead: it has no page of its own.

## Authentication

Studio supports three auth modes:

| Mode | Description |
|------|-------------|
| `none` | No login required (default) |
| `token` | Token-based login |
| `oidc` | OpenID Connect with single sign-on |

With `oidc`, `auth.oidc.studioEntry` decides what a visitor without a session gets at `/studio`. `login` (the default) serves Studio, which shows its sign-in page. `redirect` sends the visitor straight to the OIDC provider and answers 404 when sign-in is refused; it needs `KRANTHO_JWT_SECRET` and the configuration passed to the Studio route handler. See [Studio](/docs/studio) for setting up authentication.

Roles follow a hierarchy: `admin` > `editor` > `viewer`. Studio shows what the role and the server allow; a control the API refuses a role is hidden or read-only.

## Capabilities

Studio asks the server what it supports through `GET /api/capabilities`, and shows or hides destinations, tabs and actions accordingly: media (named by the file store `media.provider` chooses, see [Configuration](/docs/configuration)), media folders, SEO, checkpoints, webhook deliveries, runtime schema, site preview and the assistant.

## Theming

Light, dark and system themes, in krantho's own design. The choice is kept in the browser's `localStorage` under its own key, apart from the site's theme, and the navigation footer has the theme switch.

## Next steps

- Serve Studio from your app: [@krantho/server](/docs/package-server)
- Define the content schemas behind its forms: [@krantho/schema](/docs/package-schema)
- Configure SEO archetypes: [@krantho/seo](/docs/package-seo)
