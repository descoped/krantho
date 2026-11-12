# The krantho REST API for content

## Contents

- Authentication
- Reading
- Creating
- Saving a new version
- Publishing and status
- What a publish refreshes
- History
- Deleting
- Locks
- Import and export
- Schema and collections
- The krantho CLI

Every krantho site serves its API under `/api` from the same app (the API route, or the Express
middleware). The generated OpenAPI 3.1 description is at `/api/openapi.json`, an interactive
reference at `/api/docs`. Examples use `$SITE` for the site origin (`http://localhost:3000`).

## Authentication

Check the mode first: `GET /api/auth/capabilities`.

| Mode | Reads | Writes |
|---|---|---|
| `none` (default) | open | open — a development machine only |
| `token` | open unless `auth.requireAuthForReads` | a session from the shared secret |
| `oidc` | open unless `auth.requireAuthForReads` | a session from the identity provider |

**Token mode.** Exchange the secret (`KRANTHO_API_TOKEN` on the server) for a session. The
session arrives as cookies, so keep a cookie jar:

```bash
curl -sS -c .krantho-cookies -H 'Content-Type: application/json' \
  -d "{\"token\":\"$KRANTHO_API_TOKEN\"}" "$SITE/api/auth/login"
# then send the cookies with every request
curl -sS -b .krantho-cookies "$SITE/api/auth/me"
```

The access cookie (`krantho_access` by default) is a short-lived JWT (15 minutes by default);
`POST /api/auth/refresh` renews it with the refresh cookie. The same JWT also works as
`Authorization: Bearer <jwt>`. Never print or commit the secret or the cookie file.

**OIDC mode.** Sign in through the browser at `/studio`; scripts use a session JWT as a Bearer
token.

**Roles.** `viewer` reads, `editor` creates, saves, publishes and unpublishes, `admin` also
deletes, restores versions, releases anyone's lock and manages users and settings. Token mode signs in with `auth.token.role` (`admin` by default).

## Reading

```bash
# One document: its current version, with meta.version, meta.liveVersion and meta.status
curl -sS "$SITE/api/content/docs/installation"

# A collection: { items, hasMore }; filter by status, page with limit/offset until hasMore is false.
# view=summary lists meta and fields alone, view=meta the meta alone (no view: whole documents)
curl -sS "$SITE/api/content/docs?status=published&view=summary&limit=50&offset=0"

# Several collections in one list (every collection when collections is absent)
curl -sS "$SITE/api/content?collections=docs,snippets&view=meta&limit=100"

# Search every collection: { items: [{ meta, fields, snippet? }], hasMore } (no snippet for a slug-only match)
curl -sS "$SITE/api/content/search?q=cache&limit=20"
```

A document is `{ meta: { collection, slug, locale, version, liveVersion, status, source,
changedBy, createdAt }, fields, body, html, sections }`. Add `?locale=<code>` for another locale
and `?resolve=true` to expand references. The API returns the **current** version (the newest);
pages show the **live** one:

| `meta.liveVersion` | Meaning |
|---|---|
| `=== meta.version` | live: visitors see the current version |
| `< meta.version` | unpublished changes: visitors see an older version |
| `null` | not published |

`meta.status` follows from it: `published` while a version is live, otherwise `draft`, or
`archived`. A `status` field the schema declares states the same. `sections` maps each `##`
heading to its rendered HTML (the first, when two share a heading).

## Creating

```bash
curl -sS -b .krantho-cookies -H 'Content-Type: application/json' \
  -d '{"slug":"caching","fields":{"title":"Caching","description":"How pages stay fresh.","area":"concepts","order":40},"body":"## Overview\n\nText."}' \
  "$SITE/api/content/docs"
```

- `slug` is required; `fields` is validated against the collection's schema (code fields plus
  runtime fields) — a failure answers `422` with each issue; `locale` is optional.
- The new document is not live: it is a **draft** until you publish it. A `status` in the
  request does not publish it. The answer is `201` with `{ slug, collection, version,
  liveVersion, message }`.

## Saving a new version

```bash
curl -sS -X PUT -b .krantho-cookies -H 'Content-Type: application/json' \
  -d '{"fields":{…all fields…},"body":"…the full body…","_version":7}' \
  "$SITE/api/content/docs/caching"
```

- Every save appends a new current version and **never changes what visitors see**, with or
  without `body`. Publish to make it live. A `status` in the request is ignored.
- With `body`, `fields` replaces the whole field set: read the document first, change what you
  need, and send every field. Without a `body` key, the fields you send are merged into the
  current ones and the body is kept.
- `_version` (optional) is the version you read; a newer one answers `409` instead of
  overwriting someone else's edit. Use it for every scripted edit.
- The answer carries `{ slug, collection, version, liveVersion, message }`.
- While another user holds the document's lock, the save answers `423` (see Locks).
- On the filesystem provider, which keeps no history, a save to a published file is live at
  once.

## Publishing and status

```bash
curl -sS -X POST -b .krantho-cookies -H 'Content-Type: application/json' \
  -d '{"status":"published"}' "$SITE/api/content/docs/caching/publish"
```

| `status` | Effect |
|---|---|
| `published` | the current version becomes live |
| `draft` | unpublish: nothing is live |
| `archived` | archive: nothing is live |

**Always send `status`**: without one the endpoint toggles between published and draft. Add
`?locale=<code>` for another locale (the default locale otherwise). Each call appends a version,
so the history shows who published when. The answer is `{ slug, collection, locale, status,
version, liveVersion, message }`. There is no scheduled publishing.

`POST /api/content/<collection>/bulk-publish` with `{ "slugs": [...], "locale": "en" }`
(`locale` optional) publishes the current version of each; the answer is `{ results, published }`
with `published: true` or an `error` per slug.

## What a publish refreshes

`GET /api/content/<collection>/<slug>/publish-impact?locale=<code>` (editor) answers, before you
publish, `{ collection, slug, locale, paths, lists, everyPageReading, caching, tags,
cachedEntries }`: the document's page, the lists that refresh, whether every page reading it
refreshes (a document with no page of its own, such as a global), `cache.pages`, the cache tags,
and — only when the instances share a database page cache (`cache.shared: 'database'`) and
caching is on — how many cached entries carry those tags (`null` otherwise).

## History

```bash
curl -sS "$SITE/api/content/docs/caching/versions"            # { versions }
curl -sS "$SITE/api/content/docs/caching/versions/5"          # one version
curl -sS -X POST -b .krantho-cookies "$SITE/api/content/docs/caching/restore/5"
```

Restore (admin) copies the old version into a new current version. It is a save: the live page
stays as it is until you publish.

## Deleting

`DELETE /api/content/<collection>/<slug>` takes the page offline and keeps the history.
`DELETE /api/content/<collection>/bulk` with `{ "slugs": [...] }` deletes several; a document
someone else holds the lock on is left in place and reported with `deleted: false`. Ask before
deleting anything.

## Locks

Studio takes a lock while an editor has a document open, and the API enforces it: while
another user holds an unexpired lock, saving, publishing, unpublishing, archiving, restoring and
deleting the document answer `423`:

```json
{ "error": "docs/caching is being edited by another user", "lockedBy": "editor:ada@example.com", "expiresAt": "…" }
```

- `GET /api/locks` lists every held lock (`collection`, `slug`, `locale`, `lockedBy`,
  `lockedAt`, `expiresAt`); `GET /api/content/<collection>/<slug>/lock` shows one.
- A lock expires after `content.lock.leaseMs`. Wait for it, or ask the person; do not release
  someone else's lock to get past it.
- `DELETE …/<slug>/lock` (editor) releases your own lock; only an admin can release another
  user's (otherwise `403`).
- `_version` still guards a save against a newer version.

## Import and export

- `GET /api/content/<collection>/export` (`?format=json` or `markdown`) and
  `POST /api/content/<collection>/import` move one collection. The import saves each document,
  so what visitors see changes only when you publish.
- `GET /api/export/bundle` and `POST /api/import/bundle` move the whole site. A bundle import
  takes a checkpoint first, saves every item and publishes those the bundle marks `published`.

## Schema and collections

`GET /api/collections` lists the collections, each with `sections`: the `##` sections its page
template designs, in order (empty when none). `GET /api/schema/<collection>` returns the
compiled schema (JSON Schema) — read it before writing fields.

## The krantho CLI

The repository has a Go CLI (`cli/`, built from source with `go build ./cmd/krantho`) over the
same API: `krantho auth login --token <secret>`, `krantho content list|get|create|set|publish|
unpublish|delete`, `krantho edit <collection> <slug>`, `krantho schema …`, `krantho snapshot …`.
It reads the site origin from `--api-url` or `KRANTHO_API_URL` (default `http://localhost:3000`).
It is not distributed as a binary yet.
