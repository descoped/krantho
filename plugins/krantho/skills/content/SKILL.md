---
name: content
description: >
  Creates, edits, publishes and reviews content in a krantho site — as markdown files with YAML
  frontmatter, in the /studio editor, or through the krantho REST API. Use when asked to write or
  edit a page, post, docs page, FAQ entry or any document in a krantho collection; to import or
  seed content; to publish, unpublish, preview or roll back a document; to bulk-edit content with
  a script; or when edited markdown files do not show up on the site. Explains drafts versus the
  published (live) version, version history, preview, and how files reach the database.
compatibility: krantho 1.x; Claude Code
metadata:
  krantho-version: 1.1.0
  docs: https://krantho.com/docs/content-authoring
---

# Working with krantho content

## Contents

- Before writing anything
- Three channels
- Writing a markdown file
- Drafts, publishing and preview
- How files reach the database
- The REST API
- Style for content an agent writes
- Checks

A document is **fields** (YAML frontmatter in a file, form fields in Studio) plus a
**markdown body**. It belongs to a collection whose Zod schema, in `krantho.collections.ts`,
decides which fields exist and validates every import and save. Visitors only ever see a
document's **published (live) version**.

## Before writing anything

1. Read `krantho.collections.ts`: find the collection, its fields, which are required, enums and
   their values, references (`describe('ref:<collection>')`, which store a slug), media fields
   (`describe('media')`, which store a media id) and its `sections` — the `##` sections its page
   template designs, in order (also listed by `GET /api/collections`).
2. Read the page template that renders the collection (under `app/`, `src/routes/` or the
   server's renderer) to see how it treats those sections — the section contract — and which
   fields it shows. Sections outside the list render as prose; a missing one is left out.
3. Read one or two existing documents of the collection as a model for tone and length.
4. Decide the channel (below). A running site's database is the source of truth: after the first
   import, editing a markdown file does **not** change the site.

## Three channels

| Channel | Use when | Result |
|---|---|---|
| Markdown files in `content/<collection>/<slug>.md` | seeding a new site, content that ships with the code, development | imported into an **empty** database; later edits need a manifest (below) |
| Studio at `/studio` | editors, and any change to a running site by hand | a new version in history; live only once published |
| The REST API at `/api` | scripts, bulk changes, agents | the same versions Studio writes |

## Writing a markdown file

```markdown
---
title: 'Delivery questions'
description: 'How delivery works, in one page.'
order: 20
tags: [delivery, orders]
date: '2026-09-30'
status: published
---

The first paragraph is the lead.

## Problem

Text for the section the page template places as "Problem".
```

- The file name is the slug and, for routed collections, the URL segment (`/<collection>/<slug>`,
  or `/<slug>` in `pages`). Lowercase, hyphens.
- Keys are the schema's field names exactly (kebab-case). The import validates against the
  code schema: keys it does not define are dropped, and a missing required field or a wrong type
  skips the whole file with a warning in the server log.
- **Quote dates and version-like strings** (`'2026-09-30'`, `'1.10'`): YAML turns unquoted ones
  into dates or numbers, which fail a string field.
- `status`: `published` (the default for files), `draft` or `archived`.
- `##` headings are sections, named by their text. Use the collection's declared `sections`
  for the parts the template designs, spelled as declared (`findSection` ignores case, a
  template's `sections['Problem']` lookup does not). Text before the first `##` is the
  lead. A `##` inside a fenced code block is code, not a heading. Start the body at `##` or
  the lead, never `#` — the page renders the title as `<h1>`.
- The body may reference a field as `@field-name`; krantho replaces it with the field's value
  when rendering. Avoid a literal `@word` that matches a field name.
- `meta-description` (120–155 characters) is the search snippet; it falls back to `description`.

## Drafts, publishing and preview

- A document has a **current version** (the newest, what Studio edits) and at most one
  **live version** (what pages, the sitemap and the JSON-LD read).
- **Saving never changes what visitors see** — in Studio, through the API, by the assistant,
  by an import into a collection or by a restore. Each save appends a new current version.
  The document's SEO configuration is the exception: it has no versions, so what enrichment and
  the editor's **Edit the graph** write there changes the live structured data at once, and the
  live meta description too when enrichment fills it there. A meta-description run also saves a
  version of the document. **Publishing** makes the current version live; unpublishing, archiving or deleting
  takes the page offline.
- `meta.liveVersion` tells you where a document stands: equal to `meta.version` → live;
  lower → **unpublished changes**; `null` → not published. `meta.status` follows from it
  (`published` while a version is live, else `draft`, or `archived`), and so does a `status`
  field the schema declares — sending `status` in a save does nothing.
- In the Studio editor, **Save draft** stores a new version and leaves the live page as it is.
  **Publish** — after a confirmation that lists what it refreshes — makes the saved version
  live. The header's status chip reads **Live**, **Unpublished changes** or **Not published**;
  its detail offers **Unpublish** and **Archive**.
- Documents created in Studio or API are drafts until published; files import as
  `published` unless they say otherwise — a file's `status` decides whether its import is live.
- The filesystem provider keeps no history: a save to a published file is live at once.
- **Open on site** in the editor opens the page with the current version (Next.js draft
  mode, or a ten-minute signed link on SvelteKit and Express, which needs one
  `KRANTHO_JWT_SECRET` on every instance when more than one serves the site).
- **History:** the editor lists every version, with a diff and one-click restore. A restore is
  a save: the restored content becomes the current version; publish it to make it live.
- **Locks:** while someone else holds a document's editing lock, saving, publishing,
  unpublishing, restoring and deleting it answer `423` with `lockedBy` and `expiresAt`. Wait
  for the lock to be released or to expire; do not work around it.
- With cached pages, a publish refreshes the pages that read the document, its lists and any
  page showing a changed global. A save changes nothing visitors see.
  `GET /api/content/<collection>/<slug>/publish-impact` says what a publish would refresh.

## How files reach the database

- **First boot:** the API route or the page loader — whichever a fresh deployment serves first —
  imports every collection directory into an empty database.
- **Development:** delete the data directory (`.krantho/` by default) and restart to re-import,
  or run with `KRANTHO_CONTENT_WATCH=true` to sync file edits into the database while the dev
  server runs. Set `KRANTHO_CONTENT_CACHE_ENABLED=false` to see changes on the next reload.
- **Later deploys:** files are not re-imported. To ship file changes into an existing database,
  write `content/manifest.json` with a higher version using `generateManifest` from
  `@krantho/server`. On start, krantho takes a checkpoint, imports new files, updates changed
  files the database has not edited since, and records a conflict — keeping the database copy —
  where an editor changed it. Otherwise, make the change in Studio or through the API.

## The REST API

Read `${CLAUDE_SKILL_DIR}/references/rest-api.md` before scripting. In short:

| Task | Request |
|---|---|
| List a collection | `GET /api/content/<collection>?status=published&limit=50` |
| Read a document | `GET /api/content/<collection>/<slug>` |
| Create (not live) | `POST /api/content/<collection>` `{ "slug", "fields", "body" }` |
| Save a new version (not live) | `PUT /api/content/<collection>/<slug>` `{ "fields", "body" }` |
| Publish the current version | `POST /api/content/<collection>/<slug>/publish` `{ "status": "published" }` |
| Unpublish, archive | the same, with `"draft"` or `"archived"` |
| Who is editing | `GET /api/locks` |
| History, restore | `GET …/<slug>/versions`, `POST …/<slug>/restore/<version>` |
| Search | `GET /api/content/search?q=<text>` |

Writes need the `editor` role (or `auth.mode: 'none'` on a development machine). The live
OpenAPI description is at `/api/openapi.json`, the reference at `/api/docs`.

A `PUT` **without** a `body` key merges the fields you send into the current ones and keeps the
body. Like every save it is not live until published.

## Style for content an agent writes

- Follow the project's voice; read neighboring documents first. Short sentences, concrete nouns,
  claims the reader can check.
- One idea per field. No HTML in fields; no layout instructions in content.
- Fill `description` and `meta-description` for every routed document.
- Save without publishing unless the user asked to publish, and say what you changed.

## Checks

- After writing files: start the server on an empty database (or with watch mode) and read the
  log — every skipped file is named with its validation errors.
- After an API change: `GET` the document back, check `meta.version` against
  `meta.liveVersion`, and open the page (or the preview) to see it render.
- Links to other documents use their paths (`/docs/<slug>`), and referenced slugs exist and are
  published.
