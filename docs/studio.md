# @krantho/studio

A pre-built React SPA for managing krantho content. Provides Pulse (what needs the editor, and the site's key figures), the Site overview and collection views, content editor with markdown preview, media library with image editing, SEO tools with a JSON-LD graph browser, version history, webhook delivery logs, translation management, user administration, runtime schema editing, and an optional assistant chat panel. Built with Vite and served as static assets by all server packages (Next.js, SvelteKit, Node/Express), making it framework-agnostic at runtime.

## Context

Every krantho site needs a way to create, edit, and publish content without touching markdown files directly. The Studio package provides this as a standalone SPA that any server framework can mount at `/studio`. It communicates with the server exclusively through a REST API at `/api/*`, so Studio is decoupled from the backend implementation.

## Rationale

- **Separate package**: Studio is a React SPA regardless of what framework the site uses. Keeping it in its own package means SvelteKit sites get the same Studio experience as Next.js sites.
- **Private package**: Distributed as pre-built static assets (`dist/`), not published to npm. Server packages bundle the dist directory.
- **React + React Router**: Chosen for the mature form handling and routing ecosystem needed by a CMS Studio. The host site's framework is irrelevant since Studio is a separate SPA.
- **No direct persistence imports**: All data flows through `/api/*` endpoints. Studio has zero knowledge of whether content lives on the filesystem, in SQLite, or in Postgres.
- **Vite build**: Produces a single-page app with hashed assets. The server serves `index.html` for all `/studio/*` routes and static assets from `/studio/assets/`.

## Architecture

### Source Layout

Studio's source (`packages/studio/src`) is organised by destination. Each screen's folder holds its components, its pure models (`*-model.ts`, unit tested) and its data hooks (`use-*.ts`), and each component imports its own stylesheet from beside it. Filenames are lowercase with hyphens; the graph browser and the assistant (`components/`) and the sign-in page (`pages/`) keep their component names.

```
src/
├── main.tsx                    # Mounts Studio (routes.tsx) with the bundled fonts, tokens.css and base.css
├── routes.tsx                  # Route table; Studio: AuthProvider → CapabilitiesProvider → sign-in gate → router
├── styles/
│   ├── tokens.css              # Studio's tokens for both themes and the prefers-color-scheme fallback — the only colour literals
│   └── base.css                # Reset, type, the focus ring, reduced motion
├── shell/                      # The frame around every screen
│   ├── app-shell.tsx           # Navigation, top bar, the screen's Suspense boundary, toasts and the assistant
│   ├── destinations.ts         # The one table of destinations and Setup tabs: path, label, icon, visible(caps, viewer)
│   ├── nav.tsx, nav-footer.tsx # Navigation (expanded, collapsed, off-canvas drawer) and its footer
│   ├── site-tree.tsx           # Collections and their documents with status dots and locks
│   ├── top-bar.tsx, breadcrumbs.tsx
│   ├── command-palette.tsx     # ⌘K: palette-commands.ts, palette-state.ts, publish-all-modal.tsx
│   ├── theme-switch.tsx
│   └── not-found.tsx
├── ui/                         # Primitives, each with its CSS beside it: button, chip, status-dot, meter, tabs,
│                               # modal, toast, data-table (stacked cards below 640px), empty-state
├── pulse/                      # Pulse: pulse-page.tsx, header, key figures, needs attention, collections, recent activity;
│                               # pulse-model.ts, pulse-attention.ts, pulse-activity.ts, pulse-sources.ts
├── site/                       # Site: site-overview.tsx, collection-view.tsx (toolbar, selection bar, bulk and import modals),
│                               # site-cells.tsx, site-columns.tsx, site-model.ts, site-sources.ts, transfer.ts
├── editor/                     # The editor
│   ├── editor-page.tsx         # Loads the document, owns the draft, lock and kept work, and lays out header, canvas and panel
│   ├── editor-header.tsx       # Modes (modes.ts), status, lock and locale chips, Open on site, Save draft, Publish
│   ├── live-mode.tsx           # Live mode: live-marks.ts, live-sections.ts, live-editing.ts, live-overlay.tsx, live-preview.ts, …
│   ├── structure-mode.tsx      # Structure mode: field-row.tsx, field-inputs.tsx, tag-input.tsx, reference-input.tsx,
│   │                           # media-field.tsx, custom-fields.tsx, markdown-body.tsx
│   ├── globals-editor.tsx      # A global's Where it appears
│   ├── data-mode/              # Data mode: search and social previews, JSON-LD graph, checks, rich results,
│   │                           # findings, enrichment and history cards
│   ├── side-panel/             # The side panel: metadata, search and sharing, page & sections, reach, field and section views
│   └── use-*.ts                # Document, draft, autosave (kept-work.ts), edit lock, leave guard, actions, locale versions
├── structure/                  # Structure: structure-page.tsx, header, and the Graph, Scopes & archetypes,
│                               # Rich results and Crawlers & assistants tabs; Fill what's missing (fill-job.ts)
├── media/                      # Media: media-page.tsx (folders, drop zone, toolbar, grid, details drawer),
│                               # image-editor.tsx, media-picker.tsx
├── setup/                      # Setup: setup-page.tsx and the Collections & schema, Locales, AI provider,
│                               # Integrations, Checkpoints, People and Environment tabs
├── components/
│   ├── ConfirmDialog.tsx       # The assistant's confirmation dialog
│   ├── assistant/              # Assistant launcher state, panel, messages, activity, diffs, proposals, composer
│   └── jsonld-graph/           # The graph browser (Data mode's Edit the graph, Structure's Site entities)
│       └── inputs/             # Typed property editors (text, number, date, url, select, array, object array)
├── pages/
│   └── Login.tsx               # Sign-in, shown by routes.tsx when sign-in is required and no session exists
├── hooks/                      # Shared hooks (see Hooks)
└── lib/
    ├── api.ts                  # Barrel re-export of the API functions and types
    ├── api-client.ts           # Base request/requestText wrappers, ApiError class, localeQuery
    ├── api-types.ts            # TypeScript interfaces for API responses
    ├── api-content.ts          # Content, publishing and its impact, bulk ops, schema, webhook deliveries and Retry, translations
    ├── api-locks.ts            # Edit locks: take, renew, release, list
    ├── api-versions.ts         # A locale version's history: list, read, restore
    ├── api-media.ts            # Media CRUD, folders, tags, usage, upload, replace, duplicate
    ├── api-seo.ts              # SEO preview, config, catalog, findings, enrichment, sitemap, robots, llms.txt
    ├── api-checkpoints.ts      # Checkpoints: list, create, restore, delete
    ├── api-users.ts            # User accounts: list, create, update, delete
    ├── api-settings.ts         # Site config, locale settings, LLM settings
    ├── api-assistant.ts        # Assistant client: status, SSE chat, confirm (imported by the panel only)
    ├── enrichment-job.ts       # runEnrichmentJob: start an enrichment step and poll it to its end
    ├── served.ts               # fetchServed: read a site path as the site serves it (same origin, no credentials, never throws)
    ├── locales.ts              # The site's locales (GET /api/settings/locales): loadLocales, hasSeveralLocales
    ├── fetch.ts                # isNotFound, errorMessage
    ├── auth.tsx                # AuthProvider context, useAuth hook, authFetch with 401 refresh
    ├── capabilities.ts         # RuntimeCapabilities context, useCapabilities, isEnabled, fetchCapabilities
    ├── edit-buffer.ts          # Immutable edit buffer for the graph browser
    ├── jsonld-graph.ts         # Graph model: parseGraph, layout and property classification
    ├── import-diff.ts          # JSON-LD import diff engine
    ├── catalog-offer.ts        # Which catalog types a picker offers (a retired feature's only while chosen) and its tag
    ├── seo-checks.ts           # SEO quality checks (title length, meta description, body, headings, links)
    ├── seo-field-resolver.ts   # Admin wrappers around @krantho/seo-shared field resolution
    ├── format.ts               # formatSize, formatDateTime, formatShortDateTime, collectionLabel, singularLabel
    ├── paths.ts                # Studio's route paths: editorPath, collectionPath, newDocumentPath, …
    ├── document-status.ts      # The status model: live, unpublished changes, not published
    ├── findability.ts          # Meta-description coverage and structured-data validity, shared by Pulse and Site
    ├── source.ts               # Optional data sources: read, off or failed — never a zero by default
    ├── publish-ahead.ts        # Find and bulk-publish every draft ahead of live
    ├── locks.ts                # The signed-in user's lock identity and a lock holder's name
    ├── media-urls.ts           # Media preview and stable image URLs, and a file's markdown
    ├── export-helpers.ts       # JSON-LD export: exportAsJsonLd, exportAsScriptTag, downloadFile
    ├── assistant-chat-state.ts # Assistant chat reducer and the text-only history it sends
    └── assistant-markdown.ts   # renderAssistantMarkdown: sanitized markdown without images
```

Colour lives only in `styles/tokens.css`; `test/no-colour-literals.test.ts` fails on a hex, `rgb(` or `hsl(` literal anywhere else in `src`, except the one marked block in `editor/data-mode/serp-preview.css`, which imitates a search engine's own colours. `test/studio-css.test.ts` keeps `styles/` to those two global sheets.

### Routing

All routes are nested under the `/studio` basename. `routes.tsx` holds the route table; `main.tsx` only mounts it. The root route renders the shell (`shell/app-shell.tsx`): the navigation, the top bar with breadcrumbs and the ⌘K palette button, a `Suspense` boundary for lazy-loaded screens, and the assistant panel when enabled.

`shell/destinations.ts` is the one table of the five destinations (Pulse, Site, Structure, Media, Setup) and the Setup tabs, each with a `visible(caps, viewer)` predicate. It drives the navigation, the Setup tabs and the routes: a destination or tab the site or viewer does not have is not registered, so its paths render the not-found screen, which links to Pulse, and the breadcrumbs read only "Not found". Each Setup tab keeps the gate its screen had before Studio; only People changed (#265). Controls the API refuses a role are read-only for that role.

| Route | Screen | Shown when |
|-------|--------|------------|
| `/studio` | Pulse | always |
| `/studio/site` | Site overview | always |
| `/studio/site/:collection` | Collection view | always |
| `/studio/site/:collection/:slug` | Editor (a document whose slug is `new` included); `?mode=structure` or `?mode=data` opens a mode | always |
| `/studio/new/:collection` | Editor, new document | always |
| `/studio/layout/:slug` | Editor for a global | always |
| `/studio/structure` | redirects to `/studio/structure/graph` | `seo` |
| `/studio/structure/graph`, `scopes`, `rich-results`, `crawlers` | Structure's tabs: Graph, Scopes & archetypes, Rich results, Crawlers & assistants | `seo` |
| `/studio/media`, `/studio/media/:id/edit` | Media, the image editor | `media` |
| `/studio/setup` | redirects to the first Setup tab the viewer has | any Setup tab |
| `/studio/setup/collections` | Collections & schema; `?collection=<name>` opens a collection's fields | `runtimeSchema`, and an admin when sign-in is required |
| `/studio/setup/locales` | Locales, plus translation coverage when the site has several locales | every role; read-only below admin |
| `/studio/setup/ai` | AI provider and Run across the site | every role; read-only below admin |
| `/studio/setup/integrations` | Webhook deliveries | `webhookDeliveries` |
| `/studio/setup/checkpoints` | Checkpoints | `checkpoints` |
| `/studio/setup/people` | People | an admin, auth mode `token` or `oidc` |
| `/studio/setup/environment` | the capabilities `/api/capabilities` reports | always |

### Chunk Splitting

Every page is loaded via `React.lazy()` with `Suspense` fallbacks, so the initial bundle contains only the shell (navigation, top bar, palette, auth). Vite's `manualChunks` configuration splits vendor dependencies into isolated chunks:

| Chunk | Contents | Loaded by |
|-------|----------|-----------|
| `vendor-react` | react, react-dom, scheduler | Every page |
| `vendor-router` | react-router-dom | Every page |
| `vendor-reactflow` | @xyflow/react, dagre | Canvas view in graph browser |
| `vendor-markdown` | marked, dompurify | The editor |
| `vendor-media` | react-image-crop | Image editor page |
| `vendor-diff` | react-diff-viewer | Data mode's history diff |

The assistant panel is a lazy chunk of its own (with its styles and the SSE parser from `@krantho/ai`), loaded the first time a user opens it. With `features.assistant` absent the main chunk carries only the provider and the launcher, and nothing assistant-related loads.

## Assistant

An optional chat panel for content, SEO and AEO work, shown only when `/api/capabilities` reports `features.assistant` (the server's `assistant.enabled`). What the assistant can do, and its limits, are in [assistant.md](assistant.md).

### When it appears

- `features.assistant` absent: no launcher, no provider, no chunk loaded.
- Present, but nobody signed in (token or OIDC auth, an anonymous reader browsing a public Studio): no launcher.
- A signed-in user below `assistant.role` sees the launcher; the panel shows the server's 403 message with the composer disabled (Studio does not know the configured role).
- No LLM configured: the panel shows the reason from `GET /api/assistant`, with a link to Setup › AI provider for admins, and the composer disabled.

### Launcher and panel

The launcher is a button in the navigation footer, above the theme switch ("Assistant", with `aria-expanded` and `aria-controls`). The panel is a non-modal `<aside aria-label="Assistant">` fixed to the right edge (`min(420px, 100vw)`, full width under 640px); the page behind it stays usable, with no focus trap. It mounts on first open and stays mounted, hidden when closed, so the conversation survives navigation and closing; it resets on reload.

- **Header**: "Assistant", the AI's plain name and its model as `GET /api/assistant` reports them ("Claude · claude-haiku-4-5"), and, with more than one AI on, a select of them by name (`providers`): the pick is remembered in this browser, sent as `provider` with each message, and ignored once that AI is no longer on -- **New conversation** (it asks first while a reply streams or a proposal is open) and Close.
- **Log**: each user and assistant message, the assistant's text rendered as sanitized markdown as it streams. Under each reply, one entry per tool: its label with a spinner while it runs, then its summary with a status icon, links to each document it touched (the editor, with `?locale=`), **Show changes** with the diff, SEO findings by severity, and text to use by hand as copyable blocks. The log follows the stream unless the user scrolled up.
- **Proposals**: a card per pending action with its title, the diff open, the expiry time, and **Confirm** (red for a delete) and **Cancel**. The result replaces the buttons — "Published pages/about (v8)", or the server's refusal such as "Changed since the proposal". Several proposals in one reply get **Confirm all**, which confirms them in order and stops at the first failure.
- **Composer**: a labelled textarea ("Ask the assistant"); Enter sends, Shift+Enter starts a new line. While a reply streams, Send becomes **Stop**, which aborts the request; the server stops at its next step.
- **Errors**: an entry with `role="alert"` and the server's message; a model without tool use, no provider configured and no credential add a Setup › AI provider link for admins.

### State

`useAssistantChat()` holds the conversation in a reducer (`assistant-chat-state.ts`) and loads `GET /api/assistant` for the model line and the limits. Each message sends the history as text only — the assistant's text plus one line per action it took (`[Created draft pages/pricing (v1)]`) — trimmed to the server's `limits.maxHistoryMessages` and `limits.maxInputChars`, starting with a user message. The outcome of every proposal resolved since the last message goes with the next one (`Confirmed: … — …`, `Confirmation failed: … — …`, `Cancelled: …`), so the model never takes a refused or cancelled proposal for done. The document the user is editing (`/site/:collection/:slug` or `/layout/:slug`, and `?locale=`) is sent as `context`. Unresolved proposals stay confirmable until they expire.

`api-assistant.ts` reads the chat with `parseServerSentEvents` from `@krantho/ai`, and sends the chat and the confirm through `authFetch`, so an expired access token is refreshed once — a proposal is often confirmed minutes after the chat. It is imported by the panel directly, not re-exported from `api.ts`, which would pull it into the main chunk.

### Keyboard and screen readers

- The launcher is reachable by Tab; opening the panel moves focus to the composer (when the assistant can take a message). Escape inside the panel closes it and returns focus to the launcher. There is no global shortcut.
- The log is `role="log"` with `aria-live="polite"`. A streaming reply is `aria-busy="true"` until it finishes, so a screen reader announces the finished message once rather than every fragment. A proposal never takes focus; the log announces "Needs your confirmation".
- Diffs mark insertions and deletions with visually hidden "added"/"removed" labels as well as colour and strike-through.
- The panel uses Studio's theme tokens (light and dark follow `data-theme`), `--focus-ring` for focus, and turns off its spinner animation and smooth scrolling under `prefers-reduced-motion: reduce`.

## Pages

### Pulse

The first screen (`pulse/pulse-page.tsx`), answering "what needs me?". Every figure is counted from an API source; a source the site has turned off is left out, and one that could not be read says so — never a zero by default.

- **Header**: the site's name (display face), its domain, the framework hosting the API (`framework` from `/api/capabilities`) and the page-cache mode (`cache.pages` from `/api/site-config`), with **New page** for editors when a collection renders pages.
- **Key figures**: live pages, with how many have unpublished changes; meta-description coverage — set, falling back to `description`, missing — over the documents of page-rendering collections in the default locale; and, when `seo` is on, live pages whose structured data no reader finds an error in, with the Schema.org types most of them state (`GET /api/seo/findings`). There is no cached-pages figure: no API returns a site-wide count of cached pages.
- **Needs attention**: a row per thing to act on — failed webhook deliveries (with `webhookDeliveries`; Open log), documents someone else holds the edit lock of (Open), documents with unpublished changes in any locale (Review), pages with neither a meta description nor a description (Fix), and collections with documents missing a locale version (when the site has several locales; Locales). Each row has a tinted icon, a title, a detail and its action; at most five of a kind, the rest counted. With nothing to act on it reads "Nothing needs you right now".
- **Collections**: each collection but the Layout's globals, with its URL path and its documents counted as live, draft ahead and draft, opening the collection view.
- **Recent activity**: the most recently saved documents, newest first, with an event read from their versions — Created (version 1, never published), Published (the live version is the current one), Draft saved (otherwise) — and when.

The derivations are pure (`pulse-model.ts`, `pulse-attention.ts`, `pulse-activity.ts`); `pulse-sources.ts` reads the sources in parallel. While it loads, placeholders hold the content's size, so nothing jumps.

### Site

Two screens in `site/`, both tables built on `ui/data-table.tsx` — a real `<table>` with column headers, the primary column as each row's header (`th scope="row"`), and a sticky header row that, below 640px, restyles each row as a stacked card whose cells are labelled with their column (the same DOM). The page scrolls the document; `html` has `scroll-padding-top: var(--sticky-offset)` (the top bar plus a table's header row), so a focused row never scrolls in under them. Inputs, selects and text areas — the Site controls and the sign-in token field — draw their boundary in `--color-border-input`, which keeps 3:1 against every surface and background in both themes (WCAG 1.4.11).

- **Overview** (`/site`, `site/site-overview.tsx`): one section per collection — its label (opening the collection view), its URL path (`collectionBasePath`) and its documents counted as live, draft ahead and draft — then **Layout**, the globals, each "no URL, shared" and "read by every page", opening `/layout/:slug`. The columns are Page (status dot, title opening the editor, and the URL — a link to the live page in a new tab, `site.baseUrl` plus `documentPath()` from `@krantho/core/cache-tags`, plain text while nothing is live), Status, Findability, Locales and Updated. Everything is read in the site's default locale. Studio reads the site's locales in one place, `GET /api/settings/locales` (the configuration's default locale and the active locales, which Setup › Locales may narrow to a subset of the configured ones, `lib/locales.ts`): the Site screens, Pulse, the site tree, Publish all drafts ahead and the editor's locale chips all follow it, and "several locales" means it lists more than one.
- **Collection view** (`/site/:collection`, `site/collection-view.tsx`): the whole collection read in one locale (`fetchAllDocuments` over `GET /api/content`, page by page; a Locale picker when the site has several), filtered by status (All, Live, Unpublished changes, Not published, each with its count) and sorted by last update or slug, client-side; the shown-count reads "N of M". The filter, sort and locale live in the URL (`?status=`, `?sort=`, `?locale=`). The columns are Slug (opening the editor, with the page URL), Status, Live (the live version, `v4`, or "—"), SEO, Locales and Updated. Editors get row checkboxes, Select all shown and a selection bar with **Publish** and, for admins, **Delete**, both in the chosen locale; each opens a confirmation naming the count and the locale, then shows what changed and what was left. A bulk action that ran clears the selection, so on close focus goes to the listing rather than to the selection bar it removed. **Export** downloads the collection in the chosen locale as `<collection>-<locale>.json`; **Import** (editors) takes pasted JSON or a chosen file — what Export writes round-trips — and shows each document's result. **New <singular>** opens `/new/:collection`. An unknown collection, or the globals, renders Not found.
- **Findability / SEO**: the meta description — own, falling back to `description`, or missing (the classification Pulse counts, `lib/findability.ts`) — and, when `seo` is on, whether `GET /api/seo/findings` reports the live page's structured data valid; a page not yet live, or a locale other than the default, reads as not checked, and failed findings read as unavailable.
- **Locales**: the document's locale versions and the missing ones from `GET /api/translations/status`, shown only when the site has several locales.
- **Updated**: when the current version was saved (`meta.createdAt`).

Bulk actions and imports reload the list and tell the shell (`useContentChanged()`), so the site tree shows the new statuses at once.

### Editor

`editor/editor-page.tsx`, mounted at `/site/:collection/:slug`, `/new/:collection` and `/layout/:slug` (a global). `?locale=` opens another locale's version; when the document has none there, a notice says which version is being edited. Another document or locale opens a fresh editor with its own draft, lock and kept work.

- **Header** (`editor-header.tsx`): one row that wraps; a chip's detail (`header-popover.tsx`) opens under it and is moved inward to stay 16px clear of the viewport's edges, at a phone's width too. The mode switcher is a tab list of the modes that exist (`modes.ts`): Live, Structure and Data for a document, Fields and Where it appears for a global (a global has no page, so no Live or Data mode and no Open on site); a later mode is added by adding its entry. The open mode is in the address (`?mode=`, `modeFromParam`; a mode the editor's kind does not have opens its first — Live for a document, except a new one, which has no page until it is saved and opens in Structure): switching replaces the history entry and keeps `?locale=`, and the leave guard lets it through (`leavesDocument`), so unsaved work stays in the form across modes. Then one **status chip** from the status model (Live, Unpublished changes, Not published); it opens its detail — "Draft v5 · live is v4", the edit lock and the last save — with **Unpublish** and **Archive** when the page can be taken off the site, and **Restore to draft** for an archived page, each confirmed first. Each is recorded as a new version, as the confirmation says, so each waits until the form's work is saved: with unsaved changes, restored work made on another version, or an unanswered version conflict, they stay focusable and say why ("Save the draft first", "Answer the version conflict first"). A **lock chip** appears only while someone else holds the lock ("<email> is editing"), its detail saying until when. **Locale chips**, when the site has several locales, open each version; a missing locale shows "+", and creating it copies the default locale's fields and body into a new draft with its own history (`POST /api/content/:collection` with the locale). Creating reads the version again first and refuses when it exists by now, or when it cannot be checked. A locale still being checked, or one that could not be, is a plain chip — never a link that turns into a button under focus — and when a refused create's dialog closes, focus goes to that locale's chip, or to the Locales group when the chip cannot take it. **Open on site**, for a document with a page: the draft through `/api/preview` when the `sitePreview` capability is on and the role may edit, otherwise the live page (`site.baseUrl` plus `documentPath()`), and nothing while no version is live. **Save draft** stores a new version (`_version`: the version the work is based on, for optimistic concurrency) and toasts "Draft saved · v<n>. The live page is unchanged until you publish."; when reading the saved document back fails, the version the save answered with is the new base, so the next save does not conflict with it; it reads "Saving…" while busy, and whatever is typed meanwhile stays in the form, unsaved. **Publish** confirms "Publish <slug> v<n>?" and toasts that version as live, naming the new version the API records the publication as ("Published pricing · v3 is live, recorded as v4.") with what visitors see now and what it refreshes, exactly as `GET /api/content/:collection/:slug/publish-impact` reports it (the page paths, the collection's lists, every page reading a global, and the cached-entry count only when the API knows it). There is no status select. Save draft and Publish say why when they cannot act (no unsaved changes, unsaved changes to save first, already live, someone else editing) and stay focusable.
- **Live mode** (`live-mode.tsx`, `live-marks.ts`, `live-sections.ts`, `live-editing.ts`, `live-geometry.ts`, `live-focus.ts`, `live-attach.ts`, `live-overlay.tsx`, `live-in-place.ts`, `live-in-place-editor.tsx`, `live-markdown-editor.tsx`, `live-placeholders.tsx`, `live-empty.tsx`, `live-frame-state.ts`, `use-live-frame.ts`, for a saved page of a collection that renders pages — a document of a `path: false` collection has Structure and Data only, and `?mode=live` opens Structure): the site's own draft preview of the page in a same-origin frame, titled "Draft preview of <collection>/<slug>". Studio never renders the site: the frame loads the preview entry the server package serves, `GET /api/preview?collection=&slug=` — the same link as Open on site — which the host turns into its own preview (Next.js draft mode, or a signed link on SvelteKit and Express), so the page keeps its own layout, theme and UI library. Studio is served by the site's app, so the page is on Studio's origin: on each load Studio reads the frame's document from the parent — no script is injected and no framework code is needed. It counts as the page only when the frame ends at the document's page path (`documentPath()`) as HTML without an error status; an answer at another path, JSON or text — a refused preview, an expired sign-in — is an error. Studio scans the page for the preview-only marks (`@krantho/core/marks`: `data-krantho-document`, `data-krantho-field`, `data-krantho-section`, the lead as `__lead`), using only the marks whose `data-krantho-document` is the edited `<collection>/<slug>`. A heading the body has once is that section wherever the page marks it — the body's render, a hero or a sidebar alike — and typing patches every place it shows. A heading the body has more than once is told apart only inside the body's own render — the `display: contents` wrappers `markBodySections` puts side by side, whose headings are the body's in the body's order; a site's own section mark beside them is not part of it, and a page whose render no longer matches the body has none — where its nth mark with that heading is the body's nth `## Notes`. A mark with a duplicated heading outside the body's render selects without an inline editor, and the panel's **On the page** says "This heading appears more than once in the body: edit it in Structure mode." It rescans on changes to the page for a few seconds after the load (catching client-rendered fields) and after every patch. Hover outlines a marked element with its tag ("field · title", "section · Approach · designed" or "· prose", "section · lead") in Studio's own layer above the frame — positioned from the element's box (a `display: contents` wrapper by the union of its children's boxes), following scroll and resize, never by styling the site; the tag is always in view — kept within the visible part of the outline, above it or inside its top edge, and never under the inline editor (inside the top edge, or under the element, when the editor sits above it) — and cut with an ellipsis to the frame's width with its full text as its title. The outline and the tag are a two-tone ring, Studio's text colour inside a halo of its surface colour, so one tone stands out on a light or a dark page whatever Studio's own theme. A click on a marked element is caught before the page sees it, so a link inside it does not navigate; it selects the field, section or lead in the side panel and opens an editor at it, named after what it edits (media and other non-text fields select without one, since they change only after Save). A plain-text field is edited in the page itself: the clicked element becomes editable (`contenteditable="plaintext-only"`; `true` where the browser does not know that value, with Enter and paste kept to plain text), takes focus with the caret where the click landed (at the end of the text for a keyboard selection), is named "Edit field <name>" as a text box while it is edited, and gets a second ring in Studio's layer — the selected ring, doubled. Every input writes the field with the element's text and patches the page's other renderings of it. Enter finishes a one-line field and Esc finishes any; a multi-line field (one the form edits in a textarea) keeps Enter for line breaks and shows them while it is edited; pasted text goes in as plain text, on one line for a one-line field, and a drop is refused. Focus moving to another element, or to Studio, finishes it too, and stays where it went; focus leaving the browser window does not. When it is finished — and when a Save reloads the page under it — the element has its own attributes and style back and holds only the typed text, as the site rendered it. A field whose element holds anything but text — child elements whose markup would be lost, or an element that shows something other than its text — keeps the floating inline editor: an input, or a textarea for a multi-line field, placed under the element. A section or the lead opens a lazy-loaded Milkdown editor inside its marked page element, inheriting the site's typography. Its attached bottom toolbar follows the caret and selection, highlighting active formatting and indicating mixed formatting without changing the draft. It offers paragraph, heading (`###`), subheading (`####`), bold, italic, lists, quotes, links and undo/redo. Existing tables, code and other CommonMark/GFM content remain editable without a separate preview pane. Inside a table, **Table** opens row and column insert/delete controls plus whole-column alignment. The panel follows the current cell or cell selection; inserting a row or column moves typing into it. The Markdown header, last content row and last column are protected, with **Delete table** available separately; Undo restores deletions. Escape closes the table panel before closing the editor. Cells keep inline text formatting, while headings and lists remain outside tables. These actions change only the opened Markdown slice; the document’s schema-defined fields and storage contract stay the same. The red cancel restores this element's original Markdown and rendering; the check, Escape or clicking elsewhere keeps the edit and returns to the page rendering. Opening and closing untouched content preserves its original Markdown bytes. The editor writes transactions synchronously, so an immediate exit keeps the final keystroke. The floating editor is placed from its measured size so it is always whole inside the frame's area — under the element, above it, or as far down as it fits — and scrolls inside itself when the area is shorter than it. The selected element keeps the ring, never a fill, so its text stays visible. Typing updates the draft through the form's own field and body changes and patches the element at once: a field's text, or a section's markdown rendered as the body preview renders it (marked + DOMPurify) — an approximation until Save. A section or the lead is opened once, when its editor opens: every keystroke writes the body as the bytes before it, the typed text and the bytes after it, never splitting the body again, so a typed code fence or `##` heading cannot move or remove another section, and a missing final newline is kept; a typed line break follows the line endings of the region being edited, so a body mixing CRLF and LF keeps both. The inline editor never writes over a body it did not write: any other change to the body — **Add section** from the page or the panel, kept work restored, a rebase, a save that reloads — closes it first, keeping the selection and saying "The section changed elsewhere; open it again to edit." ("The field changed elsewhere; open it again to edit." when a field editor's value changes from elsewhere), and focus goes to the frame. A Save reloads only the frame: an editor mounted in the page closes when that page is replaced, preserving its draft; a floating field input can remain open through the reload. Esc (in the editor or inside the frame), Done, or Enter in a one-line field edited in the page, closes the editor, clears the outline and returns the panel to nothing selected, focus returning to where it was; Page overview clears it too. With an inline editor focus moves into it, without one the panel's heading takes it, and the panel announces the selection either way. There is no list of the page's content to choose from: a click is the way in, and Structure mode, which edits the same content, is the keyboard's; a line above the frame says so. Save (or Publish) reloads the frame from the preview entry, which then shows the site's real rendering of the saved draft. A designed section the body lacks never covers the site: in Studio's layer it is only a thin dashed line, tagged "<Name> · not written" in an outlined tag with no fill, taking no clicks, after the earlier designed section's mark or before the later one's. The full placeholder is listed under the frame — "<Name> is in this page's section contract but hasn't been written. The page leaves it out.", where the page would show it ("In the page: after Problem.") and **Add section** (the panel's own insertion, in the body's own line breaks). Under someone else's lock, hover and select still work and nothing is edited or patched. A missing mark never blocks, errors or hides anything: a selected field's **On the page** says whether Live mode found it, and whether it is editable in place there or why not (media changes after Save, read-only, not a text field). If the frame leaves the page — a link to another page of the site, by a load or a client-side navigation — Live mode says "The preview moved to <path>" in an alert with **Back to the page** — which takes focus when the inline editor or the toolbar held it — and stops reading that page's marks; it keeps checking where the frame is, so a browser back to the document's page attaches again. Live mode shows no frame, and says why, when there is no preview to load: a document not saved yet, no `sitePreview` capability, a role that cannot edit ("Your role cannot open the draft preview." — the preview is for editors), or a version in a locale other than the site's default — the preview entry has no locale, so another locale is edited in Structure mode, never previewed on the default-locale page. When a load was tried and the frame does not show the page within 20 seconds, answers with an error, or cannot be read (another origin, a refused frame, a failed request, or the page navigating to another origin after it attached), the empty state says the page preview did not load — or "The preview left the page" when an attached page went to another origin or the browser's own error page — with the URL it tried, and for an error answer the status the browser reports for it: a 404 says "The site has no page for this document" and names the path ("/contact answered 404: the site’s page templates do not render this document."), a 401 or 403 says the sign-in may have expired, any other error status is named with its path, and where the browser reports no status the sign-in wording stays. The empty state also has **Reload the preview** and **Switch to Structure mode**. Reload the preview and Back to the page put focus on the new frame. An empty state that replaces a shown frame is announced as an alert and takes focus on its heading, so focus never falls to the page's body.
- **Structure mode** (`structure-mode.tsx`): every schema field (a global shows the fields its document was opened with, so clearing one keeps its row; `status` is never a field) with its label, `*` or "optional", a type pill in plain words (text, number, yes/no, date, date and time, web address, image or file, link to a page, choice, list of text), an SEO-use chip when SEO reads the field — derived from `@krantho/seo-shared`'s field discovery (`buildSeoFieldMap`, `SEO_FIELD_CANDIDATES`): the field it picks for a concept reads as that output, a later candidate as its backup — its input, the schema's description as help, and a validation error when the save was refused. Inputs (`field-inputs.tsx`): text, url and email, textarea with a counter that is part of its description, number (cleared, it is left out of the save, which removes it), boolean, enum, colour, date, timestamp (shown in the viewer's time zone, stored in UTC with a Z; `utc-datetime.ts`), tags (`tag-input.tsx`), a reference picker (`reference-input.tsx`) and media (`media-field.tsx`: thumbnail, name, dimensions, size, alt status, **Change** through the media picker and **Clear**; its group says when it is required and when a save refused it). A new document has a required **slug**, suggested from the title until typed; a refused slug marks the field invalid. Custom fields outside the schema stay editable, with **Promote** — offered to admins only, as the API allows — adding one to the runtime schema. The media picker opens in the page's body, outside the form, so a lock change cannot disable it. The **Body** reads "markdown · `##` headings become sections": a monospace textarea, with **Split** showing it beside its rendering (side by side from 900px, stacked below) and **Preview** the rendering alone (marked + DOMPurify). Globals have no body.
- **Data mode** (`data-mode/`, for a saved page): what the page emits, as a column of cards, each a region named by its heading. **Search result** and **Social cards** preview the draft as it is typed, resolved in the order the site's meta tags resolve them (`preview-model.ts`, mirroring `resolveSeoContent` in `@krantho/ui-react`: the document's SEO settings, then the content fields through SEO's field discovery, then the site's defaults); the search result keeps a results page's own light colours (`serp-preview.css`, the one block `no-colour-literals.test.ts` allows), the social cards show the Open Graph card and X's card with the `og-title`, `og-description`, `og-type` and `og-image` (chosen from the media library) overrides. **Indexing** edits `canonical-url`, `robots-index` and `robots-follow` and shows the robots tag they make. Those fields are saved with the draft. **Checks** lists the page's checks from the draft (`lib/seo-checks.ts`: title and meta description against the site's limits, body, headings, links). **JSON-LD graph · what this page emits** lists every node of the locale version's composed graph (`GET /api/seo/preview/:c/:s?locale=`) with its type, its scope chip (site, or the page's own) and its `@id`, joined by `@id` to `GET /api/seo/resolved/:c/:s` (the locale's saved version) for the sources of its values; a node the composition adds itself (the page's WebPage, its BreadcrumbList) has its values marked computed. Each property shows its value in the code face and a source chip with an icon per source (§6: site, collection, URL pattern, document, computed, linked — `scope` of the API, `provenance.ts`); a property the type fixes shows a lock, and a linked value is a button that moves focus to the entity it references. A legend counts the values per source. **What the page emits · view-source** shows the JSON-LD as composed (`GET /api/seo/preview/:c/:s`) with Copy (`json-ld-code.tsx`, also the graph browser's raw view). **Edit the graph** opens the graph browser (`jsonld-graph/GraphBrowser`) at the document scope: edit, add and delete entities, follow references, import JSON-LD with its diff, export, and Discard or Apply to draft for the document metadata group — one entity per emitted node, each carrying its `@id` (`graph-config.ts`). Apply stages changes in the common document draft; Save draft records the snapshot and Publish updates the live page; read-only, it is browsed and exported only. **Rich results** lists the features the readers' own rules list for the live page, eligible or not (`editor/rich-results.ts`: `GET /api/seo/findings`, live pages in the default locale; a draft or another locale says so). **Findings per search engine** groups `GET /api/seo/findings/:c/:s` into the title and meta description, Schema.org, and each reader, each finding with its severity as an icon and a word and the documentation it cites. **Enrichment** says what it does — it fills what is missing and never overwrites a value someone set; what it fills is saved as a document draft; publishing updates the live page — and offers **Enrich this document** (`POST /api/seo/enrich`, scope `item`: the meta description, then the Schema.org properties, each job polled at `GET /api/seo/enrich/status`, its outcome listed). Replacing values someone set is not offered here: the one path that overwrites is Force regenerate, under Setup › AI provider › Run across the site. It needs an LLM provider (`GET /api/settings/llm`; without one the card links to Setup › AI provider), an admin, the default locale's version, no unsaved changes and no one else's lock, and says which is missing (the default locale as `lib/locales.ts` reads it; unknown is not assumed); afterwards the structured data is read again, and the document too when its meta description was written. **History** lists the locale version's saved versions (`?locale=`) with time, author and **live** and **current** chips, read again whenever the saved version moves on (a save, a restore, a publish); **Diff** compares a version with the one before and **Compare** with the form, as fields or body, unified or **Split**, the diff's heading taking focus and Close returning it; **Restore** (admins, when no one else holds the lock) confirms, saying what it replaces, and saves the version again as the newest one; one restore runs at a time, a failure is announced as an alert, and a restore that worked but could not refresh the page says so rather than that it failed. Without the `seo` capability, or for a collection without pages, only History shows, with the reason. Under someone else's lock or for a role that cannot edit, every edit in Data mode is disabled like the form's. A document not saved yet shows that Data mode reads saved pages.
- **Where it appears** (`globals-editor.tsx`, for a global): an info banner (a note, not an alert) — "A global has no page of its own. Publishing it marks every page that reads it stale; they refresh as visitors open them." — then **Pages that read it**, as far as krantho knows, from `GET /api/content/:collection/:slug/publish-impact` for the global's locale: the page paths when the API names them, the rule ("Every page that reads it") when it knows only the rule, as it does for a global, and the cached-entry count only when the API has one (a shared database page cache), said to be entries — pages and data — not a count of pages. Studio never lists or counts pages on its own. Then **History**, Data mode's own card (`DocumentHistory`), with Diff and Restore for the locale version being edited.
- **Side panel** (`side-panel/`), beside the canvas in the `--panel-width` column of a page's editor (globals have none); below 1100px it stacks under the canvas. **Hide side panel** collapses it and leaves the canvas the whole width, **Show side panel** brings it back, and the edge between them is a separator (`ui/resize-handle.tsx`) that a drag or the arrow keys move, from 300 to 640 pixels; a double click restores the default. Studio's navigation has the same edge, from 200 to 360 pixels. Both widths and the panel's collapsed state are remembered in this browser (`use-panel-layout.ts`, `hooks/use-nav-preferences.ts`; `lib/stored-layout.ts` reads and writes them), and a stored value outside the bounds is ignored. It shows what Live mode selects on the page, or what Structure mode reports as selected (`use-panel-selection.ts`, `selection.ts`): a field, focused, clicked, or typed in within its row (a key that only moves or dismisses — Esc, Tab, the arrows — never selects it again); the `##` section or the lead the body's caret sits in, reported when the caret moves — mapped with `splitSections` from `@krantho/core/sections`, never a parser of Studio's own; or nothing. A change is announced politely; Esc (in the canvas or the panel) or **Page overview** returns to nothing selected, and a change made from inside the panel moves focus to the panel's heading, so focus is never lost when its content swaps.
  - **Nothing selected:** **Metadata** first, then **Search and sharing**, then **Page & sections** and **Reach**; Live mode shows only the first two, because the page and the header's locale chips hold the rest.
    - **Metadata** (`metadata-editor.tsx`): the groups the collection declares with `defineMetadataArchetype`, in their declared order, each as its label, the name the page reads it by (`document.metadata.<group>`) and its fields, rendered from the group's schema — nested objects and arrays included. An optional group not in use is one row with **Add**. At its foot is **System**, a read-only line of what krantho keeps and the author cannot edit: status, version, locale, who saved it and when (`system-fields.tsx`, from the version's `DocumentMeta`). In Structure mode the form holds the groups, so the panel leaves them out there.
    - **Search and sharing** (`side-panel/search-and-sharing.tsx`): the collection's `krantho/sharing` group — the search title and description, which use the page's own until **Write your own**, and the sharing image — with the length of each against the site's configured limits (`seo.limits` of `/api/site-config`; the meta description under its target is a warning, over it danger) right under it, and where the text comes from; with no image of its own, the one the page falls back to through the chain its meta tags and Data mode's previews use (`pagePreview` in `data-mode/preview-model.ts`: og-image, image, hero-image, then the site's og-default-image). A collection that declares no such group gets the same measures of its own fields (`meta-description`, else `description`: `effectiveMetaDescription` in `lib/findability.ts`; and the title) with advice when the meta description falls back, is too long or is missing, each with an **Edit** that focuses the field in Structure mode when the form has it and can be edited. In Structure mode the block only measures. With SEO off, the limits unread or a collection without pages there are no checks and no warning: that is setup, not an editor's to fix. Structured data, rich results and the graph are Data mode's.
    - **Page & sections** with a chip "N / M designed": the collection's designed sections (`sections` of `GET /api/collections`) each present or missing — a missing one is a dashed row ("<Name> Add section") that inserts only the `## <Name>` heading — before the next designed section present, found with core's split, else at the end — leaving the rest of the body's text and spacing as it was, and selects it — then the lead and the other sections, marked prose. The page template is not named: the API does not report one. While the form is read-only, a **Fields** list comes first: its inputs cannot take focus, so the list is the keyboard's way to show a field in the panel.
    - **Reach**: each of the site's locales (`lib/locales.ts`) with its version's status and **Create draft** for a missing one (the header's create path: `useLocaleVersions().create` and `CreateLocaleModal`), and, for a collection whose documents render pages, what publishing refreshes (`GET …/publish-impact`).
  - **A field:** its type pill and whether it is required, which SEO outputs read it (Structure mode's mapping), the title's length against its limit, the effective meta description's length with where it comes from (for `meta-description` and `description`), and for a media field **Crop & hotspot** (the image editor, when the `media` capability is on), **Replace** (`POST /api/media/:id/replace`; replacing keeps the id, so pages update without a content change) and the alt text (`PUT /api/media/:id`; the panel takes the saved file back) — both saved on the media file at once, not in the draft, as the panel says. While read-only, all three are disabled.
  - **A section:** designed or prose, its `sections["<name>"]` key, its word count, and its optional `meta-description-<section>` field (the section named as its heading is written, the key the meta-description generator writes), saved with the draft; a prose section adds "Not in the contract. Rename it to a contract heading to get the designed layout, or keep it as prose."
  - **The lead:** "before first ##" and its word count.
  - Under someone else's lock, or for a role that cannot edit, the panel's edit controls are disabled like the form's.
- **Read-only**: when the role cannot edit or someone else holds the lock, every input is disabled and a status line at the top of the canvas says why ("Read-only: <email> is editing. …", or that the role can view but not edit). It is always in the page, so a lock turning foreign while someone types is announced, and focus moves to it from the disabled input.
- **Safety**: leaving with unsaved changes asks first, in Studio (`useBlocker`) and on unload (`use-leave-guard.ts`), and the confirmation says whether the work is kept. Unsaved work is kept (`kept-work.ts`, `use-autosave.ts`) a moment after each change, when the editor closes and when the page itself is left (`pagehide`: a reload, a closed tab — the editor may still be open then, even after Studio moved to another address), with the version it is based on: a document version's in `localStorage['krantho-autosave-<collection>-<slug>-<locale>']`, a new document's — slug included — in `krantho-autosave-new-<collection>` (`-<locale>` with `?locale=`), cleared once the document is created. Work on a saved document that does not name the version it was made on is never offered. The next time it opens, the work is offered back — Restore or Discard — saying when it was kept and, when the document has moved on, "made on v5 — the document is now v6". While the offer waits, its slot is kept: typing does not overwrite it, and the leave confirmation says what is typed meanwhile is not kept. Restored work saves against the version it was made on, so a newer version is a conflict (409): the notice says which version was saved after which, that nothing was saved, and whether the work is also kept in this browser, and **Overwrite v<n> with my changes** is a separate, explicit choice. Creating with a slug the collection already holds is refused on the slug field before anything is sent; while a new document is created the form is read-only ("Creating the document…"), then its own editor opens. The edit lock (`use-edit-lock.ts`) is taken for the document's locale while the editor is open, renewed at half the lease the server's `expiresAt` leaves, and released on leaving — after any request still in flight answers, so a late answer never re-takes it; while someone else holds it, the editor is read-only and asks again every 30 seconds, and when they let go the canvas says "Editing is open again." An ask that fails (the network, the server) changes nothing it knew and is retried after 5 seconds, doubling up to a minute; only a store without edit locks (501) reads as unguarded. A save refused by a lock (423) turns the editor read-only.

### Media

`media/media-page.tsx`, at `/media` with the `media` capability: the files of the site's media store. Every count is read from the API; a figure the API cannot give is left out and says why, never estimated. Editors upload and change files; a viewer sees the same screen with every change disabled, each control saying why; deleting several files at once or a folder is Studio's, as the API allows.

- **Header** (`media-header.tsx`): "Media", the store the files live in and its location (`GET /api/media/info`: the file store's own name, such as Local disk, S3, Google Cloud Storage or Vercel Blob), and how many files and bytes it holds.
- **Folders** (`media-folders.tsx`, `folder-actions.tsx`, with the `mediaFolders` capability): All files, then the folder tree, each folder indented under its parent and a toggle button that filters the grid; a folder with subfolders has a disclosure button before it (`aria-expanded`) that hides or shows them. Each shows its count: All files the store's total, a folder the files directly in it (`GET /api/media?folder=<id>&limit=1`, its `total`). **New folder** creates one inside the selected folder (`POST /api/media/folders`) and shows it; **Rename folder** and **Delete folder** act on the selected one — a folder that holds files is refused by the API, and the toast says so. A tile dragged onto a folder moves there; the drawer's Folder field does the same from the keyboard.
- **Upload** (`drop-zone.tsx`): files dropped on the drop zone, or chosen with **Choose files**, go up one at a time (`POST /api/media/upload`); the progress ("Uploading 2 of 3: …") is a status region and each failure an alert naming the file and the API's error. The upload takes no folder: after an upload while a folder is shown, a notice says the files went to All files, with **Move here** (`PUT /api/media/:id/move` for each). For a role that cannot upload, **Choose files** says why, a drag over the zone is not highlighted, and a drop is answered with "Your role cannot upload files."
- **Toolbar** (`media-toolbar.tsx`): search by name (`?search=`), the tag filter (`GET /api/media/tags`), the order of the page shown, and **Bulk select**.
- **Grid** (`media-grid.tsx`): a list named Files of tiles, each a button that opens the file's details — its thumbnail, a kind badge (the format in words, `JPEG`, `SVG`), the name, the dimensions the API stored ("No pixel dimensions" for a vector image) and its reference count. The count is the documents `GET /api/media/:id/usage` lists (a document using a file in two fields is one); while it is read the tile says so, and when it cannot be read it says that instead of a number. In Bulk select each tile is a checkbox labelled with the file's name; the **selection bar** shows how many are selected, across pages, with **Delete**, **Select this page** and **Clear selection**.
- **Delete** (`delete-modal.tsx`): a confirmation listing each file with its references, warning when documents use one (their pages lose the image: the documents still point at a file that is gone) or when its references could not be read; one file goes through `DELETE /api/media/:id`, several through `DELETE /api/media/bulk`, and the dialog then says what was deleted and why any file was left.
- **Details drawer** (`media-drawer.tsx`, `drawer-details.tsx`, `drawer-actions.tsx`): a region beside the grid, labelled by the file's name, which takes focus on its heading when it opens; Esc or Close closes it and focus returns to the file's tile. It shows the preview, kind, dimensions, size, when it was uploaded and the stable URL (`/api/media/<id>/image?preset=xl`), "Referenced by N documents" with a link to each document's editor and the fields that hold the id, then the actions and the details:
  - **Crop & hotspot** opens the image editor; **Replace** uploads a new file behind the same id (`POST /api/media/:id/replace`) — pages that use the file show the new one, and documents that held the old file's store URL are rewritten, which the toast counts; **Copy markdown** copies `![<alt>](/api/media/<id>/image?preset=xl)` — the stable image URL, which follows a replace (see [guides/media.md](guides/media.md#image-urls)) — announced, and when the clipboard refuses the error toast carries the markdown to copy by hand; **Copy ID** does the same with the file's id; **Open original** opens the stored file (its store URL) in a new tab; **Duplicate** makes a copy with a new id and opens it; **Delete** asks first.
  - **Name**, **Alt text** (a missing one says what it costs) and **Tags**, saved with **Save** (`PUT /api/media/:id`), and **Folder**, which moves the file at once (`PUT /api/media/:id/move`). A rename is metadata only: the name is shown only in Studio, and the file and its URL do not change, so pages keep the same image. Save waits for the file's references ("Checking references…", up to five seconds) and asks first when documents use it, or when its references could not be read or did not arrive in time.
- **Image editor** (`image-editor.tsx`, `use-image-editor.ts`, at `/media/:id/edit`; react-image-crop): **Crop** draws a region, free or at 1:1, 16:9, 4:3 or 3:2; **Hotspot** places the point crops centre on — a click on the image, or the arrow keys on it. **Save** stores both as percentages on the file (`PUT /api/media/:id`), **Reset** removes them, and the strip below shows the saved framing at each aspect ratio. Leaving with unsaved changes asks first. For a role that cannot edit, the image shows its saved crop and cannot be drawn on, and Save and Reset say why.
- **Media picker** (`media-picker.tsx`, `MediaPickerModal`): upload an image or choose one from the library, a page at a time. It keeps focus inside, closes on Esc, and its library files are buttons; the editor's media fields and Data mode's `og-image` open it.

### Structure

`structure/structure-page.tsx`, at `/structure/:tab` with the `seo` capability: how search engines and AI assistants read the site. Every figure and status is read from an API source or from the site as served; one that could not be read says so, never a zero by default. Changing SEO settings, robots.txt and enrichment are admin-only, as the API allows; other roles see the same screens read-only, each control saying why.

- **Header** (`structure-header.tsx`): "Structure" with its lead, **Validate all pages** (reads `GET /api/seo/findings` again and toasts how many live pages have a valid graph) and **Fill what's missing**. Below it the **intro band**: live pages with a valid graph, site entities (the `site` scope's entities) and eligible rich results out of those that apply.
- **Tabs** (`ui/tabs.tsx`): Graph, Scopes & archetypes, Rich results, Crawlers & assistants — a tab list with a roving tab stop (arrows, Home, End), each tab a route.
- **Graph** (`graph-tab.tsx`): a page picker (`?page=<collection>/<slug>`, the live pages of `GET /api/seo/findings`), and the page's graph read from the page as the site serves it — every `application/ld+json` script of its HTML (`lib/served.ts`, `served-graph.ts`), so it includes what the site's templates add — joined by `@id` to `GET /api/seo/resolved/:c/:s` for where each value comes from. A legend names the node kinds: site, collection, URL pattern (only when a node has it), document and derived (what krantho composes itself). From 1200px a canvas (`graph-canvas.tsx`, laid out with dagre) shows each node as a button with its type, `@id`, property count, its search features and a chip per missing requirement, and the edges labelled with the property that references; narrower, the same nodes are a list. The selected node's card lists its values with their source chips (Data mode's `provenance.ts`), what it lacks for a feature with **Fix** (Site entities for a site node, the page's Data mode otherwise), and its links. **What the page emits · view-source** shows the JSON-LD as served, with Copy; **Export JSON-LD** downloads it, and editing or importing a page's graph is in the page's Data mode. A page not live, or one the site does not serve as HTML, says so.
- **Scopes & archetypes** (`scopes-tab.tsx`): the cascade — site, collection, URL pattern, document, each with what it holds and a link to the next — then **From krantho.config.ts**, the site identity read-only, each value naming its setting ("Change it in krantho.config.ts (site.name)"); **Site entities**, the `site` scope's entities in the graph browser (edit, import, export, Save to `site`, keeping what the settings hold beside the entities); **Collection archetypes**, a table of each page-rendering collection's types with **Change**, a dialog of the catalog's page types (a retired one only while the collection has it) that reads the impact on the collection's pages (`GET /api/seo/collection/:name/impact`) as the choice changes and saves to `collection:<name>`, keeping its entities, field mappings and page structure (a collection with nothing stored starts from no entities). When the stored settings could not be read, nothing stored can be changed: Site entities shows no editor and Change is disabled, both saying "The stored settings could not be read; reload before changing them." The URL patterns and the pages with their own settings, read-only; and **The catalog**, the types grouped by category without retired features, each opening its properties and the search engines' rules.
- **Rich results** (`rich-results-tab.tsx`): a card per search feature the search engines' rules show: those of the live pages (`GET /api/seo/findings`), then each active or restricted feature of the catalog (Google's rules, while Google is a reader) that no page uses yet — "No page of this site is of this type yet", 0 of 0. Each card has its status (a restricted feature is "Shown on conditions"), eligible pages out of those it applies to, the conditions, what is missing on which pages with **Fix**, and the rule's source. Retired features are never shown; the empty state shows only when the rules list no feature they still show.
- **Crawlers & assistants** (`crawlers-tab.tsx`): the **Sitemap** as the site serves `/sitemap.xml` (its URLs, `lastmod`, `changefreq`, `priority`), else krantho's `GET /api/seo/sitemap.json`; **robots.txt** as served, with an override editor — **Save**, which stores it as the site SEO settings' `robotsTxt`, beside the entities (read first, never saved over settings that could not be read), and **Reset**, which removes it; and **llms.txt**, read-only, saying where it comes from: built from the live pages or a snapshot saved through the assistant (`x-krantho-llms-origin`; without the header it says the origin could not be determined), or the site's own `/llms.txt` route.
- **Fill what's missing** (`fill-missing.tsx`, also `/structure/graph?fill=1` and the palette's Enrich missing SEO): enrichment over the whole site or one collection — the meta descriptions, then the Schema.org properties (`POST /api/seo/enrich` with scope `all` or `collection`, each job polled at `GET /api/seo/enrich/status`) — never overwriting a value someone set, saying before it runs where what it fills lands, and reporting each step. The run belongs to Studio, not to the dialog (`fill-job.ts`): closing the dialog, or leaving Structure, never stops it, and both steps start and finish. While it runs the header says how far it is ("Filling… step 2 of 2"), reopening the dialog shows its progress, and a toast says when it ends. It needs an admin and an AI that is on (`GET /api/settings/llm`; without one it links to Setup › AI provider).

### Setup

Setup (`setup/`) is how the site is configured: a header, the tabs (`ui/tabs.tsx`, a route each, `setup-page.tsx`), then sections on hairlines. Every section says where its values come from with a chip and a line (`setup-section.tsx`, `ValuesFrom`): **Configuration** (`krantho.config.ts`, `krantho.collections.ts` or the environment — read-only here, naming the setting), **Database** (stored in the site's database and changed here) or **Server** (what the running server reports). Each tab keeps the role and capability gate its screen had before Studio; controls the API refuses a role are read-only for that role. Dialogs keep focus inside, start on Cancel when they confirm, and say a refusal in the API's words.

- **Collections & schema** (`collections-tab.tsx`, `collections-model.ts`): a table of every collection — where it renders (`documentPath(collection, ':slug')` of `@krantho/core/cache-tags`, or "No pages"), the Schema.org types of its archetype (`GET /api/seo/config`, with `seo` on), the rich results the catalog gives those types (active or restricted, never retired), and **Fields**, which opens the collection's fields below (`?collection=`). The field table (`fields-card.tsx`) lists field, type, required, its default (as the schema states it), source and Edit: a code field (`GET /api/schema/:collection`, without `_runtime`) shows a lock and "Defined in code, change it in krantho.collections.ts; code always wins"; a runtime field (`GET /api/schema/:collection/runtime`) has Edit and Delete for admins. **Add runtime field** and Edit open `field-dialog.tsx` (`PUT /api/schema/:collection/fields`; a field keeps its name), Delete is confirmed (`DELETE /api/schema/:collection/fields/:field`), and **Export as Zod** shows `GET /api/schema/:collection/export` with Copy.
- **Locales** (`locales-tab.tsx`): the locales from the one locale source, `GET /api/settings/locales`, with the default marked (it is never removable and never set here: `site.defaultLocale` in the configuration), **Remove** and **Add locale** (`PUT /api/settings/locales` with `{ supportedLocales }`, admins). Setup only chooses which of the configured locales (`configuredLocales`, from `site.supportedLocales`) are active: **Add locale** is a select of the configured locales not yet active, and says so when there are none. It says whether the active list is the configuration's or one stored in the database. With several locales, **Translation coverage** (`locale-coverage.tsx`, `GET /api/translations/status`) is a table per collection with a column per locale: Exists, or **Create draft** — the editor's create path (`createLocaleVersion` in `editor/use-locale-versions.ts`, copying the default locale's fields and body into a new draft) — then a link to open it; Missing for a viewer, or when the default locale has no version to copy.
- **AI provider** (`ai-tab.tsx`, `ai-cards.tsx`, `ai-developer.tsx`, `ai-actions.ts`, `ai-model.ts`): a provider is on when it has a key, and the screen shows two things. A status line says whether AI help is on and which AI the site uses ("AI help is on, using ChatGPT"), then **Ready to use** lists the providers that are on, each a card with its plain name and maker (`label` and `vendor` of `PROVIDER_PRESETS` in `@krantho/ai`), an **In use** chip or **Use this one**, where its key comes from in words a person uses ("Set up by your developer", or "Key saved here, encrypted" with **Remove key**, which is confirmed and removes that provider's saved key only), **Test**, and an **Advanced** fold with its model and address (empty uses its own). **Add a key to turn one on** lists the providers that are off, each with a key box and **Turn on**: it saves the key, tests it at once and answers in a sentence ("ChatGPT works: it answered", or "ChatGPT did not accept the key"). A **For developers** fold holds OpenRouter, Claude Code (its token variable and that it works on your own machine only) and a local Ollama model (an address, no key), and names the variable a key can be set in. The data is `GET /api/settings/llm` (`providers`, each with `ready`, `active`, `keySource`, `env`, `model`, `baseUrl`); writes are `PUT` with `{ provider, apiKey?, model?, baseUrl?, use? }`, `DELETE ?provider=`, and `POST /api/settings/llm/test` with `{ provider }`. When `assistant.provider` is set, a read-only line says which AI the assistant is given. Below admin the screen shows the same state without controls.
- **Run across the site** (`site-run.tsx`): a scope (the whole site or one collection), then **Fill missing SEO** (the meta descriptions, then the Schema.org properties), **Meta only** (the meta descriptions) and **Force regenerate**, both steps with `force`, behind a danger confirmation saying that it overwrites the values there now, the editors' own included, and that it creates document drafts; publishing those drafts updates the live pages. The runs are the plans of `structure/fill-job.ts` (`FILL_MISSING`, `META_ONLY`, `FORCE_REGENERATE`), the same run Structure's Fill what's missing starts, shown by the same view (`structure/fill-run-view.tsx`); it belongs to Studio and keeps running when the screen changes. Admins with a saved provider run it.
- **Integrations** (`integrations-tab.tsx`, `deliveries-model.ts`): the webhook delivery log (`GET /api/webhooks/deliveries`), 25 a page, filtered All, Pending, Delivered or Failed, each delivery with its event, URL, state chip, HTTP answer, attempts, created and delivered times, and **Retry** on a failed one (`POST /api/webhooks/deliveries/:id/retry`, which re-queues it and sends it again at once; it then reads as pending until the webhook answers). An empty log has its empty state. Only admins read the log.
- **Checkpoints** (`checkpoints-tab.tsx`, `checkpoint-confirms.tsx`): a name and **Create checkpoint** (editors and admins), and the checkpoints as `GET /api/checkpoints` lists them — number, name, what took it and when; the API reports no size or schema version, and the tab says so. **Restore** (admins) is confirmed with what `POST /api/checkpoints/:version/restore` does: documents (their current and live versions), runtime fields and media records go back to the checkpoint's time, a safety checkpoint `pre-restore-v<n>` is taken first, settings, SEO configuration and people are not rewound, and every cached page is marked stale. Delete is confirmed too.
- **People** (`people-tab.tsx`, `person-dialog.tsx`): the accounts of `GET /api/users` — name, email, a role chip, active or deactivated, whether the account signs in through the OIDC provider or with Studio, and when it was created — with **Create user**, **Edit** (name and role; roles are site-wide, admin > editor > viewer), **Deactivate** or Activate, and Delete, each confirmed; no one deactivates or deletes their own account. The API records no last-active time, so none is shown.
- **Environment** (`environment-tab.tsx`): what `GET /api/capabilities` reports — framework, persistence, auth, schema version and each feature — labelled as the running server's own report.

### Login

`pages/Login.tsx`: the token form, and a button per OIDC provider. Shown by `routes.tsx` when `loginRequired` is true and no session exists.

## Components

### ConfirmDialog

`components/ConfirmDialog.tsx`: the assistant panel's confirmation (New conversation while a reply streams or a proposal is open), with a title, a message, and Cancel and a danger confirm built on `ui/button.tsx`.

### Toasts

`ui/toast.tsx`: `ToastProvider`, mounted by the shell, holds the toasts of every screen, so a toast outlives the screen that raised it; `useToast()` shows one. Bottom-right, at most 380px wide, in regions that are always in the page: successes in a polite status region ("Notifications"), errors in an alert region ("Errors"), announced at once. Each carries an icon for its tone, never colour alone. A success dismisses itself after six seconds unless pointer or focus rests on it; an error stays until dismissed, and while one shows the page keeps a scroll padding at the bottom so a focused control is not hidden under it. Each has a Dismiss button, and Esc dismisses a toast that holds focus; when a toast that holds focus goes — dismissed, or pushed out by a newer one — focus moves to another toast's Dismiss, or to the page's content.

### Shell

- **Navigation** (`shell/nav.tsx`): the brand mark, the destinations in order, the site tree, and a footer with the assistant launcher (when available), the signed-in user and Log out (when sign-in is required), the theme switch and the collapse button. 236px wide, collapsing to 66px with icons and tooltips (remembered in `localStorage['krantho-studio-nav']`); below 960px an off-canvas drawer with a scrim, a focus trap and Esc, opened from the menu button in the top bar.
- **Site tree** (`shell/site-tree.tsx`): a group per collection, labelled with the URL path its pages live at (`collectionBasePath` from `@krantho/core/cache-tags`, the core's one rule for page URLs; the root barrel is not browser-safe) and opening the collection view, with a "New <singular>" entry for editors (`/new/:collection`), and a Layout group of the globals. Each document shows its status dot — filled for live, half-filled for unpublished changes, a hollow ring for not published, so the status never rests on colour alone — and, when someone else holds its edit lock, a lock icon naming the holder's email; the open document is `aria-current="page"` with an accent bar. Every collection is read in one request (`fetchContentTree`, `GET /api/content-tree`). It refreshes on navigation, every minute while the tab is in view and in use (after ten minutes without a pointer, key, wheel or touch event it stops, and reads once when one comes back), after the palette publishes, and when a screen reports changed documents (`useContentChanged()`, from the shell's outlet). Up and Down move between its links.
- **Top bar** (`shell/top-bar.tsx`): 56px, with the breadcrumbs (`shell/breadcrumbs.tsx`, derived from the route) and the "Search or command" button.
- **Command palette** (`shell/command-palette.tsx`): ⌘K or Ctrl+K. With no query it lists commands — New page, Publish all drafts ahead of live (with a confirmation naming the count), Create checkpoint, Enrich missing SEO (it opens Structure's Fill what's missing), Structure — each hidden without its capability or role; with a query it lists matching documents. Arrow keys move (the active row is kept in view), Enter runs, Esc closes and focus returns. Opening it closes the navigation drawer first, so only one focus trap is ever active.

### JSON-LD Graph Browser Components

Located in `components/jsonld-graph/`:

- **GraphBrowser**: Main orchestrator. Manages layout mode (list/canvas), edit buffer, selected entity, and coordinates all sub-components; in edit mode its header carries Discard, Import and Save.
- **GraphCanvas**: ReactFlow-based visual graph with dagre auto-layout. Entity nodes with validation meters, edges for cross-references.
- **CanvasEntityNode**: Custom ReactFlow node renderer showing type, validation score, and category badge.
- **GraphSection**: Layout wrapper for site-context, page, primary, and linked sections.
- **GraphSummary**: Overview card showing entity types, validation scores, and property coverage.
- **EntityCard**: Expandable card showing entity type, properties, and validation meter.
- **EntityHeader**: Entity title bar with type, `@id`, category badge, and edit controls.
- **PropertyPanel**: Detailed property editor for a selected entity. Editable fields powered by typed input components.
- **PropertyRow**: Single property display/editor with importance badge, value display, and inline editing.
- **ValidationMeter**: Visual bar showing required/recommended/optional property completion.
- **ReferencesList**: Shows inbound and outbound cross-references for an entity.
- **CategoryBadge**: Color-coded badge for the Schema.org catalog category (business, content, commerce, people, navigation, reviews).
- **AddEntityPicker**: Dialog for adding a new entity to the graph from the catalog.
- **ExportDropdown**: Export options (download `.jsonld` file, copy `<script>` tag).
- **ImportModal**: JSON-LD import with diff preview, per-property selection, and `@id` rewriting.
- **DiffPanel**: Side-by-side diff viewer for import changes.
- **LayoutToggle**: Toggle between list and canvas layout modes.
- **RawJsonToggle**: Toggle for viewing raw JSON-LD source.
- **ScopePropagation**: Controls for propagating document config up to collection or site scope.
- **inputs/**: Typed property editor components: `TextInput`, `TextareaInput`, `NumberInput`, `DateInput`, `UrlInput`, `SelectInput`, `ArrayInput`, `ObjectArrayInput`.

## Hooks

### Shared hooks

`hooks/` holds the hooks more than one screen uses: `use-theme.ts`, `use-nav-preferences.ts` (the navigation's collapsed state and closed tree groups), `use-site-tree.ts` (the site tree: one `GET /api/content-tree` read of every collection's documents as meta, with the locks, on navigation, when the tab comes back into view, and every minute while it is in view and in use — nothing is read while the tab is hidden, and nothing after ten minutes without interaction, so a left-open tab lets the database suspend; the next interaction reads once. Interaction in the Live frame is not seen by the page around it, so a long stay in the frame pauses the refresh until a save, a navigation or a move outside it), `use-document-search.ts` (the palette's search), `use-focus-trap.ts`, `use-media-query.ts`, `use-locales.ts`, `use-llm-provider.ts`, `use-assistant-chat.ts` and `use-timed-message.ts`. A screen's own hooks live in its folder. `loadSiteConfig`, the public configuration read once per session, is not a hook and lives in `lib/site-config.ts`.

### useTimedMessage

Manages short-lived status messages with automatic dismiss. Success messages auto-dismiss after a configurable TTL. Error messages persist until explicitly cleared or replaced.

### useLlmProvider

Reads `GET /api/settings/llm`: whether an AI is on (a provider has a key), missing, or could not be read. Data mode's Enrichment card and Structure's Fill what's missing gate on it; Setup › AI provider reads the settings itself.

### useAssistantChat

The assistant panel's conversation: entries, streaming state, proposals and the `GET /api/assistant` status; `send`, `stop`, `confirm`, `confirmAll`, `cancel` and `reset`. See [Assistant](#assistant).

### useTheme

Light/dark/system theme management. Persists preference to localStorage. Applies `data-theme` attribute to `<html>`. Listens for system theme changes when set to "system".

## API Client

### Architecture

The API client is split across focused modules, re-exported through `api.ts`:

- **`api-client.ts`**: Base layer. `request<T>(path, options)` and `requestText(path, options)` wrappers that prepend `/api`, parse JSON, and throw `ApiError` with status code and body on non-OK responses; `localeQuery(locale)` builds a document request's `?locale=`.
- **`fetch.ts`**: Lightweight utilities. `isNotFound()` (an `ApiError` with status 404) and the `errorMessage()` extractor.
- **`api-content.ts`**: Content operations (collections, items, publishing and its impact, bulk, schema, webhook deliveries and Retry, translations).
- **`api-checkpoints.ts`**: Checkpoints (list, create, restore, delete).
- **`api-users.ts`**: User accounts (list, create, update, delete).
- **`api-locks.ts`**: Edit locks (take or renew, release, list).
- **`api-versions.ts`**: A locale version's history (list, read one, restore).
- **`api-media.ts`**: Media operations (CRUD, folders, tags, usage, upload, replace, duplicate).
- **`api-seo.ts`**: SEO operations (preview, config CRUD, catalog, enrichment, sitemap JSON, robots text).
- **`api-settings.ts`**: Settings operations (site config, locale settings, LLM settings with test).
- **`api-types.ts`**: All TypeScript interfaces used by the API client.
- **`api-assistant.ts`**: The assistant's status, streamed chat and confirm, with its own types mirroring `@krantho/api`'s. Not re-exported from `api.ts` (see [State](#state)).

### Key API Functions

**Content**

- `fetchCollections()` -- List all collections
- `fetchCollectionItems(collection, query?)` -- List items with status/sort/locale/limit/offset filters; answers `{ items, hasMore }`
- `fetchAllDocuments({ collections?, locale?, status?, view? })` -- Every document across collections, read page by page (500 a page) from `GET /api/content` until `hasMore` is false
- `fetchContent(collection, slug, locale?)` -- Get a single content item
- `fetchSchema(collection)` -- Get JSON Schema for a collection's fields
- `createContentItem(collection, data)` -- Create new item
- `updateContentItem(collection, slug, data)` -- Update fields/body with optional `_version` for concurrency
- `publishContentItem(collection, slug, options?)` -- Publish (`status: 'published'`), unpublish (`'draft'`) or archive (`'archived'`) in `options.locale`; toggles without a status. Returns `{ slug, status, version, liveVersion, message }`
- `acquireContentLock(collection, slug)` -- Acquire edit lock
- `releaseContentLock(collection, slug)` -- Release edit lock
- `searchContent(query)` -- Search across collections; answers `{ items: [{ meta, fields, snippet? }], hasMore }` (no snippet for a slug-only match)
- `bulkDeleteItems(collection, slugs)` -- Bulk delete
- `bulkPublishItems(collection, slugs)` -- Bulk publish
- `exportCollection(collection, format?, locale?)` -- Export as JSON or markdown
- `importCollection(collection, items)` -- Import items
- `fetchWebhookDeliveries(query?)` -- List webhook delivery logs
- `retryWebhookDelivery(id)` -- Re-queue a failed delivery and send it again
- `fetchLocks()` -- Every edit lock currently held
- `fetchTranslationStatus(collection)` -- Translation coverage per item

**Versions**

- `fetchVersions(collection, slug, locale?)` -- Get a locale version's history
- `fetchVersion(collection, slug, version, locale?)` -- Get a specific version
- `restoreVersion(collection, slug, version, locale?)` -- Restore to a previous version (admin)

**Runtime Schema**

- `fetchRuntimeSchema(collection)` -- Get runtime field definitions
- `saveRuntimeField(collection, field)` -- Add or update a runtime field
- `deleteRuntimeField(collection, fieldName)` -- Remove a runtime field
- `exportSchemaCode(collection)` -- Export merged schema as Zod code

**Media**

- `fetchMedia(query?)` -- List media with search/tag/folder/limit/offset filters
- `fetchMediaItem(id)` -- Get a single media item
- `uploadMedia(file, metadata?)` -- Upload a file
- `updateMedia(id, data)` -- Update metadata (alt text, tags, crop, hotspot)
- `deleteMedia(id)` -- Delete a media item
- `bulkDeleteMedia(ids)` -- Bulk delete
- `replaceMedia(id, file)` -- Replace file contents
- `duplicateMedia(id)` -- Duplicate a media item
- `fetchMediaFolders()` -- List folders
- `createMediaFolder(name, parentId?)` -- Create folder
- `renameMediaFolder(id, name)` -- Rename folder
- `deleteMediaFolder(id)` -- Delete folder
- `moveMediaToFolder(mediaId, folderId)` -- Move an item to a folder (null: out of every folder)
- `fetchMediaTags()` -- List all tags
- `fetchMediaUsage(id)` -- Find content referencing a media item
- `fetchMediaInfo()` -- Storage stats

**SEO**

- `fetchSeoPreview(collection, slug)` -- Composed JSON-LD preview for a document
- `fetchSiteFindings()` -- Every live page's SEO findings per reader and its search features
- `fetchSitemapJson()` -- Sitemap URL listing
- `fetchLlmsTxt()` -- `/api/seo/llms.txt` with its origin (`x-krantho-llms-origin`: a saved snapshot or generated)
- `fetchRobotsText()` -- Current robots.txt content
- `saveRobotsOverride(text)` -- Save robots.txt override
- `resetRobotsOverride()` -- Reset to auto-generated robots.txt
- `triggerEnrichment(options)` -- Start AI enrichment job
- `fetchEnrichmentStatus(jobId)` -- Poll enrichment job progress
- `fetchSeoCatalog()` -- List all Schema.org types in the catalog
- `fetchCatalogType(type)` -- Get type details with property definitions
- `fetchSeoConfigs()` -- Every saved SEO config, each with its scope ID
- `fetchSeoConfig(id)` -- Get SEO config by scope ID
- `saveSeoConfig(id, data)` -- Save SEO config
- `fetchCollectionImpact(collection)` -- Impact analysis for archetype changes

**Settings**

- `fetchSiteConfig()` -- Site-level configuration
- `fetchLocaleSettings()` -- Current locale settings
- `updateLocaleSettings(settings)` -- Update locale settings
- `fetchLLMSettings()` -- LLM provider configuration
- `updateLLMSettings(settings)` -- Update LLM settings
- `deleteLLMSettings()` -- Remove LLM configuration
- `testLLMConnection()` -- Test LLM provider connectivity

## Auth

### AuthProvider

Wraps the app at the root level. On mount:

1. Calls `GET /api/auth/capabilities` to check auth mode (`none`, `token`, `oidc`) and whether login is required.
2. If `login_required` is false, authenticates as anonymous with admin role.
3. If `login_required` is true, calls `GET /api/auth/me` to check for an existing session.
4. If no session exists, renders the `Login` page.

### useAuth Hook

```typescript
function useAuth(): {
  isLoading: boolean
  isAuthenticated: boolean
  loginRequired: boolean
  authMode: 'none' | 'token' | 'oidc'
  user: AuthUser | null          // { id?, email, name, roles }
  hasRole: (required: Role) => boolean  // hierarchical: admin > editor > viewer
  login: (token: string) => Promise<boolean>
  logout: () => Promise<void>    // supports SSO logout redirect
}
```

### authFetch

Wrapper around `fetch()` that intercepts 401 responses, attempts a session refresh via `POST /api/auth/refresh`, and retries the original request once.

### Role-Based UI

Roles follow a hierarchy: `admin` (level 3) > `editor` (level 2) > `viewer` (level 1). `hasRole(required)` returns true if the user has any role at or above the required level. Used by `shell/destinations.ts` to gate the Setup tabs and by the palette's commands.

## Capabilities

### RuntimeCapabilities

Fetched from `GET /api/capabilities` on app mount. Drives which destinations, Setup tabs and routes exist, and feature visibility across pages.

```typescript
interface RuntimeCapabilities {
  persistence: 'filesystem' | 'sqlite' | 'postgres'
  /** The server package hosting the API; null when the API was created without one */
  framework: 'next' | 'sveltekit' | 'node' | null
  authMode: 'none' | 'token' | 'oidc'
  schemaVersion: number | null
  features: Record<string, string>  // feature name → status
}
```

`isEnabled(caps, feature)` returns true when the feature key exists and its value is not `'disabled'`. Features gate: `media`, `mediaFolders`, `seo`, `sitePreview` (the editor's **Open on site** opens the draft preview, and Live mode shows it), `checkpoints`, `webhookDeliveries`, `localization`, `runtimeSchema`, `assistant` (the assistant launcher and panel; the key is present only when enabled).

## Theming

Light/dark/system theme with the `useTheme` hook. Preference is persisted to localStorage under `krantho-studio-theme`. The resolved theme is applied as a `data-theme` attribute on `<html>`. When set to "system", the hook listens for OS-level `prefers-color-scheme` changes and updates automatically.

The navigation footer contains the theme switch: a three-button radio group (sun/moon/monitor icons), one tab stop, arrow keys move the choice.

## Usage

### Building

```bash
pnpm --filter @krantho/studio run build
```

Produces `packages/studio/dist/` containing `index.html` and hashed JS/CSS assets.

### Integration with Server Frameworks

The server must:
1. Serve `dist/index.html` for all `/studio/*` routes (SPA fallback).
2. Serve `dist/assets/*` as static files.
3. Provide `/api/*` endpoints that Studio calls.

This is handled automatically by `@krantho/server`, which all server adapters (`server-next`, `server-sveltekit`, `server-node`) delegate to.

### Dev Server

Vite's dev server proxies `/api` requests to `http://localhost:3333`, enabling Studio development against a running krantho server.

## Dependencies

### Runtime Dependencies

| Package | Purpose |
|---------|---------|
| `react` 19.x | UI framework |
| `react-dom` 19.x | DOM rendering |
| `react-router-dom` 7.x | Client-side routing |
| `marked` 17.x | Markdown to HTML conversion for preview |
| `dompurify` 3.x | Sanitize rendered HTML |
| `@xyflow/react` | ReactFlow graph visualization for canvas layout |
| `dagre` | Auto-layout algorithm for graph canvas |
| `react-image-crop` | Image crop UI for media editor |
| `react-diff-viewer` | Side-by-side diff for JSON-LD imports |
| `lucide-react` | Icon set for the navigation and UI elements |
| `@krantho/seo-shared` | SEO field resolution primitives |
| `@krantho/ai` | `parseServerSentEvents` for the assistant's streamed chat |
| `@krantho/core` | `collectionBasePath` (and the page-URL rule) from the pure, browser-safe `@krantho/core/cache-tags` subpath — never the root barrel |
| `diff` | Word and line diffs in the assistant's change view |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `vite` 8.x | Build tool and dev server |
| `@vitejs/plugin-react` 6.x | React JSX transform |
| `typescript` 6.x | Type checking |

Saved pages show a snapshot timeline above the Live and Structure editors. The compact ruler runs oldest to newest with vertical ticks and a square slider handle; arrow keys, Home/End, older/newer buttons and direct tick selection navigate saved snapshots. The viewport follows selection and also scrolls with trackpad gestures. Collapse reduces it to a summary row. Each stop identifies its version, date, and whether it is current or live. Details opens an anchored panel with its author, full save time, Preview, Diff, Compare and (for admins without a foreign edit lock) Restore where applicable. Preview opens a read-only rendering of the saved body and its fields without replacing unsaved work. Restore uses the same confirmation and version-preserving behavior as History in Data mode; it creates a new saved version without publishing it. The timeline refreshes after saving or restoring, and unsaved changes are labeled separately from saved snapshots.
