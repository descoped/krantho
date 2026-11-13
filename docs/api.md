# @krantho/api

Framework-agnostic API layer for the krantho content management system. Provides route-matched HTTP handlers for content CRUD, versioning, locking, media management, SEO configuration, authentication, user management, checkpoints, migrations, settings, webhooks, and a plugin system. Server adapters (`@krantho/server-next`, `@krantho/server-sveltekit`, `@krantho/server-node`) wrap these handlers for specific frameworks.

## Context

Web frameworks need HTTP endpoints to serve Studio and external integrations. Rather than coupling route handling to Next.js or SvelteKit, `@krantho/api` defines a framework-agnostic request/response model (`ApiRequest`/`ApiResponse`) and a router that dispatches to typed handler functions. Framework-specific packages convert native requests into `ApiRequest`, call the router, and convert back.

This separation means the entire API surface is tested and maintained in one place, regardless of which framework hosts it.

## Rationale

- **Separate package**: Decouples HTTP handling from persistence and content engine. Server adapters depend on `@krantho/api` without pulling in framework-specific code.
- **Framework-agnostic types**: `ApiRequest`/`ApiResponse` are plain objects. No dependency on `Request`/`Response` Web APIs, Node `http`, or framework-specific types.
- **Zod as peer dependency**: Schema validation uses Zod for frontmatter validation. Declared as a peer to avoid version conflicts with consumer projects.
- **Plugin system over middleware**: Plugins provide hooks, routes, Studio pages, and field types through a declarative manifest rather than imperative middleware chains.

## Architecture

```
src/
  create-api-handlers.ts   # Factory: wires router, context, auth, plugins, webhooks
  router.ts                # Pattern-based URL router with param extraction
  types.ts                 # ApiRequest, ApiResponse, ApiContext, MediaConfig
  hooks.ts                 # ContentHooks lifecycle (beforeSave, afterCreate, etc.)
  webhooks.ts              # Webhook delivery with HMAC signing + retry
  plugins.ts               # KranthoPlugin interface and plugin loader
  jwt.ts                   # JWT signing and verification
  media-library.ts         # MediaLibrary: metadata adapter + file store, the one IMediaStorage
  image-dimensions.ts      # detectDimensions: header-based PNG/JPEG/GIF/WebP sizes
  image-url.ts             # imageRevision, resolveVariant, variantUrl (cache-safe image URLs)
  image-optimizer.ts       # On-the-fly image transformation (resize, format, quality)
  image-cache.ts           # In-memory cache for optimized image variants
  openapi.ts               # Auto-generated OpenAPI 3.1 spec + Scalar docs
  validators.ts            # Request validation helpers
  save-document.ts         # saveDocument, prepareFields, savedChange: the save path of create/update (and the assistant)
  document-actions.ts      # deleteDocument, changePublication: delete, publish, unpublish and archive addressed by collection, slug and locale
  content-locks.ts         # lockHolder, lockedByOther: the edit-lock check of every save, publication and delete
  seo-config-snapshot.ts   # every stored SEO configuration, read once and answered from memory
  seo-site-findings.ts     # siteSeoSummary: the SEO findings and search features of every published page
  seo-validation.ts        # validateDocumentSeo: title, meta description and rich-result findings
  middleware/
    auth.ts                # Token and OIDC authentication (JWT-based)
  handlers/
    index.ts               # All route handler functions (barrel export)
  assistant/               # The Studio assistant: routes, agent loop, tools, proposals (see docs/assistant.md)
    tools/                 # Read, draft, SEO, AEO and publish/delete tools
```

**Data flow**: `createApiHandlers(config)` builds an `ApiContext` (adapter, engine, config, sub-adapters), registers all routes on an `ApiRouter`, and returns an `ApiHandlers` object. The `handle(req)` method runs auth middleware, matches the route, extracts path params, and calls the handler with the enriched request and context.

**Extension points**:
- `ContentHooks` for lifecycle interception (beforeSave, afterCreate, etc.)
- `KranthoPlugin` for adding routes, hooks, Studio pages, and field types
- `WebhookConfig` for outbound event notifications with HMAC signing and retry
- `config.auth` (from `@krantho/config`) for JWT-based token or OIDC authentication

## API Reference

### createApiHandlers

```ts
function createApiHandlers(config: CreateApiHandlersConfig): ApiHandlers
```

Factory that wires up the full API. Registers all routes (media, content, SEO, Studio, plugins), merges plugin hooks, configures auth and webhooks, and returns an `ApiHandlers` object.

### CreateApiHandlersConfig

```ts
interface CreateApiHandlersConfig {
  /** Content collection definitions and schema configuration */
  contentConfig: ContentConfig
  /** The resolved configuration tree from @krantho/config */
  config: KranthoConfig
  /** Primary persistence adapter (SQLite, Postgres, filesystem, hybrid) */
  adapter: IPersistenceAdapter
  /** Content engine for reading/writing/searching content */
  engine: IContentEngine
  /** Page definitions for route resolution */
  pages?: readonly PageDefinition[] | undefined
  /** Outbound webhook configurations */
  webhooks?: readonly WebhookConfig[] | undefined
  /** Content lifecycle hooks */
  hooks?: ContentHooks | undefined
  /** Told about every committed write, inside the request that made it */
  onContentChange?: ContentChangeListener | undefined
  /**
   * Keep work that outlives a request (the SEO enrichment job) running until it
   * settles, on hosts that end a request's work with its response
   */
  waitUntil?: ((work: Promise<unknown>) => void) | undefined
  /** How the host renders drafts for editors on the site: registers `GET /api/preview` */
  sitePreview?: 'draft-mode' | 'signed-url' | undefined
  /** The server package hosting the API, reported by `GET /api/capabilities`; each server package sets it */
  framework?: 'next' | 'sveltekit' | 'node' | undefined
  /** Plugins for custom routes, hooks, Studio pages, field types */
  plugins?: KranthoPlugin[] | undefined
  /** Media metadata, folders and file store (enables media routes when present) */
  media?: MediaConfig | undefined
  /** Checkpoint adapter for backup/restore */
  checkpoints?: ICheckpointAdapter | undefined
  /** Content migration adapter for conflict resolution */
  contentMigration?: IContentMigrationAdapter | undefined
  /** Auth adapter for user/token CRUD operations */
  authAdapter?: IAuthAdapter | undefined
  /** Current schema version from migration runner */
  schemaVersion?: number | undefined
  /** Persistence adapter type for capabilities reporting */
  persistenceType?: 'filesystem' | 'sqlite' | 'postgres' | undefined
  /** Advisory lock adapter for content locking */
  lockAdapter?: ILockAdapter | undefined
  /** The page cache the site's instances share, when `cache.shared` is `database` (publish impact counts its entries) */
  pageCacheStore?: IPageCacheStore | undefined
  /** Webhook delivery log adapter */
  webhookDeliveryAdapter?: IWebhookDeliveryAdapter | undefined
  /** Version retention adapter for purging old versions */
  retentionAdapter?: IRetentionAdapter | undefined
  /** Site settings adapter for locale and LLM settings */
  siteSettingsAdapter?: ISiteSettingsAdapter | undefined
  /** SEO configuration adapter for archetype config CRUD */
  seoConfigAdapter?: ISeoConfigAdapter | undefined
}
```

### ApiContext

Shared context passed to all route handlers. Built from `CreateApiHandlersConfig` during initialization.

```ts
interface ApiContext {
  contentConfig: ContentConfig
  /** The resolved configuration tree -- the only place a handler reads settings from */
  config: KranthoConfig
  adapter: IPersistenceAdapter
  engine: IContentEngine
  /** Authenticated user (set by auth middleware per request) */
  auth?: AuthenticatedUser | undefined
  pages?: readonly PageDefinition[] | undefined
  /** Fire webhook callback after content mutations */
  fireWebhook?: ((event: string, collection: string, slug: string) => void) | undefined
  /** The configured webhooks: a retried delivery is sent to the one with its URL, signed with its secret */
  webhooks?: readonly WebhookConfig[] | undefined
  /** Merged lifecycle hooks (config + plugin hooks chained) */
  contentHooks?: ContentHooks | undefined
  /** Media library (a MediaLibrary over the configured metadata adapter and file store) */
  mediaStorage?: IMediaStorage | undefined
  /** Media folder storage adapter */
  mediaFolderStorage?: IMediaFolderStorage | undefined
  /** The file store's display name (e.g. 'Local disk', 'Vercel Blob') */
  mediaStorageLabel?: string | undefined
  /** The file store's directory or bucket, when it has one */
  mediaStoragePath?: string | undefined
  /** Image optimizer for on-the-fly transformations */
  imageOptimizer?: ImageOptimizer | undefined
  /** In-memory image variant cache */
  imageCache?: ImageCache | undefined
  /** Checkpoint adapter for backup/restore */
  checkpointAdapter?: ICheckpointAdapter | undefined
  /** Current schema version from migration runner */
  schemaVersion?: number | undefined
  /** Persistence adapter type */
  persistenceType?: 'filesystem' | 'sqlite' | 'postgres' | undefined
  /** Content migration adapter for conflict resolution */
  contentMigrationAdapter?: IContentMigrationAdapter | undefined
  /** Auth adapter for user/token operations */
  authAdapter?: IAuthAdapter | undefined
  /** Advisory lock adapter */
  lockAdapter?: ILockAdapter | undefined
  /** Webhook delivery log adapter */
  webhookDeliveryAdapter?: IWebhookDeliveryAdapter | undefined
  /** Version retention adapter */
  retentionAdapter?: IRetentionAdapter | undefined
  /** Site settings adapter */
  siteSettingsAdapter?: ISiteSettingsAdapter | undefined
  /** SEO configuration adapter */
  seoConfigAdapter?: ISeoConfigAdapter | undefined
  /** The page cache the site's instances share, when `cache.shared` is `database` */
  pageCacheStore?: IPageCacheStore | undefined
  /** The server package hosting the API */
  framework?: 'next' | 'sveltekit' | 'node' | undefined
}
```

### AuthenticatedUser

Attached to `ctx.auth` after successful authentication.

```ts
interface AuthenticatedUser {
  id: string
  email: string
  name: string
  roles: Role[]
  mode: 'none' | 'token' | 'oidc'
}
```

In `none` mode, all requests receive an anonymous user with `admin` role. In `token`/`oidc` mode, unauthenticated GET requests receive an anonymous user with `viewer` role (unless `requireAuthForReads` is set), while write requests require a valid JWT.

### Auth configuration

Auth has no config object of its own — it is the `auth` section of the resolved
configuration tree (`AuthSection` from `@krantho/config`), reached by handlers as
`ctx.config.auth`. It carries the mode, the token-mode identity, the OIDC client,
the session TTLs and cookie policy, and the signing secret:

```ts
const config = defineKranthoConfig({
  auth: {
    mode: 'token',            // KRANTHO_AUTH
    token: { secret: '...' }, // KRANTHO_API_TOKEN
    jwtSecret: '...',         // KRANTHO_JWT_SECRET
    requireAuthForReads: false,
    session: { accessTtlSec: 900, cookiePrefix: 'krantho', secure: 'auto', sameSite: 'lax' },
  },
})
```

The signing secret resolves environment over code; when neither sets it, the API
generates an ephemeral one and warns that sessions will not survive a restart.
`resolveJwtSecret(auth)` (exported) is that resolution: the configured `auth.jwtSecret`, or
one ephemeral secret for the whole process, generated the first time it is needed. Every
caller in the process gets the same value, so the API and the pages it serves agree on it --
`verifyPreviewRequest()` in `@krantho/server` verifies signed preview links with it.

Token extraction order: the `<cookiePrefix>_access` cookie first (browser sessions),
then `Authorization: Bearer <token>` header (API clients). Both modes use JWT
verification with the resolved `auth.jwtSecret`.

Session cookies carry `Secure` according to `auth.session.secure`: `always`,
`never`, or `auto` (the default), which trusts a `x-forwarded-proto: https`
header. Setting `auth.trustProxy` widens `auto` to also accept a proxy-chain
`x-forwarded-proto` list, `x-forwarded-ssl: on`, and RFC 7239 `Forwarded`.

### OIDC sign-in

`GET /api/auth/login/oidc` starts an authorization-code flow with PKCE (S256),
a `state` and a `nonce`, and redirects to the provider's authorize endpoint. It
accepts an optional `?returnTo=/path` — a same-origin path the browser lands on
after sign-in; anything else falls back to `/studio/`. The provider returns the
browser to `GET /api/auth/callback`, which is the value `auth.oidc.redirectUri`
(`OIDC_REDIRECT_URI`) must name: `https://<domain>/api/auth/callback`.

Nothing about a pending sign-in is held in server memory. The state, PKCE
verifier, nonce and return path travel in a `<cookiePrefix>_oidc` cookie —
HttpOnly, `SameSite=Lax`, ten-minute `Max-Age`, encrypted and authenticated
with a key derived from `auth.jwtSecret` — and the callback clears it whatever
the outcome. Login and callback may therefore land on different instances, as
they routinely do on serverless platforms, provided every instance shares
`KRANTHO_JWT_SECRET`.

The callback checks the state against the cookie, exchanges the code with the
stored verifier, and verifies the ID token: RS256 signature against the
provider's JWKS, issuer, audience, expiry, and the nonce. With
`auth.oidc.clientSecret` (`OIDC_CLIENT_SECRET`) set, the token exchange sends it
as `client_secret_post` (a confidential client); unset, krantho is a public
client and sends none. When the ID token carries no `email`, krantho reads it
from the provider's userinfo endpoint (GET, access token as Bearer).

Provisioning: a returning user is matched by issuer and subject, then by email.
A first-time user is created when `auth.oidc.signup` is `open`, with
`auth.oidc.newUserRole`. With signup `closed`, only an email listed in
`auth.oidc.adminEmails` may create its account — the bootstrap for the first
admin on an empty user table — and only when the provider has not marked it
`email_verified: false`. Listed emails are promoted to `admin` on every sign-in.

#### Sign in with Vercel

Vercel is a standard OIDC provider (issuer `https://vercel.com`, RS256 ID
tokens, PKCE S256, no end-session endpoint, so logout clears only the krantho
session). In the Vercel dashboard, under your team's **Settings → Apps**,
create an app, then on its **Manage** page:

- **Authorization Callback URLs** — add `https://<domain>/api/auth/callback`
  (and `http://localhost:<port>/api/auth/callback` for local development).
- **Permissions** — enable `openid`, `email` and `profile`.
- **Authentication** — choose `client_secret_post` and **Generate** a client
  secret, or choose `none` for a public client and leave `OIDC_CLIENT_SECRET`
  unset.
- **Sign-In Access** (on the app's **General** page) — **Members of the team**
  keeps sign-in to your team; krantho's own signup policy applies on top.

To make `/studio` sign in automatically and answer 404 to anyone refused, set
`KRANTHO_AUTH_OIDC_STUDIO_ENTRY=redirect` and pass the configuration to Studio
route handler (`createStudioRouteHandler({ config })`). A visitor without a session
is sent to Vercel; a user already signed in to Vercel who has approved the app
comes straight back into Studio. A refused sign-in — Vercel's `access_denied`
for someone outside the team, or krantho refusing an email — answers 404, and the
reason is logged. Requires `KRANTHO_JWT_SECRET`, which the gate and the API share.

Then set, on every environment that serves Studio:

```bash
KRANTHO_AUTH=oidc
OIDC_ISSUER_URL=https://vercel.com
OIDC_CLIENT_ID=<client ID from the app>
OIDC_CLIENT_SECRET=<generated client secret>   # omit for client authentication "none"
OIDC_REDIRECT_URI=https://<domain>/api/auth/callback
KRANTHO_ADMIN_EMAILS=<your Vercel account email>
KRANTHO_JWT_SECRET=<random, at least 32 bytes>
KRANTHO_AUTH_SESSION_SECURE=always
```

`OIDC_REDIRECT_URI` is one fixed value, so it must match the domain Studio is
served from; a preview deployment on another domain needs its own value (and a
matching callback URL registered with the app) to complete sign-in.

In production (`NODE_ENV=production`) the server logs a warning at startup when
`auth.mode` is `none` — every visitor is an admin — or when `auth.jwtSecret` is
unset, since each instance would then sign sessions and sign-in state with its
own ephemeral key.

### Workload identity

A CI job can call the API without a stored secret. The platform that runs the job (GitHub
Actions, GitLab, any OIDC-issuing workload platform) signs a short-lived identity token (a
JWT) for it, and the job presents the token as `Authorization: Bearer <jwt>`. The site checks
the token against the one issuer its configuration trusts and grants a narrow identity.

Three leaves of the `auth.workload` section turn it on, and the feature is on only when all
three are set. A partial configuration fails startup, naming the missing leaves.

| Variable | Path | Meaning |
| --- | --- | --- |
| `KRANTHO_AUTH_WORKLOAD_ISSUER` | `auth.workload.issuer` | Issuer URL (https), for example `https://token.actions.githubusercontent.com` |
| `KRANTHO_AUTH_WORKLOAD_AUDIENCE` | `auth.workload.audience` | The audience the workflow asks the platform for, usually the site URL |
| `KRANTHO_AUTH_WORKLOAD_SUBJECTS` | `auth.workload.subjects` | Comma-separated subjects: an exact value, or a prefix ending in a single `*` |

A token is accepted only when all of these hold: the header `alg` is exactly `RS256`; the
signature verifies against a key in the issuer's JWKS picked by `kid` (an unknown `kid`
refetches the key set, at most once a minute); `iss` equals the configured issuer byte for byte (no trailing slash is added or removed); `aud` equals the configured
audience; `exp` lies ahead and `nbf` and `iat` do not (60 seconds of clock skew are allowed);
and `sub` matches one of the subject patterns. The key set is found through the discovery
document of the *configured* issuer, never through anything the token says. Any failure,
including an unreachable issuer, answers `401 { "error": "Invalid workload token" }` with no
detail.

The identity granted is `{ id: 'workload:<sub>', email: '<sub>', name: 'CI workload', roles:
['editor'] }`, limited to GET and HEAD on the paths in `WORKLOAD_PATHS` (`/api/changes` and
`/api/migrations/conflicts`), which need an editor. Any other method or path with a valid token
answers `403`, so the identity reads and nothing more. A Bearer token whose `iss` is not the
workload issuer goes through the normal session checks unchanged, and a token that names the
workload issuer never falls back to them. The feature does nothing when `auth.mode` is
`none`. Public routes and the machine reads stay open as before.

A GitHub Actions job asks for the token with the `id-token: write` permission and sends it:

```yaml
permissions:
  id-token: write
steps:
  - name: Read the changes
    run: |
      TOKEN=$(curl -sH "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
        "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=https://example.com" | jq -r .value)
      curl -sH "Authorization: Bearer $TOKEN" https://example.com/api/changes
```

Security notes: name the repository in the subject patterns (`repo:ORG/REPO:*`), and a branch
when the job should run from one only (`repo:ORG/REPO:ref:refs/heads/main`); a pattern for
`repo:ORG/*` would trust every repository of the organization. No secret is stored on either
side: the token lives for minutes and the audience ties it to this site.

### Site identity

Handlers read the site's identity from `ctx.config.site` (`SiteSection` from
`@krantho/config`): `domain`, `name`, `language`, `baseUrl`, `supportedLocales`
and `defaultLocale`. `GET /api/site-config` returns that section together with the
page-cache settings (`cache: { pages, shared }`, from the `cache` section) and the
registered collections.

### MediaConfig

```ts
interface MediaConfig {
  /** Versioned media metadata in the configured persistence */
  metadata: IMediaMetadataAdapter
  /** Folder tree in the same persistence */
  folders: IMediaFolderStorage
  /** Where the file bytes live (local disk, Vercel Blob, S3, Google Cloud Storage) */
  files: IFileStore
}
```

When `media` is provided in `CreateApiHandlersConfig`, all media routes are registered. Without it, media endpoints are not available. `@krantho/server` builds it from `media.provider` (see [guides/media.md](guides/media.md)).

The context composes the three into a `MediaLibrary` -- the one `IMediaStorage` implementation. It owns the rules: MIME and size limits (`media.allowedMimeTypes`, `media.maxFileSize`), dimension detection, and object keys. Every file gets a fresh, flat key that is never reused (`<timestamp>-<random>-<slugified name>`), so an object's content never changes:

- **Rename** changes only the display `filename`; the key and `url` stay.
- **Replace** writes the new file under a new key, appends a version pointing at it (crop and hotspot reset), then deletes the old object.
- **Delete** appends a tombstone version, then deletes the object.
- **Duplicate** copies the object to a new key.
- A file written for an insert that then fails is deleted again.
- `readOriginal(id)` reads the bytes from the file store, or fetches the `url` of a registered item.

### ApiRequest / ApiResponse

```ts
interface ApiRequest {
  method: string
  path: string
  params: Record<string, string>
  query: Record<string, string>
  body?: unknown | undefined
  headers?: Record<string, string> | undefined
  /** Original web Request for streaming (used by media upload) */
  rawRequest?: Request | undefined
  /** Parsed multipart files (used by media upload) */
  files?: Array<{
    name: string
    data: Uint8Array
    filename: string
    mimeType: string
  }> | undefined
}

interface ApiResponse {
  status: number
  /** JSON by default; a string or bytes as is; a `ReadableStream<Uint8Array>` is streamed to the client as is */
  body: unknown
  headers?: Record<string, string> | undefined
  /** Set-Cookie values — one per cookie, emitted as separate header lines (RFC 6265) */
  cookies?: readonly string[] | undefined
}
```

A handler that returns a `ReadableStream<Uint8Array>` body streams it: `toResponse` in `@krantho/server` hands it to the Web `Response` unread (the content type defaults to `application/octet-stream` when the handler sets none). Next.js and SvelteKit pass that `Response` through; a Node server writes it with `writeWebResponse` from `@krantho/server-node`, which pipes it chunk by chunk. The assistant's chat is such a response (`text/event-stream`).

### ContentItemResponse / ErrorResponse

```ts
interface ContentItemResponse {
  metadata: Record<string, Record<string, unknown>>
  contract: ContentContract
  defaults: DefaultProvenance[]
  repositoryBasis: { checksum: string; version: number } | null
  meta: {
    collection: string
    slug: string
    locale: string
    version: number
    status: string
    source: string
    changedBy: string | null
    createdAt: string
  }
  fields: Record<string, unknown>
  body: string
  html: string
  sections: Record<string, string>
}

interface ErrorResponse {
  error: string
  details?: unknown | undefined
}
```

---

## Route Map

Routes are organized into registration groups. Media routes are only registered when the `media` option is provided. All routes except public routes pass through `checkAuth` middleware (after the workload identity check, which only acts on a Bearer token from the configured workload issuer). Every `GET` route also answers `HEAD` (`answerHead` in `head.ts`): the `GET` handler runs, and the response keeps its status, headers, cookies and the content type its body would have had, without the body.

### Public Routes (no auth required)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/capabilities` | `capabilities` | System capabilities and persistence type |
| GET | `/api/openapi.json` | `openApiSpec` | Auto-generated OpenAPI 3.1 specification |
| GET | `/api/docs` | `openApiDocs` | Scalar interactive API documentation |
| GET | `/api/auth/capabilities` | `authCapabilities` | Auth mode and available login methods |
| POST | `/api/auth/login` | `authLogin` | Authenticate with email/password, returns JWT |
| POST | `/api/auth/refresh` | `authRefresh` | Refresh an expiring JWT |
| GET | `/api/auth/refresh` | `authRefreshRedirect` | Refresh for a page navigation: redirects to `?returnTo=/path` with the new pair, or redirects to the sign-in (`/api/auth/login/oidc` in `oidc` mode) without touching the cookies |
| GET | `/api/auth/login/oidc` | `authOidcLogin` | Initiate OIDC login redirect (optional `?returnTo=/path`) |
| GET | `/api/auth/callback` | `authCallback` | OIDC callback handler |
| POST | `/api/auth/logout` | `authLogout` | Clear auth session |
| GET | `/api/auth/me` | `authMe` | Current authenticated user info |

`GET /api/capabilities` answers `{ persistence, framework, authMode, schemaVersion, features }`. `framework` names the server package hosting the API — `'next'` (`@krantho/server-next`), `'sveltekit'` (`@krantho/server-sveltekit`) or `'node'` (`@krantho/server-node`), each passing its name when it creates the handler — and is `null` for an API created without one (`CreateApiHandlersConfig.framework`). In `features`, a feature name maps to its state (`write`, `versioning`, `checkpoints`, `contentMigration`, `media`, `mediaFolders`, `imageOptimizer`, `runtimeSchema`, `webhooks`, `webhookDeliveries`, `seo`, `sitePreview`, `localization`). `features.assistant` is `'enabled'` when `assistant.enabled` is set and absent otherwise — Studio treats a missing key as off.

### Media Routes (`registerMediaRoutes`)

Registered only when the `media` option of `createApiHandlers` is provided.

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/media/info` | `mediaInfo` | Storage info (type label, path) and the library's figures: `totalItems`, `totalSize` and `folderCounts` (by folder id), exact for any size |
| GET | `/api/media` | `mediaList` | List media assets with filtering and pagination |
| POST | `/api/media/upload` | `mediaUpload` | Upload new media file(s) via multipart |
| POST | `/api/media/register` | `mediaRegister` | Register an externally-hosted media asset (`url` must be an absolute http(s) URL, else 400) |
| DELETE | `/api/media/bulk` | `mediaBulkDelete` | Bulk delete media assets by ID |
| PUT | `/api/media/bulk` | `mediaBulkUpdate` | Bulk update media metadata (tags, folder) |
| GET | `/api/media/folders` | `mediaFolders` | List all media folders |
| POST | `/api/media/folders` | `mediaFolderCreate` | Create a new media folder |
| PUT | `/api/media/folders/:id` | `mediaFolderRename` | Rename a media folder |
| DELETE | `/api/media/folders/:id` | `mediaFolderDelete` | Delete a media folder |
| GET | `/api/media/tags` | `mediaTags` | List all used media tags |
| GET | `/api/media/:id/image/info` | `mediaImageInfo` | Image metadata (dimensions, format, EXIF) |
| GET | `/api/media/:id/image` | `mediaImage` | Optimized image variant (see [Image URLs](#image-urls)) |
| HEAD | `/api/media/:id/image` | `mediaImage` | Image headers only |
| GET | `/api/media/:id/usage` | `mediaUsage` | Content references to this media asset |
| GET | `/api/media/usage?ids=a,b` | `mediaUsageBatch` | Content references to each of up to 200 assets, every collection read once: `{ usage: { [id]: [...] } }` |
| POST | `/api/media/:id/replace` | `mediaReplace` | Replace the file, keep the id; content holding the old url is rewritten |
| POST | `/api/media/:id/duplicate` | `mediaDuplicate` | Duplicate a media asset |
| PUT | `/api/media/:id/move` | `mediaMove` | Move media asset to a different folder |
| GET | `/api/media/:id` | `mediaGet` | Get single media asset by ID |
| PUT | `/api/media/:id` | `mediaUpdate` | Update media metadata (title, alt, tags, etc.) |
| DELETE | `/api/media/:id` | `mediaDelete` | Delete a single media asset |

A replace rewrites the old url in every document that holds it (`updateMediaReferences`), each as a new version. A document whose current version is live is rewritten as a publish, so its live page keeps working links; a document with saved changes ahead of live gets the new url in its current version only, a save.

#### Image URLs

`/api/media/:id/image` answers two kinds of URL, so a replaced image shows on the next page view while unchanged images stay cached behind any CDN, with no purge.

**The stable URL** -- `/api/media/:id/image?preset=xl` (or `?w=`, `?fmt=`, `?aspect=`), with no `rev`. This is the URL content and pages embed. The handler reads the item, resolves the variant and answers:

```
302 Found
Location: /api/media/<id>/image?preset=xl&fmt=avif&rev=3f9c0a1b2d4e
Cache-Control: no-cache
Vary: Accept
```

- `preset` is `xs`, `sm`, `md` (the default), `lg`, `xl` or `full`; the widths come from `media.image.presets`. `w=<pixels>` maps to the nearest preset instead.
- `fmt` is `avif`, `webp`, `jpeg` or `png`. Without it the format is negotiated from `Accept` (AVIF, then WebP, then PNG; AVIF when `Accept` names none). An SVG without an explicit raster `fmt` is served as `fmt=original`, the stored bytes.
- `aspect` takes an `N:N` ratio, such as `16:9`; anything else is ignored.

Format negotiation happens only on this uncached redirect, so the cached response never depends on `Accept`. That makes it safe behind CDNs that ignore `Vary`.

**The versioned URL** -- the redirect target, carrying `rev`. When `rev` is the item's current revision and `fmt` is explicit, the handler serves the bytes:

```
200 OK
Content-Type: image/avif
Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable
ETag: "<hash>"
```

There is no `Vary`, `If-None-Match` answers 304, and `HEAD` returns the headers only. `s-maxage` is what lets a shared cache such as the Vercel CDN keep it. A stale or unknown `rev`, or a missing `fmt`, gets a `no-cache` 302 to the current versioned URL.

**The revision** is `imageRevision(item)`: the first 12 hex characters of `sha256(url | crop | hotspot)`. A replace (new `url`) or a crop or hotspot change gives a new revision, and so a new URL; alt text, tags, folder and rename edits keep it, so unchanged variants stay cached. The parameter is named `rev` so it does not clash with a `v=` cache buster a client adds itself.

Rendered variants are also held in the in-memory `ImageCache`, keyed by `id/rev/preset/format/aspect`, so a new revision never hits an old entry on any instance. A missing original -- the file is gone from the store -- answers 404 `Original file not found`.

`invalidationsFor({ kind: 'media' })` in `@krantho/core` stays empty: pages embed the stable URL, never the asset record, so a media change invalidates no cached page.

### Content Routes (`registerContentRoutes`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/content` | `listContent` | One page of documents across collections: `?collections=a,b` (every collection when absent), `view`, `status`, `locale`, `sort`, `limit`, `offset`. Answers `{ items, hasMore }`; an unknown collection is a 400 (Studio's Pulse and Site read it) |
| GET | `/api/content/search` | `searchContent` | Substring search across collections, answering one page of `{ meta, fields, snippet }` with `hasMore` |
| GET | `/api/content/:collection` | `listCollection` | One page of a collection's documents with filtering, answering `{ items, hasMore }`. `?view=summary` lists each document's `meta` and `fields` alone, with no body, HTML or sections, and `?view=meta` its `meta` alone |
| GET | `/api/content-tree` | `listContentTree` | Every collection's documents as meta alone (`?locale=`), in one `query`: which documents there are, in what state, with no fields, body or HTML. Studio's site tree reads it |
| GET | `/api/content/:collection/:slug` | `getContent` | Get a single content document |
| POST | `/api/content/:collection` | `createContent` | Create new content (a save); 409 when the document already exists in that locale |
| PUT | `/api/content/:collection/:slug` | `updateContent` | Save existing content as a new version |
| DELETE | `/api/content/:collection/:slug` | `deleteContent` | Delete content |
| POST | `/api/content/:collection/:slug/publish` | `publishContent` | Publish, unpublish or archive the document in `?locale=` |
| GET | `/api/content/:collection/:slug/publish-impact` | `publishImpact` | What publishing the document in `?locale=` would refresh (editor) |

**Lists answer a page.** `GET /api/content/:collection` and `GET /api/content` answer `{ items, hasMore }` from one adapter `query`; there is no `total`, because a count would be a second read. `hasMore` is true when another page follows, so a client pages by `offset` until it is false. Both take `view` (`summary`: `meta` and `fields`; `meta`: `meta` alone; absent: the whole document, with body, HTML and sections), `status` (`draft`, `published` or `archived`, by publication state), `locale`, `sort` (`field` or `field:asc|desc`), `limit` and `offset`. `view=full` is not accepted and answers 400, as does any other value. `limit` is capped by `content.list.maxLimit` when that is set, and a request without a `limit` then gets that many. `GET /api/content` also takes `collections` as a comma-separated list; an unknown name answers 400, and the order of items is the query's: `collection`, `slug`, `locale` after the `sort`, so pages neither skip nor repeat a document.

**Search** (`GET /api/content/search?q=`) takes `q` (at least `content.search.minQueryLength` characters, else 400), `limit` (default `content.search.defaultLimit`, capped by `content.search.maxLimit`), `offset` and `locale`, and reads every configured collection in one `query` that matches `q`, case-insensitively, in the slug, the fields and the body. It answers `{ items: [{ meta, fields, snippet? }], hasMore }`: never the body, HTML or sections. An item that matched only on its slug has no `snippet`; otherwise `snippet` is up to 200 characters of the body (or, when only the fields match, of their JSON) from 80 characters before the first match, whitespace collapsed. Because the limit applies to the matches across collections, not to each collection before filtering, a match in a later collection is found however many documents an earlier one holds. An adapter without `query` answers 501.

**Saving never publishes.** Create and update are saves (`saveDocument`): each appends a new current version and keeps the live version, so visitors see nothing until the document is published. A `status` key in the request is ignored. Framework publication state belongs in `meta`, and author schemas reject reserved `status`. Without a `body` key, an update merges the submitted fields into the current ones and keeps the body. Both answer `{ slug, collection, version, liveVersion, message }` (201 for create, 200 for update): `version` is the saved version, `liveVersion` the version visitors see, or `null`. `_version` in an update's body is optimistic concurrency: a different current version answers 409.

**Publishing** (`publishContent`, `changePublication` in `document-actions.ts`, editor) is addressed exactly by collection, slug and `?locale=` (the site's default locale when absent). The body's `status` picks what it does:

| `status` | Effect |
|----------|--------|
| `published` | Publish: appends a copy of the current version and makes it live |
| `draft` | Unpublish: appends a version and leaves nothing live |
| `archived` | Archive: appends a version, nothing live, the document reads as `archived` |
| (absent) | Toggle: unpublish a published document, publish any other |

Any other value answers 400; a missing document 404. The answer is `{ slug, collection, locale, status, version, liveVersion, message }`. Each publication is a version in the history, so the history shows who changed what visitors see, and when. Publishing fires the `publish` webhook and the `afterPublish` hook; unpublishing and archiving fire the `update` webhook.

**Publish impact** answers, before a publish, `{ collection, slug, locale, paths, lists, everyPageReading, caching, tags, cachedEntries }`: `paths` is the document's page path (empty for a collection without pages), `lists` the collections whose lists refresh (the document's own), `everyPageReading` is `true` for a document without a page (every page that reads it refreshes), `caching` is `cache.pages`, `tags` the cache tags the publish refreshes (`invalidationsFor({ kind: 'document', ..., live: true })`), and `cachedEntries` the number of entries in the shared page cache that carry those tags -- `null` with `cache.pages: 'none'` or without a database-backed cache (`pageCacheStore`, set when `cache.shared` is `database`).

**Edit locks are enforced.** While another user holds an unexpired lock on a document (collection, slug, locale), saving it (an update, the assistant's draft writes), restoring a version, publishing, unpublishing, archiving and deleting it answer **423** `{ error, lockedBy, expiresAt }`. A create is not checked. Bulk delete leaves such a document alone and reports it `{ slug, deleted: false, error }`; meta-description enrichment skips it (`Being edited by another user`). The holder, and anyone when no lock is held, can write. The error text never names the holder -- the assistant passes it to its model provider; `lockedBy` does. Expired locks block no one.

#### Versioning

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/content/:collection/:slug/versions` | `listVersions` | List version history for a document |
| GET | `/api/content/:collection/:slug/versions/:version` | `getVersion` | Get a specific version snapshot |
| POST | `/api/content/:collection/:slug/restore/:version` | `restoreVersion` | Restore content to a previous version (admin, `?locale=`) |

A restore is a save: the restored content becomes the new current version and the live version is kept. It answers `{ slug, collection, restoredVersion, version, liveVersion, message }`.

#### Advisory Locking

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/content/:collection/:slug/lock` | `acquireLock` | Acquire an advisory lock for editing (editor) |
| DELETE | `/api/content/:collection/:slug/lock` | `releaseLock` | Release a lock: your own, or anyone's as an admin (editor) |
| GET | `/api/content/:collection/:slug/lock` | `checkLock` | Check current lock status |
| GET | `/api/locks` | `listLocks` | Every unexpired lock (viewer) |

Each lock route takes `?locale=` (the site's default locale when absent). Releasing another user's lock without the admin role answers 403 `{ error, lockedBy }`. `GET /api/locks` answers `{ locks: [{ collection, slug, locale, lockedBy, lockedAt, expiresAt }] }` (`ILockAdapter.listLocks`), an empty list without a lock adapter.

#### Bulk Operations

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| DELETE | `/api/content/:collection/bulk` | `bulkDelete` | Bulk delete content by slug list |
| POST | `/api/content/:collection/bulk-publish` | `bulkPublish` | Bulk publish content by slug list |

`bulk` (DELETE) takes `{ slugs, locale? }` and deletes each slug's document in `locale` (the site's default locale when absent); a document someone else holds the edit lock of is left alone: it answers `{ results: [{ slug, deleted, error? }], deleted }`. The single `DELETE /api/content/:collection/:slug` deletes the site's default locale.

`bulk-publish` takes `{ slugs, locale? }` and publishes the current version of each slug in `locale` (the site's default locale when absent) through `changePublication`, each on its own: it answers `{ results: [{ slug, published, error? }], published }`.

#### Import / Export (per-collection)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/content/:collection/export` | `exportContent` | Export collection content as JSON; `state=published` is public, `state=current` (drafts included) needs an editor |
| POST | `/api/content/:collection/import` | `importContent` | Import content into a collection |

An import saves each item: imported documents are not live until they are published.

#### Production edits (`contentChanges`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/changes` | `contentChanges` | Published documents whose live version differs from the checksum the last import took from the repository's file, as the files a pull writes. Query: `collection`, `limit` (max 200), `cursor`. 409 without a content import, 501 on a store without published reads |

Only published content is listed. The default locale is compared, and only collections with a `directory`. Documents whose live version came from a file are not read in full, so a lightly edited site reads little. A document that is not live is never read out: an unpublished page keeps the file the repository has. The files come from `repositoryFile()` (`@krantho/persistence`), whose output gray-matter reads back to the same fields. It needs an editor; the workload identity token of a CI job counts as one for this path (see Workload identity above). The `krantho pull` command and the production-edits workflow are described in [Bring production edits back to git](../krantho-site/content/docs/content-round-trip.md).

#### Import / Export Bundles (full site)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/export/bundle` | `exportBundle` | Export entire site as a bundle |
| POST | `/api/import/bundle` | `importBundle` | Import a full site bundle |

A bundle contains arrays of portable documents per collection. Reviewed imports save drafts through the document save path; publication is explicit. Unchanged content creates no revision. Contract mismatches or conflicting database edits require review.

#### Document metadata defaults

`POST /api/content/:collection/:slug/defaults` accepts `sourceCollection`, `sourceSlug`, `locale`, `_version`, `sourceVersion` (required when `apply: true`) and optional `apply` (default false). Optional `slots` selects declared metadata groups; omitted means all compatible groups. Preview returns `metadata`, `paths`, `version` and `sourceVersion` without writing. Apply requires those target and source versions and saves one draft snapshot. Compatible groups share a slot name and metadata archetype ID; missing values are filled and inherited values may be explicitly refreshed. Invalid results return 422; stale versions return 409.

Authored metadata is accepted by ordinary content create/update requests as `metadata`. Updates include `_version`. Document-owned SEO uses this same snapshot and publication boundary. See [content contracts](content-contracts.md) for the full contract, provenance and transfer lifecycle.

#### Schema + Collections

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/collections` | `listCollections` | List all registered collections: `{ collections: [{ name, source, directory, pages, sections, path? }] }`, `path` the URL pattern the collection declares (a string or `false`; absent under the default rule), `sections` the `##` sections the collection's page template designs (empty when none) |
| GET | `/api/schema/:collection` | `getSchema` | Get compiled schema for a collection |
| GET | `/api/schema/:collection/runtime` | `getRuntimeSchema` | Get runtime-added fields |
| GET | `/api/schema/:collection/export` | `exportSchema` | Export complete contract and Zod-backed collection code, including metadata groups |
| PUT | `/api/schema/:collection/groups` | `saveRuntimeMetadata` | Add or replace a runtime metadata definition; code-owned slots and identity changes return 409 |
| DELETE | `/api/schema/:collection/groups/:slot` | `deleteRuntimeMetadata` | Remove a runtime group from the active contract; archived snapshots remain intact |
| PUT | `/api/schema/:collection/fields` | `saveRuntimeField` | Add or update a runtime field; 400 when the definition does not hold (name, a compiling pattern, an enum of two values or more, a default and bounds that fit the type, an existing reference collection), 409 when it changes an existing field's type |
| DELETE | `/api/schema/:collection/fields/:field` | `deleteRuntimeField` | Remove a runtime field |

#### Validation + Page Resolution + Site Config

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/validate` | `validateAll` | Validate all content against schemas |
| GET | `/api/page` | `resolvePageRoute` | Resolve a URL path to a content document |
| GET | `/api/site-config` | `siteConfigHandler` | Get site configuration |

### SEO Routes (`registerSeoRoutes`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/seo/status` | `seoStatus` | SEO health status across all collections |
| GET | `/api/seo/structured-data` | `seoStructuredData` | Generated JSON-LD structured data |
| GET | `/api/seo/preview/:collection/:slug` | `seoPreview` | The JSON-LD a document's current version composes to, in its collection and locale (`?locale=`, the default when absent) |
| GET | `/api/seo/resolved/:collection/:slug` | `seoResolved` | The document's resolved structured-data entities |
| GET | `/api/seo/findings/:collection/:slug` | `seoFindings` | The document's SEO findings, with the active readers |
| GET | `/api/seo/findings` | `seoSiteFindings` | The SEO findings and search features of every published page (viewer) |
| GET | `/api/seo/sitemap` | `seoSitemap` | XML sitemap; `Cache-Control: public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`, as for robots.txt and llms.txt |
| GET | `/api/seo/sitemap.json` | `seoSitemapJson` | JSON sitemap |
| GET | `/api/seo/robots.txt` | `seoRobots` | The saved override, else robots.txt naming `<site.baseUrl>/sitemap.xml` (`SITEMAP_PUBLIC_PATH`); the site routes `/sitemap.xml` to `/api/seo/sitemap` and `/robots.txt` here |
| GET | `/api/seo/indexnow/:key` | `seoIndexNowKey` | The IndexNow key as plain text when `:key` is `seo.indexNow.key`, else 404; the site routes `/<key>.txt` here |
| GET | `/api/seo/llms.txt` | `seoLlmsTxt` | llms.txt: the saved snapshot, else generated from the live documents; `x-krantho-llms-origin` says which |
| POST | `/api/seo/generate` | `seoGenerate` | Trigger SEO data regeneration |
| POST | `/api/seo/enrich` | `seoEnrich` | Start an enrichment job over the whole site, one collection or one document (admin) |
| GET | `/api/seo/enrich/status` | `seoEnrichStatus` | Check enrichment job status |
| GET | `/api/seo/catalog` | `seoCatalog` | Full Schema.org archetype catalog |
| GET | `/api/seo/collection/:name/impact` | `seoCollectionImpact` | Impact analysis for a collection's SEO config |

The sitemap lists the live (published) version of each document in every collection that renders pages (`rendersPages()`: not `globals`, nor a collection declared with `path: false`), at its `documentPath()`, each path once, read through the adapter's `query` (`published`, `summary`, one read per collection): a page with saved changes ahead of live stays listed, and an unpublished, archived or deleted page drops out.

`GET /api/seo/findings` (`siteSeoSummary` in `seo-site-findings.ts`) reads every published page of every collection with pages, in the site's default locale, in one `query` (`published`, `summary`: fields and authored metadata, no body), reads the SEO configuration once (`seoConfigSnapshot` in `seo-config-snapshot.ts`), composes each page's graph once and validates it once. It answers `{ pages, readers }`: each page is `{ collection, slug, path, readers, features }`, where `readers` maps a reader id to `{ errors, warnings, info }` -- title and meta-description findings count under `page`, vocabulary findings under `schema.org` -- and `features` is `Seo.features(graph)` (`{ reader, feature, type, nodeId, status, eligible, missing, conditions, source }` per node and feature, see [seo.md](seo.md)); `readers` lists the active readers as `{ id, name }`. Without `@krantho/seo` it answers 501.

The sitemap, `robots.txt` and `llms.txt` answer `Cache-Control: public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`, so a CDN may serve them up to an hour old: a page published now reaches them within the hour, and a crawl reads the database once an hour at most.

`/api/seo/llms.txt` follows the robots precedent, "stored override or generated": the snapshot saved in site settings under `seo.llmsTxt` (`LLMS_TXT_SETTING`) when there is one, else `buildLlmsTxt(ctx)` — `# <site name>`, a `> <summary>` line from the site SEO configuration's primary entity `description`, then one `## <collection>` section per collection with pages (`rendersPages()`) listing each live document the sitemap would list (noindex pages skipped) as `- [title](url): description`. It answers `text/plain; charset=utf-8`, or 501 when the adapter cannot read published content. Only a confirmed assistant proposal writes the snapshot. A site serves `/llms.txt` by routing it to this path. The response header `x-krantho-llms-origin` says which it served: `snapshot` or `generated`.

The robots.txt override is the site SEO configuration's `robotsTxt` (`robotsOverrideConfigId`, the `site` scope): a field beside the entities, never an entity property, so no page's graph, resolved values or findings state it. An admin saves it with `PUT /api/seo/config/site` (the stored configuration with `robotsTxt` set) and removes it by saving the configuration without it — a `PUT` replaces the whole configuration, so a client that saves the site's entities sends `robotsTxt` back to keep it; saving an override on a site with no SEO configuration stores `{ entities: [], robotsTxt }`, with no entity. `robotsTxt` is refused (400) on any other scope or when it is not text. While it is set, `GET /api/seo/robots.txt` serves it verbatim.

`POST /api/seo/enrich` takes `{ type, scope?, collection?, slug?, force? }` (admin). `type` is `meta-descriptions` (the default) or `archetype`. `scope` is `all`, `collection` or `item`; without it, a `slug` means `item`, a `collection` alone means `collection`, and neither means `all`. A `collection` scope enriches only that collection's documents, and an `item` only the document with that slug in that collection. It answers 400 for any other scope (`scope is all, collection or item`), for a collection or item scope without a configured collection (`scope <scope> needs a configured collection`), for an item without a slug (`scope item needs a slug`) and when no LLM can be created; 409 `{ error, jobId }` while another job runs (one at a time); 200 `{ jobId: null, message }` when the scope has nothing to enrich; else 202 `{ jobId, status: 'running', type, totalItems }`. `force: true` overwrites values someone set; without it enrichment fills only what is missing. For `archetype`, the model returns each property with the passage of the content that states it; a property is written only when that passage is in the content the model saw (or in the configured values) as whole words, every number in the value appears there too, and at least half of the value's own words do, so a property the content does not state stays empty. `GET /api/seo/enrich/status?jobId=` answers the job's progress, items, summary and `usage` (`{ inputTokens, outputTokens, model }`: the tokens the provider reported for the job's completions and the model that served the first; zero and `null` when the provider reports none), or 404. The running job is saved in the site settings (`seo.enrich.job`) every few seconds, so any instance answers for it and a second job is refused while one runs elsewhere. A running job that has not saved for 90 seconds has lost its runner (a serverless function frozen or ended): the next status request, or a new job, takes over, and the job goes on from its pending items on that instance. Each run puts its own token in the saved job and checks it before every item, so a run that was only slow stops once another has taken the job over.

#### SEO Config CRUD

Document IDs (`doc:<collection>/<slug>`) read and edit `metadata.seo`. Their PUT and DELETE requests require `_version`, accept `locale`, and return the saved draft version; publishing updates visitors. Unqualified list and delete-all operations affect shared policy storage only.

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/seo/config` | `getSeoConfig` | List shared site, collection and route policies |
| GET | `/api/seo/config/:id` | `getSeoConfig` | Get a specific SEO configuration by ID |
| PUT | `/api/seo/config` | `saveSeoConfig` | Create or update SEO configuration |
| PUT | `/api/seo/config/:id` | `saveSeoConfig` | Update a specific SEO configuration |
| DELETE | `/api/seo/config/:id` | `deleteSeoConfig` | Delete a specific SEO configuration |
| DELETE | `/api/seo/config` | `deleteAllSeoConfigs` | Delete shared policies; document metadata remains intact |

#### SEO files without a request

The sitemap, robots.txt and llms.txt handlers build their bodies with functions that take a `SeoFileSource`
(`config`, `contentConfig`, `adapter`, `seoConfigAdapter?`) instead of a request, so a static build writes the
files the API serves:

```typescript
import {
  buildDefaultRobotsBody,
  buildLlmsTxt,
  buildSitemapUrls,
  serializeSitemapXml,
} from '@krantho/api'

const sitemapXml = serializeSitemapXml(await buildSitemapUrls(source))
const robotsTxt = buildDefaultRobotsBody(config.site.baseUrl)
const llmsTxt = await buildLlmsTxt(source)
```

They read only live documents in collections that render pages, and skip noindex pages. A saved robots.txt
override or llms.txt snapshot is the handlers' concern: the builders always generate.

### Assistant Routes (`registerAssistantRoutes`)

Registered only when `assistant.enabled` is set. With it off these paths answer 404 and are absent from `/api/openapi.json` (where the routes are tagged `Assistant`). What the assistant does, and its limits, are in [assistant.md](assistant.md).

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/assistant` | `assistantStatus` | Provider, model, credential kind, the user's tools and the limits; `{ configured: false, error }` when no LLM is configured |
| POST | `/api/assistant/chat` | `assistantChat` | Run the assistant for a conversation; answers `text/event-stream` |
| POST | `/api/assistant/confirm` | `assistantConfirm` | Execute a proposal the user confirmed (`{ token }`) |

Every assistant route requires a signed-in user (401 for no user, and for the anonymous reader of a site with sign-in) at or above `assistant.role` (403). `POST` bodies must be `content-type: application/json` (415).

`POST /api/assistant/chat` takes `AssistantChatRequest` — `{ messages: [{ role: 'user' | 'assistant', content }], context?: { collection, slug?, locale? } }`, starting and ending with a user message. Before the stream starts it answers JSON errors: 400 (malformed conversation), 413 (over `assistant.limits.maxHistoryMessages` or `maxInputChars`), 503 `{ code: 'llm_unconfigured' }` and 503 `{ code: 'llm_credential_missing' }`. Once streaming, the response carries `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform` and `x-accel-buffering: no`, and a `: ping` comment every 15 seconds.

Each event is framed as `event: <type>` and `data: <the event as JSON>`. The types are exported from `@krantho/api` (`AssistantEvent` and the types it references):

| Event | Data | Meaning |
|---|---|---|
| `text` | `{ text }` | A piece of the assistant's answer, in order |
| `tool` | `{ id, tool, label }` | A tool started; `label` is a line to show while it runs |
| `activity` | `{ activity: AssistantActivity }` | What the tool did: `status` (`done`, `failed`, `pending`, `proposed`), a `summary` line, the `documents` it touched, and optionally `changes` (`DocumentChange[]`), `pending` (`PendingActionView`, with the token to confirm), `proposal` (text to use by hand) and `findings` (`SeoFinding[]`) |
| `usage` | `{ inputTokens, outputTokens }` | Tokens used so far in this request |
| `error` | `{ code, message }` | `code` is a `ChatErrorCode` from `@krantho/ai`, `limit` or `internal` |
| `done` | `{ reason }` | `end_turn`, `max_tokens`, `refusal`, `limit`, `aborted` or `error` |

Per request: any number of `text`, `tool` → `activity` pairs and `usage` events, then at most one `error`, then exactly one `done`. Closing the stream aborts the request's work at its next step.

`POST /api/assistant/confirm` answers 200 `{ ok, results: [{ collection?, slug?, status: 'done' | 'failed', message, version? }] }`, or 400 (invalid token), 403 (another user's proposal, or a role that no longer allows it), 409 (changed since the proposal), 410 (expired), 423 (another user holds the lock), 501 (the store the action needs is missing).

### Admin Routes (`registerAdminRoutes`)

#### Checkpoints (backup/restore)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/checkpoints` | `snapshotList` | List all checkpoints |
| POST | `/api/checkpoints` | `snapshotCreate` | Create a new checkpoint |
| GET | `/api/checkpoints/:version` | `snapshotGet` | Get checkpoint details by version |
| POST | `/api/checkpoints/:version/restore` | `snapshotRestore` | Restore from a checkpoint |
| DELETE | `/api/checkpoints/:version` | `snapshotDelete` | Delete a checkpoint |

#### Users + Permissions

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/users` | `userList` | List all users |
| POST | `/api/users` | `userCreate` | Create a new user |
| GET | `/api/users/:id` | `userGet` | Get user by ID |
| PUT | `/api/users/:id` | `userUpdate` | Update user |
| DELETE | `/api/users/:id` | `userDelete` | Delete user |
| GET | `/api/users/:id/permissions` | `userPermissionsGet` | Get user permissions |
| PUT | `/api/users/:id/permissions` | `userPermissionsSet` | Set user permissions |

#### Webhooks

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/webhooks/deliveries` | `webhookDeliveries` | List webhook delivery logs |
| POST | `/api/webhooks/deliveries/:id/retry` | `webhookRetry` | Re-queue a failed delivery and send it again |

#### Translations

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/translations/status` | `translationStatus` | Translation coverage status |

#### Versions (retention)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/versions/stats` | `versionStats` | Version storage statistics |
| POST | `/api/versions/purge` | `versionPurge` | Purge old versions based on retention policy |

#### Settings

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/settings/locales` | `getLocaleSettings` | Get locale configuration |
| PUT | `/api/settings/locales` | `updateLocaleSettings` | Choose which configured locales are active |
| GET | `/api/settings/llm` | `getLLMSettings` | Which providers are on, and which one the site uses |
| PUT | `/api/settings/llm` | `updateLLMSettings` | Save one provider's key, model and base URL |
| DELETE | `/api/settings/llm?provider=` | `deleteLLMSettings` | Remove what is saved for one provider |
| POST | `/api/settings/llm/test` | `testLLMConnection` | Test one provider with a minimal request |

`GET /api/settings/llm` answers `{ configured, provider, model, providers, assistantProvider }`. A provider is on (`ready`) when it has a key; `provider` and `model` are the ones the site uses, and `providers` lists every provider with `ready`, `active`, `keySource` (`environment`, `configuration` or `saved`, never the key), `env` (the variable that sets its key), and the `model` and `baseUrl` saved for it. `PUT` (admin) takes `{ provider, apiKey?, model?, baseUrl?, use? }`: the key is sealed by the secret vault and saved for that provider only (400 when the site has no secrets key), an empty `model` or `baseUrl` clears it, and the provider becomes the one in use when it is the first to be on or `use` is true; what was in use stays in use. `DELETE ?provider=` removes that provider's saved key, model and base URL; a key from the environment or the code stays. `POST /api/settings/llm/test` takes `{ provider? }` (default the one in use) and answers `{ success, provider, model, usage }` or `{ success: false, provider, error }`. `claude-code` and `ollama` are never picked for a site: they are on only when chosen.

`GET /api/settings/locales` answers `{ defaultLocale, configuredLocales, supportedLocales, source }`. `defaultLocale` is always `site.defaultLocale` of the configuration; every request that names no locale uses it. `configuredLocales` is `site.supportedLocales`; `supportedLocales` is the active list, the one an admin saved (`source: 'database'`) or else the configured list (`source: 'config'`). `PUT` (admin) takes `{ supportedLocales: string[] }` and answers the same shape. It answers 400 with the reason for an empty list, a repeated locale, a locale the configuration does not list, or a list without the default locale; the default locale itself is changed only in the configuration. `GET /api/translations/status` reads the same default and the active list.

#### Migrations

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/migrations/status` | `migrationStatus` | Current migration/schema version status |
| GET | `/api/migrations/conflicts` | `migrationConflicts` | List unresolved migration conflicts (editor) |
| POST | `/api/migrations/conflicts/:id/resolve` | `resolveConflict` | Resolve a specific migration conflict (admin) |

### Plugin Routes (`registerPluginRoutes`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/plugins` | (built-in) | List loaded plugins with routes, Studio pages, field types |
| * | `/api/plugins/:pluginName/*` | (plugin-defined) | Plugin-specific routes |

Plugin routes are mounted under `/api/plugins/:pluginName/...`. The plugin listing endpoint returns each plugin's name, version, description, registered routes, Studio pages, and field types.

---

## ContentHooks

```ts
interface ContentHooks {
  /** Fires before content is created or updated. Can modify fields/body. Throw to abort. */
  beforeSave?: ((ctx: BeforeSaveContext) => Promise<BeforeSaveContext | void>) | undefined
  /** Fires after content is created */
  afterCreate?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
  /** Fires after content is updated */
  afterUpdate?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
  /** Fires after a document is published (not on unpublish or archive) */
  afterPublish?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
  /** Fires before content is deleted. Throw to abort. */
  beforeDelete?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
  /** Fires after content is deleted */
  afterDelete?: ((ctx: AfterMutationContext) => Promise<void>) | undefined
}

interface BeforeSaveContext {
  collection: string
  slug: string
  fields: Record<string, unknown>
  body: string
  isNew: boolean
}

interface AfterMutationContext {
  collection: string
  slug: string
}
```

`beforeSave` can return a modified context to transform content before persistence. Throwing from `beforeSave` or `beforeDelete` aborts the operation. After-hooks run inside the request, awaited; their errors are logged, not propagated.

When both config hooks and plugin hooks define the same event, they are chained in order -- both run, plugin hooks do not overwrite config hooks.

## Site preview

`GET /api/preview?collection=&slug=` sends an editor or Studio to the document's page (`documentPath()`, from the collection's `path`) in preview; anyone else gets 403, a collection without pages (`globals`, or one declared with `path: false`) 400. It is registered only when the host renders drafts for editors (`CreateApiHandlersConfig.sitePreview`, `SitePreviewMode`); `/api/capabilities` then reports the mode as `features.sitePreview` (`'disabled'` without it) and the Studio editor's **Open on site** opens the draft through it. The mode says how the host turns the answer into a preview:

| `sitePreview` | Answer | Host |
|---|---|---|
| `'draft-mode'` | `200 { path }` | `@krantho/server-next` turns on Next.js draft mode and redirects to the path (see [server-next.md](server-next.md#editor-preview)) |
| `'signed-url'` | `307` to `<path>?krantho-preview=<token>`, `Cache-Control: no-store` | SvelteKit and Express pages verify the token with `verifyPreviewRequest()` from `@krantho/server` and render the draft (see [the page caching guide](guides/page-caching.md#editor-preview)) |

A signed token is base64url(`exp`) + `.` + HMAC-SHA256(`auth.jwtSecret`, `<path>|<exp>`): valid for ten minutes, for that path only, rejected when expired, tampered with, or presented on another path. The path is resolved as the browser will request it (`resolveSitePath()` from `@krantho/core`); a slug that resolves off the site (`..//host`) answers 400 with no link and no token. The API signs with `resolveJwtSecret(auth)`, and `verifyPreviewRequest()` verifies with the same: without a configured secret that is the process's ephemeral secret, so a link works when the same process renders the page (development, one server). A deployment with several instances or serverless functions must set `KRANTHO_JWT_SECRET`, or a link signed by one instance fails on another. Studio's Live mode, in development, is designed to load this route in a same-origin frame; the preview it renders carries the Live marks (see [core.md](core.md#marks)). `PREVIEW_PARAM` (`'krantho-preview'`) and `verifyPreviewToken(token, path, secret)` are exported for hosts that verify without `@krantho/server`.

## Content changes

Every committed write announces what it changed, so a host can refresh what it caches (rendered pages, a CDN). The types come from `@krantho/core`, next to the cache tag vocabulary that maps a change to what it invalidates (see [core.md](core.md#cache-tags)); `@krantho/server-next` uses both to refresh cached Next.js pages. Unlike the hooks, which cover a few content events, the change channel covers every write: create, save, publish, unpublish, archive, delete, bulk publish and delete, version and checkpoint restore, content and bundle import, media update, replace and delete, SEO configuration changes and SEO enrichment.

A save -- create, update, restore, content import, SEO enrichment, the assistant's draft writes -- announces `live: false`, because the live version is unchanged; on the filesystem adapter, which keeps no history and makes a save to a published file live at once, it announces `live: true` when the saved version is the live one (`savedChange`, `currentIsLive`). Publishing, unpublishing, archiving and deleting announce `live: true` with the document's locale.

```ts
type ContentChange =
  | {
      kind: 'document'
      collection: string
      slug: string
      locale?: string | undefined
      /** Whether visitors see the change: false for a save that keeps the live version */
      live: boolean
    }
  | { kind: 'seo'; configId?: string | undefined } // omitted: every configuration
  | { kind: 'media'; id: string }
  | { kind: 'site' } // checkpoint restore, bundle import, startup import

type ContentChangeListener = (change: ContentChange) => void | Promise<void>
```

Each write first clears the API's content engine cache, so no later read in the process sees data from before the write; then the listener runs for each change, awaited, inside the request. A bulk operation or import clears the cache once and then announces one change per document or asset. A failing listener is logged and never fails the write. SEO enrichment runs as a background job: its changes are announced as each item completes, after the request that started the job has returned. The job is handed to `waitUntil` when the host provides one. `deliverChange(engine, listeners, change)` and `deliverChanges(engine, listeners, changes)` are the same delivery for writes made outside a handler; `@krantho/server` uses it for the startup import and the file watcher.

## WebhookConfig

```ts
interface WebhookConfig {
  /** Absolute http(s) URL to POST to */
  url: string
  /** Events that trigger this webhook, at least one: 'create', 'update', 'publish' or 'delete' */
  events: WebhookEvent[]
  /** Optional secret for HMAC signature (X-Webhook-Signature header) */
  secret?: string | undefined
}
```

`WebhookConfig` is the `WebhookTarget` of `@krantho/config`, which owns the event list (`WEBHOOK_EVENTS`) and validates the `webhooks` section of the configuration. A site built on `@krantho/server` sets `webhooks` in `krantho.config.ts`, and the server passes them here; `createApiHandlers` takes the list directly when used by hand.

Webhooks POST a JSON payload `{ event, collection, slug, timestamp }` to the configured URL. A create or update (`saveDocument`, the assistant's writes included) fires `create` or `update`, a publish (bulk publish included) `publish`, an unpublish or archive `update`, a delete `delete`; restore fires `update`, changed imports fire `create` or `update`, and bulk delete fires no webhook. Unchanged imports do not fire a save event. If `secret` is set, an `X-Webhook-Signature` header is included with an HMAC-SHA256 signature in the format `t=<timestamp>,v1=<signature>`.

When a `webhookDeliveryAdapter` is provided, webhook deliveries are persisted through it, on SQLite and on Postgres alike: a first send is logged as due again only after the first retry delay, and each attempt records its HTTP status, a failed one its attempt count and when it is due again (backing off: 30s, 2min, 15min, 1h, by the attempts the delivery has made). `processWebhookRetries(webhooks, deliveries)` reads the due deliveries of the configured webhooks (oldest first, in batches) through `IWebhookDeliveryAdapter.claimDueDeliveries`, sends them and resolves when each has been sent and its outcome recorded; the API does not call it itself, and `@krantho/server` runs it from the request handler (see [server.md](server.md#webhooks)). A delivery that has used all `MAX_WEBHOOK_ATTEMPTS` (5) without being delivered is failed. Without an adapter, delivery is fire-and-forget.

### Retrying a failed delivery

`POST /api/webhooks/deliveries/:id/retry` (admins) puts a failed delivery back in the queue through `IWebhookDeliveryAdapter.requeueDelivery` — one attempt left, due now — and sends its stored payload again at once to the configured webhook with the same URL, signed afresh with that webhook's secret. It answers `202 { delivery }` with the delivery as re-queued (pending); the attempt's outcome is recorded on the row, delivered or failed again, so `GET /api/webhooks/deliveries` shows it. The attempt runs in the background and is handed to `waitUntil` when the host provides one.

| Answer | When |
|--------|------|
| `202 { delivery }` | re-queued and sent again |
| `400` | the id is not a positive whole number |
| `403` | the caller is not an admin |
| `404` | no delivery has the id, or the site logs no deliveries |
| `409` | the delivery is not failed (delivered, or still pending), or no configured webhook has its URL any more |

On Postgres, where no delivery is ever logged, the adapter's `getDelivery` and `requeueDelivery` throw: the request fails loudly rather than pretending to retry.

## Plugin System

```ts
interface KranthoPlugin {
  /** Unique plugin name (e.g., '@myorg/krantho-analytics') */
  name: string
  version: string
  description?: string | undefined
  /** Lifecycle hooks (chained with config and other plugin hooks) */
  hooks?: ContentHooks | undefined
  /** Custom API routes (mounted under /api/plugins/:pluginName/) */
  routes?: PluginRoute[] | undefined
  /** Custom Studio pages (metadata for Studio sidebar) */
  studioPages?: PluginStudioPage[] | undefined
  /** Custom field types */
  fieldTypes?: PluginFieldType[] | undefined
  /** Called once when the plugin is loaded */
  onLoad?: (() => Promise<void> | void) | undefined
  /** Called when the server shuts down */
  onUnload?: (() => Promise<void> | void) | undefined
}

interface PluginRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  handler: ApiHandler
}

interface PluginStudioPage {
  /** Route path in Studio (e.g., 'analytics') -> /studio/plugins/analytics */
  path: string
  /** Display name in sidebar */
  label: string
  /** URL to the page component (loaded via iframe or script) */
  componentUrl?: string | undefined
}

interface PluginFieldType {
  /** Type name used in schema (e.g., 'markdown-preview') */
  type: string
  /** Display label in field editor */
  label: string
  /** URL to the field renderer component */
  componentUrl?: string | undefined
}
```

### loadPlugins

```ts
function loadPlugins(plugins: KranthoPlugin[]): Promise<PluginRegistry>
```

Loads an array of plugins, calling each `onLoad` hook, and merges their hooks, routes, Studio pages, and field types into a single `PluginRegistry`.

```ts
interface PluginRegistry {
  hooks: ContentHooks
  routes: Array<PluginRoute & { plugin: string }>
  studioPages: Array<PluginStudioPage & { plugin: string }>
  fieldTypes: Array<PluginFieldType & { plugin: string }>
}
```

---

## Usage

### Installation

```bash
pnpm add @krantho/api
```

### Minimal setup

```ts
import { createApiHandlers } from '@krantho/api'
import { resolveConfig } from '@krantho/config'

const api = createApiHandlers({
  contentConfig,
  config: resolveConfig({
    site: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  }),
  adapter,
  engine,
})

const response = await api.handle({
  method: 'GET',
  path: '/api/content/blog',
  params: {},
  query: {},
})
```

### With authentication

```ts
const api = createApiHandlers({
  contentConfig,
  config,
  adapter,
  engine,
  authAdapter: myAuthAdapter,
})
```

with `auth` set in the configuration tree:

```ts
const config = resolveConfig(
  { site, auth: { mode: 'token' } },
  process.env, // KRANTHO_API_TOKEN supplies the secret, KRANTHO_JWT_SECRET the signing key
)
```

### With media

```ts
const api = createApiHandlers({
  contentConfig,
  config,
  adapter,
  engine,
  media: {
    metadata: new SqliteMediaAdapter(db),        // @krantho/persistence-sqlite
    folders: new SqliteMediaFolderAdapter(db),
    files: createLocalFileStore(config.media.local), // @krantho/media-local
  },
})
```

`@krantho/server` does this from `media.provider`; build it by hand only when using `createApiHandlers` directly.

### With webhooks

Webhook targets are the `webhooks` section of the configuration tree, and
`createKranthoHandler` in `@krantho/server` passes them on. Used by hand,
`createApiHandlers` takes them directly. Pass a
`webhookDeliveryAdapter` to log deliveries, and call `processWebhookRetries`
with the same adapter yourself to retry them.

```ts
const api = createApiHandlers({
  contentConfig,
  config,
  adapter,
  engine,
  webhooks: [
    {
      url: 'https://hooks.example.com/rebuild',
      events: ['publish', 'update'],
      secret: process.env.WEBHOOK_SECRET,
    },
  ],
})
```

### With plugins

```ts
import type { KranthoPlugin } from '@krantho/api'

const analyticsPlugin: KranthoPlugin = {
  name: 'analytics',
  version: '1.0.0',
  routes: [
    {
      method: 'GET',
      path: '/stats',
      handler: async (req, ctx) => ({ status: 200, body: { views: 42 } }),
    },
  ],
  hooks: {
    afterPublish: async ({ collection, slug }) => {
      console.log(`Published: ${collection}/${slug}`)
    },
  },
}

const api = createApiHandlers({
  contentConfig,
  config,
  adapter,
  engine,
  plugins: [analyticsPlugin],
})
// Plugin route available at: GET /api/plugins/analytics/stats
```

### With lifecycle hooks

```ts
const api = createApiHandlers({
  contentConfig,
  config,
  adapter,
  engine,
  hooks: {
    beforeSave: async (ctx) => {
      return { ...ctx, fields: { ...ctx.fields, updatedAt: new Date().toISOString() } }
    },
    afterCreate: async ({ collection, slug }) => {
      console.log(`Created: ${collection}/${slug}`)
    },
  },
})
```

### Full configuration

```ts
const api = createApiHandlers({
  contentConfig,
  config,
  adapter,
  engine,
  authAdapter: myAuthAdapter,
  media: { metadata: myMediaAdapter, folders: myFolderStorage, files: myFileStore },
  checkpoints: myCheckpointAdapter,
  contentMigration: myMigrationAdapter,
  lockAdapter: myLockAdapter,
  webhooks: [{ url: 'https://hooks.example.com/rebuild', events: ['publish'] }],
  webhookDeliveryAdapter: myWebhookDeliveryAdapter,
  retentionAdapter: myRetentionAdapter,
  siteSettingsAdapter: mySiteSettingsAdapter,
  seoConfigAdapter: mySeoConfigAdapter,
  persistenceType: 'sqlite',
  hooks: { afterPublish: async ({ collection, slug }) => console.log(`Published: ${collection}/${slug}`) },
  plugins: [myPlugin],
})
```

In practice, consumers rarely use `@krantho/api` directly. The `@krantho/server` package creates the adapter, engine, and API from a single config object. See [server.md](server.md).

## Dependencies

### Runtime Dependencies

| Package | Purpose |
|---------|---------|
| `@krantho/ai` | LLM client for runtime SEO enrichment and the assistant's streaming chat |
| `@krantho/config` | `KranthoConfig` — the resolved configuration tree handlers read |
| `@krantho/core` | `IContentEngine` interface, `ContentEngineFactory` |
| `@krantho/persistence` | `IPersistenceAdapter` and sub-adapter interfaces |
| `@krantho/schema` | `ContentConfig`, `PageDefinition` types |
| `@krantho/seo-shared` | SEO field discovery primitives |
| `sharp` | Image optimization |

### Peer Dependencies

| Package | Purpose | Required |
|---------|---------|----------|
| `zod` ^4.0.0 | Frontmatter schema validation in handlers | Yes |
| `@krantho/seo` | SEO handler implementations (structured data, sitemap, archetypes) | Optional |
