# QA Scope Map

Maps changed file paths to test targets. Used by `/ff-qa` to derive test scope from git diff.

## API Handlers → Endpoints

| File pattern | Endpoint | Method |
|-------------|----------|--------|
| `handlers/capabilities.ts` | `/api/capabilities` | GET |
| `handlers/content-lock.ts` | `/api/content/:c/:s/lock` | POST/DELETE/GET |
| `handlers/create-content.ts` | `/api/content/:c` | POST |
| `handlers/update-content.ts` | `/api/content/:c/:s` | PUT |
| `handlers/delete-content.ts` | `/api/content/:c/:s` | DELETE |
| `handlers/get-content.ts` | `/api/content/:c/:s` | GET |
| `handlers/list-collection.ts` | `/api/content/:c` | GET |
| `handlers/list-versions.ts` | `/api/content/:c/:s/versions` | GET |
| `handlers/get-version.ts` | `/api/content/:c/:s/versions/:v` | GET |
| `handlers/restore-version.ts` | `/api/content/:c/:s/restore/:v` | POST |
| `handlers/publish-content.ts` | `/api/content/:c/:s/publish` | POST |
| `handlers/search-content.ts` | `/api/search?q=` | GET |
| `handlers/export-content.ts` | `/api/content/:c/export` | GET |
| `handlers/import-content.ts` | `/api/content/:c/import` | POST |
| `handlers/snapshot-*.ts` | `/api/checkpoints` | GET/POST/DELETE |
| `handlers/media-*.ts` | `/api/media/*` | various |
| `handlers/seo-*.ts` | `/api/seo/*` | various |
| `webhooks.ts`, `handlers/webhook-*.ts` | `/api/webhooks/deliveries`, `/api/webhooks/deliveries/:id/retry` | GET/POST |
| `types.ts` | All endpoints | — |
| `create-api-handlers.ts` | All routes | — |

## Studio Pages → Screens

| File pattern | URL | What to verify |
|-------------|-----|---------------|
| `editor/*`, `ui/toast.tsx` | `/studio/site/:c/:s`, `/studio/new/:c`, `/studio/layout/:slug` | Header: modes, one status chip, lock chip, locale chips (+ creates a draft), Open on site, Save draft toast, Publish confirmation with the publish impact, no status select; Structure mode fields (label, required/optional, type pill, SEO use, help), media field, body; leave guard, kept work offered back, read-only under a foreign lock |
| `site/*`, `ui/data-table.tsx` | `/studio/site`, `/studio/site/:c` | Overview sections and Layout with the §3 columns; collection view filter, sort, shown-count, locale picker, bulk Publish/Delete confirmed, Export/Import round-trip; stacked cards below 640px |
| `pulse/*` | `/studio` | Header facts, key figures match the API, needs-attention rows open their screens, collections, recent activity; capability-off sources left out |
| `pages/SEODashboard.tsx`, `pages/seo/*` | `/studio/structure` and its tabs | SEO scores, previews |
| `media/*` (but the image editor) | `/studio/media` | Store named in the header; folder counts match the API, New folder; drop-zone upload; search; Bulk select with confirmed Delete; tiles (kind, name, dimensions, reference count); drawer: rename warning, alt text, Replace keeps the id, Copy markdown, Duplicate, Esc returns focus |
| `media/image-editor.tsx`, `media/use-image-editor.ts` | `/studio/media/:id/edit` | Crop, hotspot (click and arrow keys), Save, Reset, preview strip |
| `setup/*` | `/studio/setup/:tab` | Each tab says where its values come from; Collections & schema (code fields locked, runtime field add/edit/delete, Export as Zod), Locales (add, default, remove, coverage with Create draft), AI provider (providers from `@krantho/ai`, Save, Test, Run across the site with Force regenerate confirmed), Integrations (filters, Retry on a failed delivery, empty state), Checkpoints (create, restore confirmed), People (create, role, deactivate), Environment; read-only controls below admin |
| `shell/destinations.ts` | every route | Destinations, Setup tabs and routes visible/hidden per capability and role; hidden paths show Not found |
| `shell/nav.tsx`, `shell/site-tree.tsx` | every screen | Destinations in order, tree statuses and locks, collapse to 66px, drawer below 960px |
| `shell/command-palette.tsx`, `shell/palette-*.ts` | ⌘K anywhere | Commands per capability, search, arrow keys, Esc |
| `shell/breadcrumbs.tsx`, `shell/top-bar.tsx` | every screen | Trail follows the route |
| `routes.tsx` | every route | Route table; old paths render Not found |
| `lib/api.ts` | — | All screens (API client) |
| `lib/capabilities.ts` | — | Navigation conditional rendering |

## Persistence → Server Startup

| File pattern | What to verify |
|-------------|---------------|
| `persistence-sqlite/src/migrations/*.ts` | Server starts clean, correct schema version |
| `persistence-sqlite/src/sqlite-adapter.ts` | Content CRUD + versions |
| `persistence-postgres/src/*.ts` | Same (if Postgres test env available) |
| `persistence-fs/src/*.ts` | Filesystem reads work |
| `media-local/src/*.ts` | Media upload, list, edit, versioning |

## Core + Schema → Content Pipeline

| File pattern | What to verify |
|-------------|---------------|
| `core/src/content-resolver.ts` | Tier 1 resolver (no server test — unit test only) |
| `core/src/types.ts` | All content consumers |
| `schema/src/*.ts` | Schema endpoints, validation on import |
| `server/src/content-migration.ts` | Content imported on startup |
| `server/src/import.ts` | Auto-import with validation |

## UI Packages → Frontend Rendering

| File pattern | What to verify |
|-------------|---------------|
| `ui-react/src/*.ts` | Components render (test via examples) |
| `seo/src/*.ts` | SEO graph output |
| `examples/**` | Example app renders correctly |
