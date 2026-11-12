---
title: Studio
description: Manage content, media, SEO and settings in krantho Studio — set it up on your stack, preview drafts on the site, and configure sign-in, roles and capabilities.
area: concepts
order: 40
level: beginner
stacks: [next, sveltekit, express]
prerequisites: [installation]
next: [persistence, media, add-seo]
related: [configuration, content-model, rendering-modes, package-studio, live-editing]
status: published
---

Studio is a React single-page app served at `/studio` by every server package. It talks to your site only through the krantho REST API, so the same Studio works whether your site runs on Next.js, SvelteKit or Node with Express.

## Set up Studio

Studio is a pre-built app in `@krantho/studio`, which every one-install bundle pulls in. In a checkout of the krantho repository, build it once:

```bash
pnpm --filter @krantho/studio run build
```

Until it is built, `/studio` answers `503` with that command in the message.

> [!NOTE]
> Krantho is not yet published to npm, so today you run it from a checkout of the repository. See [Project status](/docs/project-status).

Then add a Studio route to your server and pass it your configuration, so `/studio` can apply the sign-in gate when you turn it on (see [Gate /studio behind sign-in](#gate-studio-behind-sign-in)):

```ts title="app/studio/[[...slug]]/route.ts" stack="next"
import { createStudioRouteHandler } from '@krantho/server-next'
import config from '../../../krantho.config'

export const { GET } = createStudioRouteHandler({ config })
```

```ts title="src/routes/studio/[...path]/+server.ts" stack="sveltekit"
import { createStudioHandler } from '@krantho/server-sveltekit'
import config from '../../../../krantho.config'

export const { GET } = createStudioHandler({ config })
```

```ts title="server.ts" stack="express"
import { createStudioServer, writeResponseHeaders } from '@krantho/server-node'
import config from './krantho.config'

// Answers an admin request ({ url, cookie }) with a Web Response
const serveStudio = createStudioServer(config)

// `app` is the Express app that serves the krantho API

app.use(async (req, res, next) => {
  if (req.path !== '/studio' && !req.path.startsWith('/studio/')) return next()
  try {
    const url = new URL(`http://localhost${req.originalUrl}`)
    const response = serveStudio({ url, cookie: req.headers.cookie })
    res.status(response.status)
    writeResponseHeaders(res, response)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    next(error)
  }
})
```

The server serves `index.html` for every `/studio/*` route and the build's hashed files from `/studio/assets/`. With the `@krantho/server-node/vite` plugin, the plugin serves Studio itself, with the configuration you pass it — no extra route needed.

## Find your way around

Studio is called Studio. Its navigation holds five destinations, in this order:

| Destination | What it answers |
|-------------|-----------------|
| **Pulse** | What needs you? |
| **Site** | What are you editing? |
| **Structure** | How do search engines and AI assistants read the site? |
| **Media** | The site's media files |
| **Setup** | How is the site configured? |

Under them, the **site tree** has a group per collection, labelled with the URL path its pages live at (`Pages /`, `Features /features`), each with a **New <singular>** entry for editors, and a **Layout** group of the globals. Each document shows a status dot, a lock icon while someone else is editing it, and the open document is highlighted. The legend reads live, draft ahead and draft.

The top bar shows where you are (`Site › Features › seo`, `Structure › Graph`, `Setup › Locales`) and a **Search or command** button. **⌘K** or **Ctrl+K** opens the same palette: with no query it lists commands — New page, Publish all drafts ahead of live (asked first), Create checkpoint, Enrich missing SEO and Structure — and with a query it lists matching documents. The navigation collapses to icons, and below 960px it opens as a drawer from the menu button.

A destination or tab the site has turned off, or your role does not have, is not shown and cannot be opened by its URL.

### Status

Every list, the site tree and the editor show the same three states, read from the document's current version and its live version:

| State | Means |
|-------|-------|
| **Live** | Visitors see the current version |
| **Unpublished changes** | A version is live, and a newer one is saved |
| **Not published** | No version is live |

Each state has its own dot shape as well as its colour: filled, half-filled and a hollow ring.

### Pulse

The first screen. A header with the site's name, domain, framework and page-cache mode, and **New page** for those who can create pages. Then key figures: live pages and how many have unpublished changes, meta-description coverage (set, falling back to `description`, or missing), and, with SEO on, live pages whose structured data is valid. **Needs attention** lists what to act on: documents with unpublished changes, failed webhook deliveries, pages without a meta description, documents someone else is editing, and documents missing a locale version. Below it, each collection with its live and draft counts, and the recently saved documents.

A figure appears only when the site has a source for it; Studio never shows an estimate.

### Site

**Site** lists every collection with its URL path and its documents — page, status, findability, locales and when each was last saved — and the **Layout**, the globals every page reads.

Opening a collection gives its collection view: filter by status, sort by last update or slug, and select documents to **Publish** or **Delete** them together, each asked first (deleting is for admins). **Export** downloads the collection in one locale as JSON, and **Import** reads that file back. **New <singular>** creates a document.

### The editor

Opening a document opens the editor. Its header holds, from left to right:

- **The mode switcher.** A page has **Live**, **Structure** and **Data** (no Live for a collection without pages, and a new document opens in Structure). A global has **Fields** and **Where it appears**.
- **The status chip.** Live, Unpublished changes or Not published. Its detail shows the versions ("Draft v5 · live is v4"), the edit lock and the last save, with **Unpublish**, **Archive** or **Restore to draft** where they apply, each asked first.
- **A lock chip**, only while someone else is editing the document ("ada@example.com is editing"). The editor is then read-only, and the API refuses your saves, publishes and deletes until the lock is released.
- **Locale chips**, when the site has more than one locale. A missing locale shows **+**, which creates a draft copied from the default locale, with its own history.
- **Open on site**, for a document with a page: the saved draft on the page itself, or the live page when the site renders no drafts for you (see [Preview drafts on the site](#preview-drafts-on-the-site)).
- **Save draft**, which stores a new version: "Draft saved · v5. The live page is unchanged until you publish."
- **Publish**, which asks "Publish seo v5?", lists what the publish refreshes, and makes that version live. For a page with SEO on, the same question lists the saved version's SEO errors and warnings, errors first, each naming the search engine whose rule raised it and linking the documentation it cites. They are information: a publish goes ahead with any of them, and the question says "No SEO errors or warnings" when there are none.

Your site shows only the published version of each page. Saving never changes the live page. **Publish** makes a version live, and **Unpublish** and **Archive**, in the status chip's detail, take the page offline. Each acts on the locale you are editing.

The modes:

- **Live** shows your site's own draft preview of the page, with its layout, theme and components. Point at a field or section to outline it and click it to edit it: a text field is typed into on the page itself, a section in a markdown editor beside it. Then Save draft to see the site's real rendering. Your page templates mark what they render for this — see [Live editing](/docs/live-editing). Live mode previews the site's default locale only; a version in another locale is edited in Structure mode.
- **Structure** shows the whole document as a form: each field with its label, required or optional, its type, which SEO output reads it, and its help text. Media fields show the image with **Change** and **Clear**. The body is one markdown text area, where `##` headings become sections, with **Split** and **Preview** beside it.
- **Data** shows what the page emits: search result and social card previews, the page's JSON-LD graph with where each value comes from (site, collection, URL pattern, document, computed or linked), its rich results and the findings of each search engine, **Enrich this document**, and the version history with **Diff** and **Restore**. A restore saves the old version as the newest one, and the live page changes when you publish it.

> [!CAUTION]
> Graph edits and document enrichment become versioned drafts. Review, save and publish them before visitors see the changes. Shared site, collection and route policies remain runtime settings.

Beside the canvas, a **side panel** follows what you select. With nothing selected it shows **Metadata** (the groups your collection declares, each under the name your page reads it by, and a read-only **System** line with the status, version, locale and who saved it), **Search and sharing** (the search title and description and the sharing image, each text with its length against the site's limits right under it) and, outside Live mode, **Page & sections** (the sections the page template designs, each present or missing, and the other sections as prose) and **Reach** (each locale's status, and what publishing refreshes). Structured data and rich results are in Data mode. Select a field to see its type and which SEO outputs read it; select a section to see its key and its word count.

**Hide side panel** gives the page the whole width, and **Show side panel** brings it back. Drag the edge between the panel and the page, or focus it and use the arrow keys, to change its width; double-click it for the default. The navigation on the left has the same edge. Studio remembers both widths, and whether the panel is hidden, in your browser.

Leaving with unsaved changes asks first. Unsaved work is kept in the browser and offered back the next time you open the document. While an editor or Studio has the editor open, it holds the document's edit lock and renews it.

A global has no page of its own, so it has no Live mode and no Open on site. **Where it appears** says so — "A global has no page of its own. Publishing it marks every page that reads it stale; they refresh as visitors open them." — and shows the pages that read it, as far as krantho knows, and its history.

### Structure

How search engines and AI assistants read the site. Every page carries one connected Schema.org graph, assembled from four scopes: the site, the collection, a URL pattern and the document. The header has **Validate all pages** and **Fill what's missing**. See [Add SEO](/docs/add-seo) for the setup and [@krantho/seo](/docs/package-seo) for the scopes.

- **Graph** — pick a live page and see its graph as the site serves it: each node with its type, `@id` and what it lacks for a search feature, the links between nodes, and each value with its source. **What the page emits · view-source** shows the JSON-LD, and **Export JSON-LD** downloads it.
- **Scopes & archetypes** — the four scopes in order. The site identity from `krantho.config.ts` is read-only and names its setting. The site entities stored in the database are editable, with import and export. **Collection archetypes** sets the types of each collection's pages, with the impact on its existing pages. Then the catalog of types.
- **Rich results** — one card per search feature the search engines still show: how many pages are eligible out of those it applies to, what is missing, and a link to the rule.
- **Crawlers & assistants** — the sitemap as served, `robots.txt` with an override you can **Save** and **Reset**, and `llms.txt` as the site serves it, with where it comes from.

**Fill what's missing** asks the configured language model for the meta descriptions and Schema.org properties no one has set, over the whole site or one collection. It never overwrites a value someone set. As in Data mode, generated document values are saved as drafts and need publication after review. Changing anything in Structure needs the admin role.

### Media

The files of the site's media store, named in the header. A folder list with counts and **New folder**, a drop zone, search, a tag filter and **Bulk select**. Each tile shows the image, its kind, name, dimensions and how many documents use it. The files go to the store `media.provider` names — local disk, Vercel Blob, an S3-compatible bucket or Google Cloud Storage.

Select a file to open its details, which list the documents that reference it. From there you can:

- Edit the name, alt text, tags and folder. A rename changes only the name Studio shows; it asks first when documents use the file.
- **Replace** the file. It keeps its id, alt text, tags and folder (crop and hotspot reset), and content that held the old file URL is rewritten.
- **Duplicate** it under a new id.
- **Copy markdown** — copies `![<alt text>](/api/media/<id>/image?preset=xl)`. This stable image URL follows a replace, so a body that embeds it shows the new image on the next view.
- **Crop & hotspot** — choose a crop region and the point crops centre on.
- **Delete** it, asked first.

In the editor, a media field picks or uploads an image in place. See [Media](/docs/media) for the file stores and the image URLs.

### Setup

How the site is configured. Each section says where its values come from: the configuration (read-only here, naming the setting), the database (changed here), or the running server.

- **Collections & schema** — every collection, where it renders, and its Schema.org types. **Fields** opens a collection's fields: a field defined in code is locked ("Defined in code, change it in krantho.collections.ts; code always wins"), and admins add, edit and delete runtime fields. **Export as Zod** gives you the merged schema as code, to adopt runtime fields into your codebase.
- **Locales** — the site's locales and the default, with **Add locale**, **Set default** and **Remove**. With more than one locale, a coverage table per collection offers **Create draft** for a missing locale.
- **AI provider** — the AI behind enrichment and the assistant. A provider is on when it has a key, and the screen shows two things: a status line ("AI help is on, using ChatGPT"), the AIs that are **Ready to use** — each with an **In use** mark or **Use this one**, where its key comes from (set up by your developer, or saved here with **Remove key**), **Test**, and an **Advanced** fold for the model and address — and the AIs a key would turn on, each with a key box and **Turn on**, which saves the key, tests it at once and answers in a sentence. Under **For developers** sit OpenRouter, a local Ollama model (an address, no key) and **Claude Code**, which runs on your Claude subscription on your own machine, with `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` (the token `claude setup-token` prints); a deployment uses an AI with an API key. The names come from `@krantho/ai`. When `assistant.provider` is set, a line says which AI the assistant is given. **Run across the site** runs enrichment over the site or one collection: **Fill missing SEO**, **Meta only**, or **Force regenerate**, which also writes over values already set, the editors' own included, after a confirmation that says so; a meta description held in a document's own SEO settings is kept.
- **Integrations** — the webhook delivery log, filtered by All, Pending, Delivered or Failed, with **Retry** on a failed delivery. The webhooks themselves are set in `krantho.config.ts` (see [Configuration](/docs/configuration#webhooks)); failed deliveries are retried automatically before they show here as failed.
- **Checkpoints** — create a checkpoint of the content store, and restore one. A restore takes a safety checkpoint first, returns documents, runtime fields and media records to the checkpoint's time, and marks every cached page stale. Settings, SEO configuration and people are not rewound.
- **People** — the user accounts, when the site signs people in: create a user, change their name or role, deactivate or delete them. The users live in the SQLite or Postgres database.
- **Environment** — what the running server reports: framework, persistence, auth mode, schema version and each feature.

### The assistant

With `assistant.enabled`, the **Assistant** item at the bottom of the navigation opens a chat panel beside the page you are working on. Editors ask for content and SEO work in plain language: find a page, draft one from a brief, shorten a description, write an FAQ from a document. What it writes is saved as a draft. Publishing, deleting and replacing text wait for your confirmation in the chat, with the exact change shown. See [The Studio assistant](/docs/assistant).

## Preview drafts on the site

**Open on site** in the editor header shows an editor the saved current version on the page itself, unpublished changes included, while visitors keep the published page. Live mode loads the same preview inside Studio. Both need the server's `sitePreview` capability and the editor or admin role, and a document whose collection has pages; globals have none. Without the capability, or for a viewer, Open on site opens the live page instead, and nothing while no version is live.

The preview opens `GET /api/preview?collection=&slug=`, which checks the editor role and sends the editor to the document's page: where its collection's `path` says, or without one `pages` at the site root (`home` at `/`) and other collections at `/<collection>/<slug>`. A collection declared with `path: false` has no page, and the API refuses the preview. A preview reads the document and its JSON-LD from the current version, uncached; lists on the page still show published documents. The preview entry carries no locale, so it shows the default locale's version.

How the page knows it is a preview depends on the framework.

**Next.js** — built in. `/api/preview` turns on Next.js draft mode and redirects to the page, which Next.js then renders per request, never cached; `/api/preview/exit?path=/about` leaves draft mode and returns to that path. Outside `next dev` the draft-mode cookie is `Secure`, so a production build previews over HTTPS, or on `localhost` in browsers that treat it as secure. Show the editor a way out in a layout:

```tsx title="app/(site)/layout.tsx"
import { showPreviewBanner } from '@krantho/server-next'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const previewing = await showPreviewBanner()
  return (
    <>
      {previewing && (
        <p className="preview-banner">
          Previewing drafts — <a href="/api/preview/exit">Exit preview</a>
        </p>
      )}
      {children}
    </>
  )
}
```

`showPreviewBanner()` is false when a frame shows the page, as Studio's Live mode does, so the banner stays out of the editing view. The page still reads the draft.

**SvelteKit and Express** — a signed link. Pass `sitePreview: 'signed-url'` to the API handlers (`createApiHandlers` in SvelteKit, `createHandler` from `@krantho/server-node`). The editor lands on `/about?krantho-preview=<token>`, valid for ten minutes and for that page only. The SvelteKit hook `createPageCacheHandle` and the Express helper `renderCachedPage` verify it and answer the draft with `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`. Without `KRANTHO_JWT_SECRET` the process signs and verifies the links with one ephemeral secret of its own, which is enough on one server in development. Set `KRANTHO_JWT_SECRET` to one value on every instance wherever a site runs more than one, or a link signed by one instance renders the published page on another. See [Deploy behind a CDN](/docs/deploy-cdn).

The same preview is what Studio's Live mode shows to edit a page in place, in a frame on the site's own origin. Your page templates mark the fields and sections they render for it; see [Live editing](/docs/live-editing). A site that sends `Content-Security-Policy: frame-ancestors` must allow `'self'`, or Live mode shows its empty state.

## Configure authentication

Studio supports three auth modes, set in the `auth` section of `krantho.config.ts`. Secrets stay in the environment — see the [configuration reference](/docs/configuration).

### No auth (default)

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  auth: { mode: 'none' },
})
```

Anyone who can reach `/studio` has full access. Suitable for local development and private deployments.

### Token auth

```ts title="krantho.config.ts"
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  auth: { mode: 'token' }, // the secret comes from KRANTHO_API_TOKEN
})
```

Users sign in with a token. Studio shows a sign-in form when no session exists. Sessions use JWT access tokens and refresh tokens.

### OIDC auth

```ts title="krantho.config.ts"
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  auth: {
    mode: 'oidc',
    oidc: {
      issuer: 'https://accounts.example.com',
      clientId: 'krantho-studio',
      redirectUri: 'https://example.com/api/auth/callback',
    },
  },
})
```

Delegates sign-in to an external identity provider (Google, Auth0, Sign in with Vercel and others) with the authorization-code flow, PKCE and a nonce. The issuer, client ID and redirect URI can also come from `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID` and `OIDC_REDIRECT_URI`; the redirect URI is always `https://<your-domain>/api/auth/callback`. Signing out also signs out of the provider when it offers an end-session endpoint.

- **Client secret.** If the provider registers krantho as a confidential client, set `OIDC_CLIENT_SECRET`; it is sent on the token exchange. Leave it unset for a public client.
- **Serverless and several instances.** The sign-in in progress travels in a short-lived encrypted cookie, so the login and the callback may reach different instances. Every instance must share `KRANTHO_JWT_SECRET`.
- **Who gets in.** With `KRANTHO_SIGNUP=closed` (the default) only existing users sign in — except an email listed in `KRANTHO_ADMIN_EMAILS`, which may create its account and becomes admin. That is how the first admin gets in. With `KRANTHO_SIGNUP=open`, anyone the provider authenticates gets an account with `auth.oidc.newUserRole` (viewer by default).

### Gate /studio behind sign-in

By default (`auth.oidc.studioEntry: 'login'`) `/studio` serves the app to anyone, and the app shows its sign-in page with a **Sign in with** button for the configured provider. Set `KRANTHO_AUTH_OIDC_STUDIO_ENTRY=redirect` (or `auth: { oidc: { studioEntry: 'redirect' } }`) and pass your configuration to the Studio route (`createStudioRouteHandler({ config })`, `createStudioHandler({ config })` or `createStudioServer(config)`) to gate it:

- A visitor with a valid access token gets Studio.
- When the access token has expired but the refresh cookie is still there (30 days by default), the visitor is sent through `GET /api/auth/refresh`, which issues a new session and returns them to the Studio page they asked for — no trip to the provider.
- A visitor with neither, or whose refresh token is no longer valid, is sent to the provider's sign-in and back to the Studio page they asked for.
- A sign-in the provider or krantho refuses answers `404`, so Studio's existence is not revealed; the reason is logged on the server.
- Studio pages served behind the gate are `Cache-Control: private`, so a shared cache never hands them to another visitor.
- The build's hashed files under `/studio/assets/` are served without the gate. They hold no data, and a running Studio keeps loading its code after the access cookie expires.

The gate verifies session cookies itself, so `redirect` requires `KRANTHO_JWT_SECRET`; configuration validation fails without it. Without the configuration passed to the Studio route, `/studio` stays ungated.

### Sign in with Vercel

1. In the Vercel dashboard, open your team's **Settings → Apps** and click **Create**.
2. On the app's **Manage** page, add `https://<your-domain>/api/auth/callback` under **Authorization Callback URLs**.
3. Under **Permissions**, enable `openid`, `email` and `profile`.
4. Under **Authentication**, choose `client_secret_post` and **Generate** a client secret (or choose `none` and skip `OIDC_CLIENT_SECRET`).
5. Optionally set **Sign-In Access** to **Members of the team**.

Then set these environment variables on the deployment:

```bash
KRANTHO_AUTH=oidc
OIDC_ISSUER_URL=https://vercel.com
OIDC_CLIENT_ID=<client ID from the app>
OIDC_CLIENT_SECRET=<generated client secret>
OIDC_REDIRECT_URI=https://<your-domain>/api/auth/callback
KRANTHO_ADMIN_EMAILS=<your Vercel account email>
KRANTHO_JWT_SECRET=<random, at least 32 bytes>
KRANTHO_AUTH_SESSION_SECURE=always
```

To [gate /studio](#gate-studio-behind-sign-in), also set `KRANTHO_AUTH_OIDC_STUDIO_ENTRY=redirect`: someone already signed in to Vercel who has approved the app goes straight into Studio, and anyone Vercel or krantho refuses gets a 404.

Vercel has no end-session endpoint, so signing out ends the krantho session only. In production the server warns at startup when auth is `none`, or when `KRANTHO_JWT_SECRET` is unset.

### Roles

Roles form a hierarchy: `admin` > `editor` > `viewer`, and apply to the whole site. Apart from the two Setup tabs below, every role sees the same destinations and tabs; a control the API refuses a role is hidden or shown read-only.

- **viewer** — reads what Studio shows them, and changes nothing.
- **editor** — saves, publishes and unpublishes documents, opens the draft preview (Live mode and Open on site), uploads and changes media, and creates checkpoints.
- **admin** — also deletes documents, restores versions, changes Structure, saves a page's graph in Data mode, runs enrichment, edits runtime fields and locales, sets the AI provider, reads the webhook log and retries deliveries, restores and deletes checkpoints, and manages people.

**Setup › People** shows to admins when the site signs people in (`auth.mode` is `token` or `oidc`). **Setup › Collections & schema** shows with the `runtimeSchema` capability, to admins when the site signs people in. Under `auth.mode: 'none'` everyone is an admin.

## Capabilities

Studio reads the server's capabilities from `GET /api/capabilities` when it starts. They decide which destinations, tabs and actions it shows:

- `media` — **Media** and the image editor (its value is the file store: `local`, `vercel-blob`, `s3` or `gcs`); `mediaFolders` adds the folders
- `seo` — **Structure**, and the SEO parts of Pulse, Site and the editor
- `checkpoints` — **Setup › Checkpoints**
- `webhookDeliveries` — **Setup › Integrations**
- `runtimeSchema` — **Setup › Collections & schema**
- `sitePreview` — Live mode and the draft behind **Open on site** (`draft-mode` on Next.js, `signed-url` when the API handlers get `sitePreview: 'signed-url'`)
- `assistant` — the assistant panel, opened from the navigation ([The Studio assistant](/docs/assistant))

A capability is on when the server has the matching adapter or configuration. For example, `media` is on when `media.provider` is set. The site's locales and its default locale come from the configuration (`site.supportedLocales`, `site.defaultLocale`). **Setup › Locales** lets an admin choose which of the configured locales are active, but never changes the default; Studio shows translation coverage when more than one is active.

## Themes

Studio has light, dark and system themes. Switch with the three buttons (Light, Dark, System) in the navigation footer; the choice is remembered in this browser, apart from the site's own theme. With no choice made, Studio follows the operating system.

## Run Studio in development

To work on Studio itself, start its Vite dev server from a checkout of the krantho repository:

```bash
pnpm --filter @krantho/studio run dev
```

The dev server proxies `/api` requests to `http://localhost:3333`. Run a krantho server on port 3333 in a separate terminal.
