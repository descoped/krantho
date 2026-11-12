---
title: REST API
description: The REST API every krantho site serves under /api — authentication, roles, the endpoint groups, and the OpenAPI 3.1 spec and Scalar reference generated from the router.
area: reference
order: 40
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [installation]
related: [cli, configuration, studio, content-fields, media, seo-pipeline, package-server]
status: published
---

Every krantho site serves a REST API under `/api`. Studio is a client of it, and so is the [krantho CLI](/docs/cli). Your own scripts and services can use it the same way: list and edit content, publish, upload media, read SEO data.

The API comes from `@krantho/api`. You do not wire it route by route — the server package for your framework mounts all of it from one catch-all route:

{{sample:api-route}}

The API follows the [configuration](/docs/configuration) you pass there: `auth` decides who may call it, `media.provider` whether the media routes exist, `site.baseUrl` where the generated spec says the API lives.

## Your API's own reference

Two routes describe the API of the running site, and neither needs authentication:

| Route | What it serves |
|-------|----------------|
| `GET /api/openapi.json` | An OpenAPI 3.1 document generated from the site's router |
| `GET /api/docs` | A Scalar API reference that loads that document, where you can read and try the routes |

The spec covers every route this site registered at startup behind the authentication check — content, versions, schema, SEO and administration, plus the media routes when media is on, site preview when it is enabled, and the routes your plugins add. The [public routes](#public-routes) for signing in and capabilities are not part of it. Each operation is tagged by group (Content, Versions, Media, SEO and so on). The `servers` entry is `site.baseUrl`, and when `auth.mode` is not `none` the spec declares bearer and cookie authentication.

The spec names paths, methods and path parameters. Request bodies are declared as plain JSON objects and responses by status code only, so the sections below give the shapes you will use most. Every `GET` route also answers `HEAD`, with the same status and headers and no body.

> [!NOTE]
> The Scalar page fetches the spec from `site.baseUrl` + `/api/openapi.json`, and loads Scalar's script from the jsDelivr CDN. In local development, set `site.baseUrl` (or `KRANTHO_SITE_BASE_URL`) to the address you browse, such as `http://localhost:3000`, or the page will ask your production site for the spec.

## Authentication

`auth.mode` picks one of three modes.

| Mode | Reads | Writes |
|------|-------|--------|
| `none` (default) | Open | Open — every caller is treated as an admin |
| `token` | Open, unless `auth.requireAuthForReads` is on | A session from the shared secret `KRANTHO_API_TOKEN` |
| `oidc` | Open, unless `auth.requireAuthForReads` is on | A session from your OpenID Connect provider |

> [!CAUTION]
> `none` is for local development. In production the server logs a warning at startup when the mode is `none`.

A session is a signed JWT. The API looks for it first in the `krantho_access` cookie (the name follows `auth.session.cookiePrefix`), then in an `Authorization: Bearer <token>` header. In token mode you exchange the shared secret for a session with `POST /api/auth/login`; the answer sets the session cookies:

```bash
# Log in with the shared secret; the cookies land in cookies.txt
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"token":"'"$KRANTHO_API_TOKEN"'"}'

# Who am I?
curl -b cookies.txt http://localhost:3000/api/auth/me
```

The access token lives for `auth.session.accessTtlSec` (15 minutes by default). `POST /api/auth/refresh` exchanges the refresh cookie for a new pair; `GET /api/auth/refresh?returnTo=/path` does the same for a page navigation and redirects back, or to a new sign-in when the refresh token is no longer valid, and `POST /api/auth/logout` clears the session. In OIDC mode, `GET /api/auth/login/oidc` starts the sign-in and `GET /api/auth/callback` completes it — see [Studio](/docs/studio) for setting up a provider.

### Roles

Each user has roles: `admin`, `editor` or `viewer`, in that order of rank. A higher role includes the ones below it.

- **viewer** — reads. A caller with no session on an open API is an anonymous viewer.
- **editor** — creates, updates, publishes and unpublishes content, sees what a publish refreshes, imports documents into a collection, takes and releases their own editing locks, edits, replaces, duplicates and moves media and manages media folders, creates checkpoints, regenerates SEO files and opens site preview.
- **admin** — deletes content, restores versions, releases anyone's editing lock, edits runtime schema fields, SEO configuration and enrichment, exports and imports the whole-site bundle, deletes media in bulk and deletes media folders, restores and deletes checkpoints, and manages users, settings, version purging and the webhook delivery log, including retrying a failed delivery.

A few writes ask for a session but no particular role: uploading, registering and deleting a single media asset, and resolving a content migration conflict.

A request without the role it needs gets `403`; a write without a session gets `401`.

### Workload identity

A CI job calls the API without a stored secret when the platform that runs it issues identity tokens. The `auth.workload` section names the one issuer, the audience and the subjects the site trusts. A token that passes every check — an `RS256` signature from the issuer's own key set, `iss`, `aud`, expiry and a matching `sub` — gets an identity that can read `GET /api/changes` and `GET /api/migrations/conflicts`, and nothing else. Any other method or path answers `403`, and a failed token answers `401` with no detail. [Bring production edits back to git](/docs/content-round-trip) shows a GitHub Actions workflow.

### Public routes

These answer without a session in every mode:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/capabilities` | What this site supports: persistence, auth mode, features |
| GET | `/api/openapi.json` | The generated OpenAPI 3.1 spec |
| GET | `/api/docs` | The Scalar API reference |
| GET | `/api/auth/capabilities` | The auth mode and how to sign in |
| POST | `/api/auth/login` | Exchange the shared secret for a session (token mode) |
| POST | `/api/auth/refresh` | Rotate an expiring session |
| GET | `/api/auth/refresh` | Rotate the session and redirect back (`?returnTo=/path`), or to a new sign-in |
| GET | `/api/auth/login/oidc` | Start OIDC sign-in (optional `?returnTo=/path`) |
| GET | `/api/auth/callback` | Complete OIDC sign-in |
| POST | `/api/auth/logout` | End the session |
| GET | `/api/auth/me` | The signed-in identity |

## Content

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/content` | List documents across collections |
| GET | `/api/content/:collection` | List a collection's documents |
| GET | `/api/content/:collection/:slug` | One document |
| POST | `/api/content/:collection` | Create a document; 409 when the slug already has one in that locale |
| PUT | `/api/content/:collection/:slug` | Update a document |
| DELETE | `/api/content/:collection/:slug` | Delete a document |
| POST | `/api/content/:collection/:slug/publish` | Publish, unpublish or archive a document |
| GET | `/api/content/:collection/:slug/publish-impact` | What publishing a document would refresh |
| GET | `/api/content/search` | Search every collection (`?q=`); answers one page of matches with a snippet |

Both lists take `status`, `locale`, `sort`, `limit` and `offset` as query parameters, and `GET /api/content` also takes `collections` (a comma-separated list; every collection when absent, an unknown name answers `400`). They answer one page, `{ items, hasMore }`: page with `offset` until `hasMore` is `false`; there is no total. `view=summary` lists each document's `meta` and `fields` alone, and `view=meta` its `meta` alone, so a list that only shows rows reads a fraction of the data; without a `view` each item is the whole document, and `view=full` answers `400`. Search answers `{ items, hasMore }` as well, each item `{ meta, fields, snippet }`: the snippet is the text around the first match in the body, or in the fields when only they match, and an item that matched only on its slug has no snippet. A single document takes `locale`, and `resolve=true` resolves its reference fields. Each document has the shape described in [Content fields](/docs/content-fields): `meta`, `fields`, `body`, `html`, `sections`, the archived `contract`, authored `metadata`, shared-default `defaults`, and `repositoryBasis`.

The content API returns the current version of a document: the newest one, which is what Studio edits. Your pages read the live version through the content loader instead. `meta.version` is the current version and `meta.liveVersion` the version visitors see, or `null` when nothing is live:

| `meta.liveVersion` | What visitors see |
|--------------------|-------------------|
| equal to `meta.version` | The current version |
| lower than `meta.version` | An older version; the current one has unpublished changes |
| `null` | Nothing; the document is not published |

`meta.status` follows from the live version: `published` while a version is live, otherwise `draft`, or `archived` for an archived document. Publication state belongs in the system fields; do not declare an editable `status` field.

Create and update take JSON:

```bash
# Create a document; nothing is live yet
curl -b cookies.txt -X POST http://localhost:3000/api/content/pages \
  -H 'Content-Type: application/json' \
  -d '{"slug":"privacy","fields":{"title":"Privacy","description":"What krantho.com stores about its visitors."},"body":"## Scope\n\nThis page covers krantho.com."}'

# Publish it
curl -b cookies.txt -X POST http://localhost:3000/api/content/pages/privacy/publish \
  -H 'Content-Type: application/json' \
  -d '{"status":"published"}'
```

Fields are validated against the collection's schema; a document that does not pass gets `422` with the problems in `details`. An update may carry `_version` — the version you read. If someone saved a newer version in the meantime, the update answers `409` with `currentVersion` and `yourVersion` instead of overwriting their work. An update without a `body` key keeps the body and merges the fields you send into the current ones.

### Saving and publishing

Create and update save: each appends a new current version and never changes what visitors see. A `status` you send is not used — the document's status is decided by publishing. Both answer with the saved `version` and the `liveVersion`, so you can tell whether the document now has unpublished changes:

```json
{ "slug": "privacy", "collection": "pages", "version": 3, "liveVersion": 2, "message": "Updated" }
```

The publish route changes what visitors see of one document in one locale (`?locale=`, the site's default locale when absent). Its body's `status` says what to do:

| `status` | Effect |
|----------|--------|
| `published` | The current version becomes live |
| `draft` | Unpublish: nothing is live |
| `archived` | Archive: nothing is live, and the document is kept as archived |
| absent | Toggle between published and draft |

Each one appends a version, so the history shows who published or unpublished and when. It answers with the document's state afterwards:

```json
{ "slug": "privacy", "collection": "pages", "locale": "en", "status": "published", "version": 4, "liveVersion": 4, "message": "Published" }
```

`POST /api/content/:collection/bulk-publish` takes `{ "slugs": [...] }` and an optional `locale` (the default locale when absent), and publishes the current version of each document on its own; one that fails does not stop the rest. It answers `{ results, published }`, with `published: true` or an `error` per slug.

Create and update fire the `create` or `update` webhook, publishing fires `publish`, and unpublishing or archiving fires `update`; restoring fires `update` and changed imports fire `create` or `update`. Unchanged imports fire no save webhook. There is no scheduled publishing.

> [!NOTE]
> The filesystem adapter keeps no history, so it cannot hold a version ahead of the live one: a save to a published file is live at once. See [Persistence](/docs/persistence).

### What a publish refreshes

`GET /api/content/:collection/:slug/publish-impact?locale=` (editor) tells you, before you publish, which cached pages and data the publish would refresh:

```json
{
  "collection": "pages",
  "slug": "privacy",
  "locale": "en",
  "paths": ["/privacy"],
  "lists": ["pages"],
  "everyPageReading": false,
  "caching": "next-isr",
  "tags": ["k:d:pages:privacy", "k:c:pages"],
  "cachedEntries": 3
}
```

`paths` holds the document's page, empty when its collection renders no pages. `everyPageReading` is `true` for such a document, such as a global: every page that reads it refreshes. `caching` is `cache.pages`, and `tags` are the cache tags the publish refreshes. `cachedEntries` counts the cached pages and data that carry those tags; it is a number only when the instances share their page cache in the database (`cache.shared: 'database'`) and page caching is on, and `null` otherwise, because krantho does not know which pages a CDN or a single instance holds.

### Versions, locks and bulk operations

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/content/:collection/:slug/versions` | Version history of a document |
| GET | `/api/content/:collection/:slug/versions/:version` | One version |
| POST | `/api/content/:collection/:slug/restore/:version` | Restore a version as the newest one |
| POST | `/api/content/:collection/:slug/lock` | Take or renew the editing lock |
| GET | `/api/content/:collection/:slug/lock` | Who holds the lock |
| DELETE | `/api/content/:collection/:slug/lock` | Release the lock |
| GET | `/api/locks` | Every editing lock currently held |
| POST | `/api/content/:collection/bulk-publish` | Publish several documents |
| DELETE | `/api/content/:collection/bulk` | Delete several documents |

A restore is a save: the restored content becomes the current version, and the live version stays as it was. Publish it to make it live.

An editing lock is held by one user per document and locale (`?locale=` on each lock route), and expires after `content.lock.leaseMs`. While someone else holds an unexpired lock, saving, publishing, unpublishing, archiving, restoring and deleting the document answer `423`:

```json
{ "error": "pages/privacy is being edited by another user", "lockedBy": "editor:ada@example.com", "expiresAt": "2026-10-02T09:15:00.000Z" }
```

The holder, and anyone once the lock has expired or been released, can write. A bulk delete leaves such a document in place and reports it with `deleted: false` and the error, and meta-description enrichment skips it. Taking a lock someone else holds also answers `423`. An editor can release only their own lock; an admin can release anyone's, such as a lock left behind. Releasing another user's lock as an editor answers `403`. `GET /api/locks` (viewer) answers `{ locks }`, each with `collection`, `slug`, `locale`, `lockedBy`, `lockedAt` and `expiresAt`; expired locks are not listed.

### Import and export

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/content/:collection/export` | Export a collection as JSON, or Markdown with `?format=markdown` |
| POST | `/api/content/:collection/import` | Import documents into a collection |
| GET | `/api/export/bundle` | Export the whole site as one bundle |
| POST | `/api/import/bundle` | Import a whole-site bundle |

Importing into a collection saves each document, so what visitors see changes only when you publish it. Whole-site bundles also save drafts; publication is explicit.

### Edits since the last import

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/changes` | The published documents editors changed since the last content import, as the repository files that hold them (editor) |

Each item carries `action` (`add`, `edit` or `delete`), `collection`, `slug`, `locale`, `path` (relative to the content directory), `baselineChecksum`, `checksum` and `content`, the file to write (null for a delete). `baseline` names the commit and the content version the last import came from. The query takes `collection`, `limit` (up to 200) and `cursor`; a response with `next` has more. Answers `409` before the first import and `501` on a store that cannot compare. [Bring production edits back to git](/docs/content-round-trip) uses it.

### Schema, pages and site

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/collections` | The registered collections, with their `pages` flag and designed `sections` |
| GET | `/api/schema/:collection` | A collection's fields, from code and runtime |
| GET | `/api/schema/:collection/runtime` | Only the runtime fields |
| GET | `/api/schema/:collection/export` | The complete resolved contract and collection code, including metadata groups |
| PUT | `/api/schema/:collection/fields` | Add or update a runtime field; 400 when the definition does not hold, 409 when it changes a field's type |
| DELETE | `/api/schema/:collection/fields/:field` | Remove a runtime field |
| POST | `/api/validate` | Validate all content against its schemas |
| GET | `/api/page` | Resolve a URL path to a document (`?route=`) |
| GET | `/api/site-config` | The `site` configuration and the collections |

A runtime field can add to a collection but never change a field its code defines; that attempt answers `409`. Each collection in `/api/collections` lists the `##` sections its page template designs, in order, as the collection declares them — an empty array when it declares none. See [Templates](/docs/templates#designed-sections).

## Media

The media routes exist only when `media.provider` is set — see [Media](/docs/media).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/media` | List assets (`limit`, `offset`, `search`, `folder`, `tag`) |
| POST | `/api/media/upload` | Upload files as multipart form data |
| POST | `/api/media/register` | Register an asset hosted elsewhere by its absolute URL |
| GET, PUT, DELETE | `/api/media/:id` | Read, update or delete one asset |
| POST | `/api/media/:id/replace` | Replace the file and keep the id |
| POST | `/api/media/:id/duplicate` | Copy an asset |
| PUT | `/api/media/:id/move` | Move an asset to another folder |
| GET | `/api/media/:id/usage` | Documents that use an asset |
| GET | `/api/media/usage?ids=a,b` | Documents that use each of several assets, read in one pass |
| GET | `/api/media/:id/image` | An optimized image variant |
| GET | `/api/media/:id/image/info` | Image dimensions and format |
| GET, POST | `/api/media/folders` | List or create folders |
| PUT, DELETE | `/api/media/folders/:id` | Rename or delete a folder |
| PUT, DELETE | `/api/media/bulk` | Update or delete several assets |
| GET | `/api/media/tags` | Tags in use |
| GET | `/api/media/info` | The file store in use, and the library's file count, total size and each folder's count |

Pages embed the stable image URL, `/api/media/:id/image?preset=xl`. It redirects to a versioned URL that is cached for a year, so a replaced image shows on the next page view while unchanged images stay cached. `preset` is `xs`, `sm`, `md` (the default), `lg`, `xl` or `full`; `fmt` picks `avif`, `webp`, `jpeg` or `png`, and without it the format is negotiated from the browser's `Accept` header.

## SEO

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/seo/status` | Which generated SEO files exist |
| POST | `/api/seo/generate` | Regenerate the files the server can build |
| GET | `/api/seo/structured-data` | Generated JSON-LD |
| GET | `/api/seo/preview/:collection/:slug` | The JSON-LD of one document, in its locale (`?locale=`) |
| GET | `/api/seo/resolved/:collection/:slug` | Each structured-data property of a document, with its value and where it comes from |
| GET | `/api/seo/findings/:collection/:slug` | One document's SEO findings |
| GET | `/api/seo/findings` | The SEO of every published page |
| GET | `/api/seo/sitemap` | XML sitemap |
| GET | `/api/seo/sitemap.json` | JSON sitemap |
| GET | `/api/seo/robots.txt` | `robots.txt` naming the sitemap at `/sitemap.xml`, or the saved override |
| GET | `/api/seo/llms.txt` | `llms.txt` for AI assistants |
| GET | `/api/seo/indexnow/:key` | The IndexNow key file, served at `/<key>.txt` |
| GET | `/api/seo/catalog` | The Schema.org archetype catalog |
| GET, PUT, DELETE | `/api/seo/config` | All SEO configurations |
| GET, PUT, DELETE | `/api/seo/config/:id` | One SEO configuration |
| GET | `/api/seo/collection/:name/impact` | What a collection's configuration affects |
| POST | `/api/seo/enrich` | Start an AI enrichment job |
| GET | `/api/seo/enrich/status` | Progress of the enrichment job |

In `/api/seo/resolved/:collection/:slug`, each property carries a `scope` that says where its value comes from: `site`, `collection`, `route` (a URL-pattern configuration), `document`, `computed` (derived by krantho from the page and its history) or `linked` (a reference to another entity).

`GET /api/seo/findings` (viewer) checks every published page in the default locale, as search engines read it. It answers `{ pages, readers }`: per page its `collection`, `slug` and `path`, its findings counted per reader (`readers`, each `{ errors, warnings, info }`; title and meta description findings count under `page`, Schema.org vocabulary findings under `schema.org`), and the search `features` its entities can appear in. Each feature names the `reader`, `feature`, `type` and `nodeId`, its `status` (`active`, or `restricted` when the reader shows it only under `conditions`), whether the entity is `eligible`, and the properties it is `missing`; a feature a reader has retired is not listed. `readers` lists the site's active readers with their names. Without `@krantho/seo` the route answers `501`.

The sitemap lists the published version of each document in every collection except `globals`, leaving out pages marked `noindex`.

The robots.txt override is the `robotsTxt` of the site's SEO configuration, kept beside its entities, so no page's structured data carries it. An admin saves it with `PUT /api/seo/config/site`, sending the stored configuration with `robotsTxt` set, and removes it by saving the configuration without it; any other scope refuses `robotsTxt` with `400`. While it is set, `GET /api/seo/robots.txt` serves it as written.

`GET /api/seo/llms.txt` serves the snapshot saved through the assistant when there is one, otherwise a guide generated from the live pages. The `x-krantho-llms-origin` response header says which: `snapshot` or `generated`. A site serves `/llms.txt` by routing it to this path.

### Enrichment

Enrichment runs as a background job on the server and needs a language model configured under `llm` — see [The SEO pipeline](/docs/seo-pipeline). `POST /api/seo/enrich` (admin) takes `{ type, scope, collection, slug, force }`:

- `type` is `meta-descriptions` (the default) or `archetype`, for the Schema.org properties of the document's types.
- `scope` is `all`, `collection` or `item`. Without it, a `slug` means `item`, a `collection` alone means `collection`, and neither means `all`. A `collection` scope enriches only that collection's documents, and an `item` only the document with that slug in that collection.
- `force: true` writes over values already set: for `archetype` the Schema.org properties, for `meta-descriptions` the document's description field, but never a description held in its SEO configuration. Without it, enrichment fills only what is missing.

It answers `202` with `{ jobId, status, type, totalItems }`, or `200` with `jobId: null` when the scope has nothing to enrich. An unknown scope, a collection or item scope without a configured collection, an item without a slug, or a language model that cannot be created answers `400`; a second job while one runs answers `409`. Poll `GET /api/seo/enrich/status?jobId=` for the progress and each document's outcome.

Enrichment saves a declared description field or sharing description, and Schema.org properties in document metadata, as versioned drafts. Existing values remain unless force is requested. A Schema.org property is written only when the page states it: the model quotes the passage that supports each value, and a value whose quote is not in the page, or whose numbers and words are mostly not, is left empty. These changes need publication before visitors see them. Document locks and revision checks apply to both enrichment types.

## Administration

| Method | Path | Purpose |
|--------|------|---------|
| GET, POST | `/api/checkpoints` | List or create checkpoints of the content store |
| GET, DELETE | `/api/checkpoints/:version` | Read or delete a checkpoint |
| POST | `/api/checkpoints/:version/restore` | Restore the content store to a checkpoint |
| GET, POST | `/api/users` | List or create users |
| GET, PUT, DELETE | `/api/users/:id` | Read, update or delete a user |
| GET, PUT | `/api/users/:id/permissions` | A user's permissions |
| GET, PUT | `/api/settings/locales` | The site's locales, and which configured ones are active |
| GET, PUT, DELETE | `/api/settings/llm` | Language model settings |
| POST | `/api/settings/llm/test` | Test the language model connection |
| GET | `/api/versions/stats` | Version storage statistics |
| POST | `/api/versions/purge` | Purge old versions, keeping `content.versions.keep` per document |
| GET | `/api/translations/status` | Translation coverage across locales |
| GET | `/api/webhooks/deliveries` | Webhook delivery log |
| POST | `/api/webhooks/deliveries/:id/retry` | Send a failed delivery again |
| GET | `/api/migrations/status` | Database schema version |
| GET | `/api/migrations/conflicts` | Unresolved content migration conflicts (editor) |
| POST | `/api/migrations/conflicts/:id/resolve` | Resolve a conflict (admin) |

`GET /api/settings/locales` answers `{ defaultLocale, configuredLocales, supportedLocales, source }`. `defaultLocale` is always `site.defaultLocale` from the configuration, and every request that names no locale uses it. `configuredLocales` is `site.supportedLocales`; `supportedLocales` are the active ones, either those an admin saved or the configured list. `PUT` (admin) takes `{ "supportedLocales": [...] }` and answers `400` with the reason when the list is empty, repeats a locale, names a locale the configuration does not list, or leaves out the default locale. The default locale is changed only in the configuration.

`POST /api/webhooks/deliveries/:id/retry` (admin) puts a failed delivery — one that used all its attempts without being delivered — back in the queue and sends it again at once, signed afresh, to the configured webhook with the same URL. It answers `202` with `{ delivery }`, now pending; the delivery log then shows whether it was delivered or failed again. A delivery that is not failed, or whose URL no configured webhook has any more, answers `409`, and a site that logs no deliveries answers `404`.

## Site preview

When the site renders drafts for editors, `GET /api/preview?collection=&slug=` sends an editor to the document's page in preview. `@krantho/server-next` always turns it on, with Next.js draft mode. SvelteKit and Express sites turn it on by passing `sitePreview: 'signed-url'` to the handler, which sends the editor through a short-lived signed link. `/api/capabilities` reports the mode as `features.sitePreview`, and Studio's Live mode and **Open on site** use the route when it is enabled. The route takes no locale: a preview shows the document's version in the site's default locale. See [Studio](/docs/studio), and [Live editing](/docs/live-editing) for the marks Studio's Live mode reads from a preview.

## Plugins

Plugins add their own routes under `/api/plugins/<plugin name>/`, and `GET /api/plugins` lists the loaded plugins with their routes, Studio pages and field types. Plugin routes appear in the generated spec like any other.

## Errors

An error answers with a status code and a JSON body:

```json
{ "error": "Validation failed", "details": [] }
```

| Status | Meaning |
|--------|---------|
| `400` | The request is malformed, such as a body that is not a JSON object |
| `401` | A session is required, or it has expired |
| `403` | The session lacks the role this route needs, or an editor tried to release another user's lock |
| `404` | The collection, document, version or asset does not exist |
| `409` | A conflict: a newer version exists, a job is already running, or a code-defined field was targeted |
| `422` | The fields failed the collection's schema |
| `423` | Another user holds the document's editing lock |
| `501` | The persistence backend does not support this operation |
