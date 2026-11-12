---
title: Configuration
description: The krantho configuration tree — how defaults, krantho.config.ts and the environment resolve into one validated object, and every setting with its variable.
area: reference
order: 10
level: intermediate
stacks: [next, sveltekit, express]
prerequisites: [installation]
related: [content-fields, persistence, media, rendering-modes, deploy-cdn, studio, package-ai]
status: published
---

Everything a krantho site can be told is a leaf of one typed tree. You write the leaves you care about in `krantho.config.ts`. A deployment overrides any of them from the environment. Everything else keeps its shipped default.

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: {
    domain: 'example.com',
    name: 'My Site',
    language: 'en',
    baseUrl: 'https://example.com',
  },
  auth: { mode: 'token' },        // the secret comes from KRANTHO_API_TOKEN
  llm: { provider: 'anthropic' }, // the key comes from KRANTHO_LLM_ANTHROPIC_API_KEY
  seo: { configDir: './krantho.seo' },
})
```

The object `defineKranthoConfig()` returns is what you hand to krantho where it is wired into your app, next to your collections:

{{sample:api-route}}

## How a value is resolved

One rule, applied once at startup:

**defaults → `krantho.config.ts` → the environment.**

The environment wins. Relative filesystem paths resolve against the working directory. Every problem found — a value that will not parse, a required field nobody set, a rule spanning two leaves — is collected and thrown as a single error naming each variable and path. A misconfigured deployment fails at boot with the whole list, not one item at a time:

```text
Invalid krantho configuration:
  - KRANTHO_MEDIA_MAX_SIZE (media.maxFileSize): expected an integer, got "abc"
  - site.baseUrl: must be an absolute URL
```

## Configuration versus wiring

The split is what makes environment overrides mechanical.

**Configuration** is data — strings, numbers, booleans, lists, URLs. It lives in `krantho.config.ts`, and every scalar or list leaf has an environment variable. Structured leaves — the SEO archetype maps, the image presets and the webhooks — hold nested data and are set in code only.

**Wiring** is code that cannot be a string: collections from `defineCollection()`, page definitions, plugins, lifecycle hooks, a content change listener and how editors preview drafts (`sitePreview`). It stays an argument to the handler.

```ts title="app/api/[...path]/route.ts" stack="next"
import { createApiRouteHandlers } from '@krantho/server-next'
import config from '../../../krantho.config'
import { collections } from '../../../krantho.collections'

export const { GET, POST, PUT, DELETE, PATCH } = createApiRouteHandlers({
  config,                                  // data
  collections,                             // wiring
  plugins: [],                             // wiring
  hooks: {},                               // wiring
  onContentChange: (change) => {},         // told about every committed write
})
```

Where media files are stored and how pages are cached are configuration as well: `media.provider` picks the file store, `cache.pages` the page cache, and their settings are leaves like any other.

## The sections

| Section | What it holds |
|---------|---------------|
| `site` | Domain, name, language, base URL, supported and default locale. The only section that must be supplied. |
| `paths` | Data directory, content directory, and the directory the SEO pipeline writes generated files to. |
| `persistence` | Backend choice plus the SQLite, Postgres and filesystem settings. See [Persistence](/docs/persistence). |
| `content` | The content cache of the API and of server-rendered pages, at-notation, the file watcher, default statuses, list and search limits, version retention, lock lease. |
| `auth` | Mode, token identity, JWT secret, OIDC endpoints, signup policy and how `/studio` treats a visitor without a session (`studioEntry`), session and cookie settings. See [Studio](/docs/studio). |
| `media` | The file store (`provider`: `local`, `vercel-blob`, `s3` or `gcs`) and its settings, plus size cap, accepted MIME types, and the image pipeline. With `provider` unset, media is off. See [Media](/docs/media). |
| `llm` | Provider, model and base URL for enrichment, one credential for each provider, and per-model request settings (`profiles`). |
| `secrets` | The vault that encrypts the secrets a site stores in its database, such as a key pasted in Studio, and the key it uses. |
| `assistant` | Whether the Studio assistant is on, the provider and model it uses, who may use it and its limits. See [The Studio assistant](/docs/assistant). |
| `seo` | Site identity type, archetypes per collection and route, rich per-scope configuration, seed mode, seed directory, enrichment limits. |
| `cache` | How pages are cached (`none`, `next-isr`, `cdn`), the CDN in front of the site and its settings, and whether several Next.js instances share one cache in the database (`shared`). See [Rendering and caching](/docs/rendering-modes) and [Deploy behind a CDN](/docs/deploy-cdn). |
| `webhooks` | Outgoing webhooks: a list of `{ url, events, secret? }`. See [Webhooks](#webhooks). |
| `tools` | Concurrency and content caps for the build-time pipeline. |

[Every setting](#every-setting) below lists each leaf with its environment variable, its type, its default and what it does.

## Environment variables

These leaves use established names instead of the mechanical form: `KRANTHO_AUTH`, `KRANTHO_API_TOKEN`, `KRANTHO_JWT_SECRET`, `KRANTHO_TOKEN_ROLE`, `KRANTHO_TOKEN_EMAIL`, `KRANTHO_ADMIN_EMAILS`, `KRANTHO_SIGNUP`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_POST_LOGOUT_URI`, `KRANTHO_MEDIA_MAX_SIZE`, `KRANTHO_IMAGE_CACHE_MAX_ENTRIES`, `KRANTHO_IMAGE_CACHE_MAX_MB`, `KRANTHO_IMAGE_CACHE_TTI_SECS`, `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` (`llm.claudeCode.authToken`) and `CLAUDE_CONCURRENCY`.

Every other leaf takes the mechanical form: split camelCase words, uppercase the path, replace the dots with underscores, prefix with `KRANTHO_`.

| Path | Variable |
|------|----------|
| `llm.openai.apiKey` | `KRANTHO_LLM_OPENAI_API_KEY` |
| `assistant.provider` | `KRANTHO_ASSISTANT_PROVIDER` |
| `persistence.sqlite.busyTimeoutMs` | `KRANTHO_PERSISTENCE_SQLITE_BUSY_TIMEOUT_MS` |
| `auth.oidc.studioEntry` | `KRANTHO_AUTH_OIDC_STUDIO_ENTRY` |
| `media.vercelBlob.token` | `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` |

Types follow the leaf:

- **Integers** must parse as integers. `KRANTHO_MEDIA_MAX_SIZE=abc` fails the boot.
- **Booleans** accept `true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off`.
- **Lists** are comma-separated and trimmed: `KRANTHO_SITE_SUPPORTED_LOCALES=en,nb,de`.
- A variable set to an empty string counts as unset.

## Secrets

The secret leaves are `auth.token.secret`, `auth.jwtSecret`, `auth.oidc.clientSecret`, `llm.anthropic.apiKey`, `llm.openai.apiKey`, `llm.gemini.apiKey`, `llm.openrouter.apiKey`, `llm.claudeCode.authToken`, `secrets.local.key`, `persistence.postgres.url`, `cache.cdn.gcp.accessToken`, and the media store credentials `media.vercelBlob.token`, `media.s3.secretAccessKey` and `media.gcs.credentials`.

Each also accepts a `_FILE` suffix naming a file to read the value from. That is how a container platform mounts a secret without putting it in the process environment:

```bash
KRANTHO_LLM_ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic-key
```

The variable itself wins when both are set. Secrets are excluded from anything serialized to a browser by construction, and any dump of the tree replaces them with `[redacted]`.

> [!TIP]
> Prefer the environment for credentials. Each provider's own variable, such as `KRANTHO_LLM_ANTHROPIC_API_KEY`, is the deployment home of its key; Studio's **Setup › AI provider** is for a site operator who has no environment to edit.

### Language model settings at runtime

The runtime reads the provider, model and base URL from the site settings store, not from the tree. On first boot the server seeds them into that store — only when the code passes an `llm` block, or the environment chooses a provider (`KRANTHO_LLM_PROVIDER`) and supplies that provider's key — and it never overwrites a stored provider. A key alone seeds nothing: a provider is on because it has a key, and the site uses the first one that is on when none was chosen. No credential is ever seeded or copied into the database: a key from the environment or the code stays where the deployment put it.

After that, Studio's **Setup › AI provider** wins for the provider, and for each provider's model and base URL. The credential is picked on every request, and every provider has one of its own. The `claude-code` provider uses `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` only, and refuses to run in production. Every other provider uses its own variable (`KRANTHO_LLM_ANTHROPIC_API_KEY`, `KRANTHO_LLM_OPENAI_API_KEY`, `KRANTHO_LLM_GEMINI_API_KEY` or `KRANTHO_LLM_OPENROUTER_API_KEY`) or the key the code passes, then the key pasted in Studio, and never another provider's credential — so a key rotated in the environment takes effect at once. Ollama needs none. krantho reads neither `KRANTHO_LLM_API_KEY` nor `CLAUDE_CODE_OAUTH_TOKEN`. See [@krantho/ai](/docs/package-ai#inside-a-krantho-site). The build-time tools read the tree directly, so they always see the current value.

A key pasted in Studio is **sealed** before it reaches the database: AES-256-GCM under a key derived from `secrets.local.key` (`KRANTHO_SECRETS_LOCAL_KEY`) or, when that is unset, from `auth.jwtSecret`, either at least 32 characters. Only the running system can open it, so a database dump or backup reveals nothing. A site with neither refuses a pasted key and says so; set the provider's own variable instead. Rotating the key makes the stored keys unreadable, and they are entered again. Stored secrets are not part of any import or export.

Which settings a model takes differs by model, so `llm.profiles` sets them per model id over the defaults: `reasoningEffort`, `reasoningHeadroom` and `temperature`. See [@krantho/ai](/docs/package-ai#model-profiles).

## Webhooks

`webhooks` is a list of targets krantho POSTs to when content changes. Each takes an absolute `http` or `https` `url`, an `events` list with at least one of `create`, `update`, `publish` and `delete`, and an optional `secret` that signs the delivery with HMAC-SHA256 in the `X-Webhook-Signature` header (`t=<timestamp>,v1=<signature>`). A list of objects has no environment variable, so read the secret from the environment in `krantho.config.ts`:

```ts title="krantho.config.ts"
export default defineKranthoConfig({
  // ...
  webhooks: [
    {
      url: 'https://hooks.example.com/rebuild',
      events: ['publish', 'delete'],
      secret: process.env.KRANTHO_WEBHOOK_SECRET,
    },
  ],
})
```

Each delivery is logged and shows in **Setup › Integrations**. A failed delivery is retried automatically, backing off from 30 seconds to an hour, up to five attempts; after that it stays failed until someone chooses **Retry**. The retry runs from the server's request handler, at most every 30 seconds and never in the way of a request, so a site with no traffic retries on its next visit. Deliveries are logged on SQLite and Postgres; on the filesystem adapter there is no log, so they are fire-and-forget and never retried. A webhook's secret is never serialized to a browser and is replaced by `[redacted]` in any dump of the tree.

## Validation rules that span two leaves

- `site.defaultLocale` must appear in `site.supportedLocales`.
- `auth.mode: 'token'` requires `auth.token.secret`.
- `auth.mode: 'oidc'` requires `auth.oidc.issuer`, `clientId` and `redirectUri`.
- `auth.oidc.studioEntry: 'redirect'` (with `auth.mode: 'oidc'`) requires `auth.jwtSecret`.
- `auth.session.sameSite: 'none'` requires `auth.session.secure: 'always'`.
- `persistence.provider: 'postgres'` requires `persistence.postgres.url`.
- `seo.enrichment.meta.minChars` must not exceed `seo.enrichment.meta.maxChars`.
- `cache.pages: 'cdn'` requires `cache.cdn.provider` other than `none`.
- `cache.cdn.provider: 'cloudfront'` requires `cache.cdn.cloudfront.distributionId`.
- `cache.cdn.provider: 'gcp'` requires `cache.cdn.gcp.project` and `cache.cdn.gcp.urlMap`.
- A `media.provider` requires `persistence.provider` `sqlite` or `postgres`.
- `media.provider: 'vercel-blob'` requires `media.vercelBlob.token`.
- `media.provider: 's3'` requires `media.s3.bucket` and `media.s3.region`; a `media.s3.endpoint` requires `media.s3.publicUrl`; `media.s3.accessKeyId` and `media.s3.secretAccessKey` are set together or not at all.
- `media.provider: 'gcs'` requires `media.gcs.bucket`.

In production (`NODE_ENV=production`), the server also logs a warning at startup for `auth.mode: 'none'`, and for any other mode without `auth.jwtSecret`. These are warnings, not errors.

## Where the configuration is read

Everything that reads the tree resolves the object `defineKranthoConfig()` returned against `process.env`: the API handler, the content loader, the page cache rules and the Studio handler. Pass them the same object.

One process cannot see `krantho.config.ts`: the shared Next.js cache handler (`cache.shared: 'database'`), which Next.js loads by path. It opens the database from the defaults and the environment alone, reading only `paths.*` and `persistence.*`. If your database is not the default, set it by environment (`KRANTHO_PERSISTENCE_PROVIDER`, `KRANTHO_PERSISTENCE_POSTGRES_URL`, `KRANTHO_PATHS_DATA_DIR`). See [Rendering and caching](/docs/rendering-modes).

## Loading a .env file in development

Krantho does not read `.env` files itself — the process environment is the interface.

Next.js loads `.env` from the project directory into the environment before it reads `next.config.ts`, so `next dev` needs nothing more for a `.env` beside `package.json`. A file elsewhere, such as one shared by a monorepo, needs loading into the environment before `next dev` starts. Do not add Node's `--env-file` flag to it: `next dev` passes its Node flags to the server it starts through `NODE_OPTIONS`, and Node 26 refuses `--env-file` there.

Vite does not put `.env` into `process.env` for server code, so a SvelteKit or Express project lets Node load the file before the dev server starts:

```json title="package.json"
{
  "scripts": {
    "dev": "node --env-file-if-exists=.env node_modules/vite/bin/vite.js dev"
  }
}
```

> [!CAUTION]
> Never re-expose a secret through a bundler's `env` option. That inlines the value into build output, which is the one place it must never appear.

## Every setting

These tables are generated from the configuration schema by `envReference()` in `@krantho/config`. **Secret** marks a leaf that also accepts a `_FILE` variable; **code only** marks a structured leaf with no variable.

### Site identity

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_SITE_DOMAIN` | `site.domain` | string | unset | Bare hostname of the site. |
| `KRANTHO_SITE_NAME` | `site.name` | string | unset | Human-readable site name. |
| `KRANTHO_SITE_LANGUAGE` | `site.language` | string | unset | Primary content language as a locale code. |
| `KRANTHO_SITE_BASE_URL` | `site.baseUrl` | string | unset | Absolute base URL used for canonical links, the sitemap and robots. |
| `KRANTHO_SITE_SUPPORTED_LOCALES` | `site.supportedLocales` | comma-separated list | the primary language alone | Locales the site publishes. Defaults to the primary language alone. |
| `KRANTHO_SITE_DEFAULT_LOCALE` | `site.defaultLocale` | string | the primary language | Locale served when a request names none. Defaults to the primary language. |

### Paths

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_PATHS_DATA_DIR` | `paths.dataDir` | string | `.krantho` | Directory for krantho runtime data, relative to the working directory. |
| `KRANTHO_PATHS_CONTENT_DIR` | `paths.contentDir` | string | `content` | Directory holding markdown content. |
| `KRANTHO_PATHS_SEO_GENERATED_DIR` | `paths.seoGeneratedDir` | string | `<paths.contentDir>/seo/generated` | Directory the SEO pipeline writes generated files to. Defaults to seo/generated under the content directory. |

### Persistence

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_PERSISTENCE_PROVIDER` | `persistence.provider` | string | `sqlite` | Persistence backend: sqlite, postgres or filesystem. |
| `KRANTHO_PERSISTENCE_SQLITE_PATH` | `persistence.sqlite.path` | string | `<paths.dataDir>/content.db` | SQLite database file. Defaults to the data directory plus content.db. |
| `KRANTHO_PERSISTENCE_SQLITE_BUSY_TIMEOUT_MS` | `persistence.sqlite.busyTimeoutMs` | integer | `10000` | How long a statement waits for another connection's write lock. |
| `KRANTHO_PERSISTENCE_SQLITE_WAL_RETRIES` | `persistence.sqlite.walRetries` | integer | `10` | Attempts to switch a new database file into WAL mode. At least one. |
| `KRANTHO_PERSISTENCE_SQLITE_WAL_RETRY_DELAY_MS` | `persistence.sqlite.walRetryDelayMs` | integer | `50` | Pause between WAL switch attempts. |
| `KRANTHO_PERSISTENCE_POSTGRES_URL` | `persistence.postgres.url` | string | unset | Postgres connection URL. Required when the provider is postgres. **Secret.** |
| `KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS` | `persistence.postgres.maxConnections` | integer | unset | Connection pool size per process. Unset uses the driver default of 10; keep it small on serverless. |
| `KRANTHO_PERSISTENCE_POSTGRES_PREPARE` | `persistence.postgres.prepare` | boolean | unset | Use prepared statements. Unset uses the driver default (on); set false behind a transaction pooler such as PgBouncer or a pooled Neon URL. |
| `KRANTHO_PERSISTENCE_POSTGRES_IDLE_TIMEOUT_SEC` | `persistence.postgres.idleTimeoutSec` | integer | unset | Seconds before an idle pooled connection is closed. Unset keeps idle connections open. |
| `KRANTHO_PERSISTENCE_FILESYSTEM_CONTENT_PATH` | `persistence.filesystem.contentPath` | string | `<paths.contentDir>` | Content root for the filesystem adapter. Defaults to the content directory. |

### Content engine

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_CONTENT_CACHE_ENABLED` | `content.cache.enabled` | boolean | `true` | Enable the content cache of the API and of server-rendered pages. With cache.pages next-isr, Next.js caches page reads instead; with cdn, the CDN caches the pages and pages read uncached. |
| `KRANTHO_CONTENT_CACHE_TTL_MS` | `content.cache.ttlMs` | integer | `300000` | Cache entry lifetime in milliseconds. A published change reaches server-rendered pages after at most this long, since pages and the API may run in separate processes. |
| `KRANTHO_CONTENT_CACHE_MAX_ENTRIES` | `content.cache.maxEntries` | integer | `100` | Maximum cached documents. |
| `KRANTHO_CONTENT_AT_NOTATION` | `content.atNotation` | boolean | `true` | Expand @field references in markdown bodies. |
| `KRANTHO_CONTENT_WATCH` | `content.watch` | boolean | `false` | Watch filesystem collections and sync changes into the database. |
| `KRANTHO_CONTENT_DEFAULT_STATUS_FILESYSTEM` | `content.defaultStatus.filesystem` | string | `published` | Status given to documents imported from markdown files. |
| `KRANTHO_CONTENT_LIST_MAX_LIMIT` | `content.list.maxLimit` | integer | unset | Cap on list responses. Unset means a list returns every row. |
| `KRANTHO_CONTENT_SEARCH_MIN_QUERY_LENGTH` | `content.search.minQueryLength` | integer | `2` | Shortest accepted search query. |
| `KRANTHO_CONTENT_SEARCH_DEFAULT_LIMIT` | `content.search.defaultLimit` | integer | `200` | Search results returned when the request names no limit. |
| `KRANTHO_CONTENT_SEARCH_MAX_LIMIT` | `content.search.maxLimit` | integer | `500` | Cap on search results. |
| `KRANTHO_CONTENT_VERSIONS_KEEP` | `content.versions.keep` | integer | `10` | Versions retained per document when purging. |
| `KRANTHO_CONTENT_LOCK_LEASE_MS` | `content.lock.leaseMs` | integer | `300000` | How long an editing lock is held before it expires. |

### Page cache

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_CACHE_PAGES` | `cache.pages` | string | `none` | How rendered pages are cached: none (render every request), next-isr (Next.js keeps each page until a content change invalidates it; the page routes must be ISR routes) or cdn (each page carries CDN cache headers and cache tags, and a content change purges the CDN; requires cache.cdn.provider). |
| `KRANTHO_CACHE_CDN_PROVIDER` | `cache.cdn.provider` | string | `none` | CDN in front of the site, purged when content changes: none, vercel, cloudfront or gcp (Cloud CDN). |
| `KRANTHO_CACHE_CDN_S_MAX_AGE_SEC` | `cache.cdn.sMaxAgeSec` | integer | `86400` | Seconds the CDN keeps a page when no content change purges it first. |
| `KRANTHO_CACHE_CDN_STALE_WHILE_REVALIDATE_SEC` | `cache.cdn.staleWhileRevalidateSec` | integer | `604800` | Seconds the CDN may serve a stale page while it fetches a fresh one. |
| `KRANTHO_CACHE_CDN_TAG_HEADER` | `cache.cdn.tagHeader` | string | `x-krantho-cache-tag` | Response header carrying the cache tags with the cloudfront provider. The CloudFront distribution must be configured to read the same header. |
| `KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID` | `cache.cdn.cloudfront.distributionId` | string | unset | CloudFront distribution to purge. Required when the provider is cloudfront. |
| `KRANTHO_CACHE_CDN_GCP_PROJECT` | `cache.cdn.gcp.project` | string | unset | Google Cloud project of the URL map. Required when the provider is gcp. |
| `KRANTHO_CACHE_CDN_GCP_URL_MAP` | `cache.cdn.gcp.urlMap` | string | unset | Cloud CDN URL map to purge. Required when the provider is gcp. |
| `KRANTHO_CACHE_CDN_GCP_ACCESS_TOKEN` | `cache.cdn.gcp.accessToken` | string | unset | OAuth access token for the Compute Engine API. Unset fetches one from the metadata server. **Secret.** |
| `KRANTHO_CACHE_SHARED` | `cache.shared` | string | `none` | Where Next.js keeps its page and data cache: none (each instance keeps its own) or database (shared by every instance through the persistence backend). |

### Authentication

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_AUTH` | `auth.mode` | string | `none` | Authentication mode: none, token or oidc. |
| `KRANTHO_AUTH_REQUIRE_AUTH_FOR_READS` | `auth.requireAuthForReads` | boolean | `false` | Require authentication for GET endpoints as well as writes. Sign-in, robots.txt, the sitemap, llms.txt and the IndexNow key stay public. |
| `KRANTHO_API_TOKEN` | `auth.token.secret` | string | unset | Shared secret accepted by token mode. **Secret.** |
| `KRANTHO_TOKEN_EMAIL` | `auth.token.email` | string | `admin@local` | Email reported for the token-mode identity. |
| `KRANTHO_TOKEN_ROLE` | `auth.token.role` | string | `admin` | Role granted to the token-mode identity. |
| `KRANTHO_JWT_SECRET` | `auth.jwtSecret` | string | unset | Signing secret for session tokens. An ephemeral one is generated when unset. **Secret.** |
| `OIDC_ISSUER_URL` | `auth.oidc.issuer` | string | unset | OIDC issuer URL. |
| `OIDC_CLIENT_ID` | `auth.oidc.clientId` | string | unset | OIDC client identifier. |
| `OIDC_CLIENT_SECRET` | `auth.oidc.clientSecret` | string | unset | OIDC client secret, sent on the token exchange (client_secret_post). Unset means a public client (PKCE only). **Secret.** |
| `OIDC_REDIRECT_URI` | `auth.oidc.redirectUri` | string | unset | OIDC redirect URI registered with the provider. |
| `OIDC_POST_LOGOUT_URI` | `auth.oidc.postLogoutUri` | string | `/studio/` | Where the provider returns the browser after logout. |
| `KRANTHO_AUTH_OIDC_SCOPES` | `auth.oidc.scopes` | comma-separated list | `openid`, `email`, `profile` | Scopes requested at the authorize step. |
| `KRANTHO_SIGNUP` | `auth.oidc.signup` | string | `closed` | Whether a first-time OIDC login creates a user: open or closed. |
| `KRANTHO_AUTH_OIDC_STUDIO_ENTRY` | `auth.oidc.studioEntry` | string | `login` | How /studio treats a visitor without a session: login shows the Studio sign-in page; redirect sends the visitor to the OIDC provider and answers 404 when sign-in is refused. |
| `KRANTHO_ADMIN_EMAILS` | `auth.oidc.adminEmails` | comma-separated list | `[]` | Emails promoted to Studio on login. |
| `KRANTHO_AUTH_OIDC_NEW_USER_ROLE` | `auth.oidc.newUserRole` | string | `viewer` | Role given to a user created by OIDC signup. |
| `KRANTHO_AUTH_WORKLOAD_ISSUER` | `auth.workload.issuer` | string | unset | Issuer URL of the platform whose workload identity tokens may call the API without a stored secret, for example https://token.actions.githubusercontent.com for GitHub Actions. Turns on workload identity together with audience and subjects. |
| `KRANTHO_AUTH_WORKLOAD_AUDIENCE` | `auth.workload.audience` | string | unset | Audience a workload identity token must carry: the value the workflow asks the platform for, usually the site URL. |
| `KRANTHO_AUTH_WORKLOAD_SUBJECTS` | `auth.workload.subjects` | comma-separated list | `[]` | Subjects a workload identity token may carry: an exact value, or a prefix ending in * such as repo:ORG/REPO:*. A token with any other subject is refused. |
| `KRANTHO_AUTH_SESSION_ACCESS_TTL_SEC` | `auth.session.accessTtlSec` | integer | `900` | Access token lifetime in seconds. |
| `KRANTHO_AUTH_SESSION_REFRESH_TTL_SEC` | `auth.session.refreshTtlSec` | integer | `2592000` | Refresh token lifetime in seconds. |
| `KRANTHO_AUTH_SESSION_COOKIE_PREFIX` | `auth.session.cookiePrefix` | string | `krantho` | Prefix for the session cookie names. |
| `KRANTHO_AUTH_SESSION_SECURE` | `auth.session.secure` | string | `auto` | Secure cookie flag: always, never, or auto — infer it from x-forwarded-proto. |
| `KRANTHO_AUTH_SESSION_SAME_SITE` | `auth.session.sameSite` | string | `lax` | SameSite cookie policy: lax, strict or none. none requires auth.session.secure always. |
| `KRANTHO_AUTH_TRUST_PROXY` | `auth.trustProxy` | boolean | `false` | Widen what auth.session.secure "auto" accepts as proof of HTTPS to the other headers a terminating proxy may send. |

### Media and images

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_MEDIA_PROVIDER` | `media.provider` | string | unset | Where media files are stored: local, vercel-blob, s3 or gcs. Unset turns media off. Media needs sqlite or postgres persistence. |
| `KRANTHO_MEDIA_LOCAL_DIR` | `media.local.dir` | string | `public/uploads` | Directory the local store writes files to. The host framework must serve it at media.local.urlPrefix. |
| `KRANTHO_MEDIA_LOCAL_URL_PREFIX` | `media.local.urlPrefix` | string | `/uploads` | URL prefix the host framework serves the local store directory under. |
| `KRANTHO_MEDIA_VERCEL_BLOB_TOKEN` | `media.vercelBlob.token` | string | unset | Read-write token of the Vercel Blob store. Required when the provider is vercel-blob. **Secret.** |
| `KRANTHO_MEDIA_S3_BUCKET` | `media.s3.bucket` | string | unset | S3 bucket name. Required when the provider is s3. |
| `KRANTHO_MEDIA_S3_REGION` | `media.s3.region` | string | unset | S3 region, such as eu-north-1, or auto for Cloudflare R2. Required when the provider is s3. |
| `KRANTHO_MEDIA_S3_ENDPOINT` | `media.s3.endpoint` | string | unset | Endpoint URL of an S3-compatible service such as Cloudflare R2 or MinIO. Unset uses AWS. When set, media.s3.publicUrl is required. |
| `KRANTHO_MEDIA_S3_FORCE_PATH_STYLE` | `media.s3.forcePathStyle` | boolean | `false` | Address the bucket in the URL path rather than the host name, as MinIO needs. |
| `KRANTHO_MEDIA_S3_PUBLIC_URL` | `media.s3.publicUrl` | string | `https://<media.s3.bucket>.s3.<media.s3.region>.amazonaws.com` when media.s3.endpoint is unset | Public base URL objects are served from, such as a CDN or bucket domain. Objects must be publicly readable there. |
| `KRANTHO_MEDIA_S3_ACCESS_KEY_ID` | `media.s3.accessKeyId` | string | unset | Access key ID. Set it together with media.s3.secretAccessKey; unset both to use the AWS default credential chain. |
| `KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY` | `media.s3.secretAccessKey` | string | unset | Secret access key paired with media.s3.accessKeyId. **Secret.** |
| `KRANTHO_MEDIA_GCS_BUCKET` | `media.gcs.bucket` | string | unset | Google Cloud Storage bucket name. Required when the provider is gcs. |
| `KRANTHO_MEDIA_GCS_PUBLIC_URL` | `media.gcs.publicUrl` | string | `https://storage.googleapis.com/<media.gcs.bucket>` | Public base URL objects are served from, such as a CDN in front of the bucket. Objects must be publicly readable there. |
| `KRANTHO_MEDIA_GCS_CREDENTIALS` | `media.gcs.credentials` | string | unset | Service-account key JSON. Unset uses the metadata server of Cloud Run, GKE or Compute Engine. **Secret.** |
| `KRANTHO_MEDIA_MAX_SIZE` | `media.maxFileSize` | integer | `10485760` | Largest accepted upload in bytes. |
| `KRANTHO_MEDIA_ALLOWED_MIME_TYPES` | `media.allowedMimeTypes` | comma-separated list | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`, `image/svg+xml` | Upload MIME types accepted. |
| `KRANTHO_MEDIA_IMAGE_MAX_WIDTH` | `media.image.maxWidth` | integer | `2048` | Uploads wider than this are downscaled. |
| `KRANTHO_MEDIA_IMAGE_QUALITY_JPEG` | `media.image.quality.jpeg` | integer | `82` | JPEG variant quality. |
| `KRANTHO_MEDIA_IMAGE_QUALITY_WEBP` | `media.image.quality.webp` | integer | `80` | WebP variant quality. |
| `KRANTHO_MEDIA_IMAGE_QUALITY_AVIF` | `media.image.quality.avif` | integer | `65` | AVIF variant quality. |
| `KRANTHO_MEDIA_IMAGE_QUALITY_NORMALIZE` | `media.image.quality.normalize` | integer | `85` | Quality used when re-encoding an upload. |
| code only | `media.image.presets` | structured | `{"xs":48,"sm":96,"md":256,"lg":512,"xl":1024,"full":null}` | Preset name to pixel width. |
| `KRANTHO_IMAGE_CACHE_MAX_ENTRIES` | `media.image.cache.maxEntries` | integer | `1000` | Image variants held in memory. |
| `KRANTHO_IMAGE_CACHE_MAX_MB` | `media.image.cache.maxMb` | integer | `256` | Memory budget for the image variant cache. |
| `KRANTHO_IMAGE_CACHE_TTI_SECS` | `media.image.cache.ttiSec` | integer | `3600` | Idle seconds before a cached variant is dropped. |

### Language model

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_LLM_PROVIDER` | `llm.provider` | string | `anthropic` | LLM provider used for enrichment: anthropic, claude-code, openai, gemini, openrouter or ollama. Each provider has its own credential below; ollama needs none. |
| `KRANTHO_LLM_MODEL` | `llm.model` | string | unset | Model identifier. Unset uses the provider's preset default. |
| `KRANTHO_LLM_ANTHROPIC_API_KEY` | `llm.anthropic.apiKey` | string | unset | API key for the anthropic provider. **Secret.** |
| `KRANTHO_LLM_OPENAI_API_KEY` | `llm.openai.apiKey` | string | unset | API key for the openai provider. **Secret.** |
| `KRANTHO_LLM_GEMINI_API_KEY` | `llm.gemini.apiKey` | string | unset | API key for the gemini provider. **Secret.** |
| `KRANTHO_LLM_OPENROUTER_API_KEY` | `llm.openrouter.apiKey` | string | unset | API key for the openrouter provider. **Secret.** |
| `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` | `llm.claudeCode.authToken` | string | unset | The token `claude setup-token` prints, used only by the claude-code provider, for development on your own machine. No other provider reads it; deployments use an API key. **Secret.** |
| `KRANTHO_LLM_BASE_URL` | `llm.baseUrl` | string | unset | Override the provider's base URL for a proxy or self-hosted endpoint. |
| code only | `llm.profiles` | structured | `{}` | How requests to one model are shaped, by model id, over the default for that model: reasoningEffort (openai only; default leaves it to the model), reasoningHeadroom (output tokens added for the thinking a model does) and temperature. Models such as the gpt-5 family and the o-series reject a temperature and need their reasoning kept short, so the defaults ask for the lowest effort each accepts. |

### Stored secrets

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_SECRETS_PROVIDER` | `secrets.provider` | string | `local` | The vault that encrypts the secrets a site stores in its database, such as a pasted LLM key. Only local is available: it encrypts with a key from the environment. |
| `KRANTHO_SECRETS_LOCAL_KEY` | `secrets.local.key` | string | unset | Key the local vault encrypts stored secrets with, at least 32 characters. Unset uses auth.jwtSecret; with neither, a site stores no secrets in its database. **Secret.** |

### Studio assistant

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_ASSISTANT_ENABLED` | `assistant.enabled` | boolean | `false` | Turn on the Studio assistant. It needs sqlite or postgres and an LLM configured in Setup › AI provider. |
| `KRANTHO_ASSISTANT_PROVIDER` | `assistant.provider` | string | unset | Provider for the assistant, one of the llm.provider values, using that provider's own credential. Unset uses the provider chosen in Setup › AI provider. |
| `KRANTHO_ASSISTANT_MODEL` | `assistant.model` | string | unset | Model for the assistant. Unset uses the model chosen in Setup › AI provider, or the provider's default model when assistant.provider is set. |
| `KRANTHO_ASSISTANT_ROLE` | `assistant.role` | string | `editor` | The lowest role that may use the assistant: viewer, editor or Studio. It decides who can spend the site's LLM credential. |
| `KRANTHO_ASSISTANT_CONFIRM_TTL_SEC` | `assistant.confirmTtlSec` | integer | `600` | Seconds a proposed action can be confirmed in the chat. At most 3600. |
| `KRANTHO_ASSISTANT_LIMITS_MAX_TURNS` | `assistant.limits.maxTurns` | integer | `8` | Model calls in one chat request. |
| `KRANTHO_ASSISTANT_LIMITS_MAX_TOOL_CALLS` | `assistant.limits.maxToolCalls` | integer | `16` | Tool executions in one chat request. |
| `KRANTHO_ASSISTANT_LIMITS_MAX_TOKENS` | `assistant.limits.maxTokens` | integer | `16000` | Output token cap for each model call. |
| `KRANTHO_ASSISTANT_LIMITS_MAX_REQUEST_TOKENS` | `assistant.limits.maxRequestTokens` | integer | `200000` | Input plus output tokens across all model calls of one chat request. |
| `KRANTHO_ASSISTANT_LIMITS_MAX_HISTORY_MESSAGES` | `assistant.limits.maxHistoryMessages` | integer | `40` | Conversation messages accepted from Studio in one chat request. |
| `KRANTHO_ASSISTANT_LIMITS_MAX_INPUT_CHARS` | `assistant.limits.maxInputChars` | integer | `60000` | Characters accepted from Studio across the conversation. |
| `KRANTHO_ASSISTANT_LIMITS_TOOL_RESULT_CHARS` | `assistant.limits.toolResultChars` | integer | `12000` | Characters of one tool result sent to the model. |

### SEO

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `KRANTHO_SEO_IDENTITY` | `seo.identity` | string | unset | Schema.org type describing the site. |
| code only | `seo.collections` | structured | `{}` | Collection name to Schema.org types. |
| code only | `seo.routes` | structured | `{}` | URL pattern to Schema.org types. |
| code only | `seo.site` | structured | unset | Rich site-level SEO configuration. |
| code only | `seo.richCollections` | structured | `{}` | Rich per-collection SEO configuration. |
| code only | `seo.richRoutes` | structured | `{}` | Rich per-route SEO configuration. |
| `KRANTHO_SEO_SEED_MODE` | `seo.seedMode` | string | `seed` | seed preserves rows already in the database; overwrite replaces them. |
| `KRANTHO_SEO_CONFIG_DIR` | `seo.configDir` | string | unset | Directory of SEO seed files, relative to the working directory. |
| `KRANTHO_SEO_INDEX_NOW_KEY` | `seo.indexNow.key` | string | unset | IndexNow key. When set, the site serves it at /<key>.txt and notifies IndexNow (Bing and other participating engines) of published, changed and removed pages. |
| `KRANTHO_SEO_ENRICHMENT_META_MIN_CHARS` | `seo.enrichment.meta.minChars` | integer | `120` | Shortest acceptable generated meta description. |
| `KRANTHO_SEO_ENRICHMENT_META_MAX_CHARS` | `seo.enrichment.meta.maxChars` | integer | `155` | Longest acceptable generated meta description. |
| `KRANTHO_SEO_ENRICHMENT_META_CONTENT_CAP` | `seo.enrichment.meta.contentCap` | integer | `2000` | Characters of body text sent to the model for a meta description. |
| `KRANTHO_SEO_ENRICHMENT_META_MAX_TOKENS` | `seo.enrichment.meta.maxTokens` | integer | `1024` | Token budget for a meta description completion. |
| `KRANTHO_SEO_ENRICHMENT_ARCHETYPE_CONTENT_CAP` | `seo.enrichment.archetype.contentCap` | integer | `3000` | Characters of body text sent to the model for archetype enrichment. |
| `KRANTHO_SEO_ENRICHMENT_ARCHETYPE_MAX_TOKENS` | `seo.enrichment.archetype.maxTokens` | integer | `2048` | Token budget for an archetype completion. |

### Webhooks

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| code only | `webhooks` | structured | `[]` | Outgoing webhooks, a list of { url, events, secret? }: url is an absolute http(s) URL, events lists at least one of create, update, publish and delete, and secret signs each delivery with HMAC-SHA256. Read a secret from the environment inside krantho.config.ts, for example secret: process.env.KRANTHO_WEBHOOK_SECRET. Deliveries are logged and retried automatically on SQLite and Postgres; on the filesystem adapter there is no log, so deliveries are fire-and-forget. |

### Build-time tools

| Variable | Path | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `CLAUDE_CONCURRENCY` | `tools.concurrency` | integer | `5` | Parallel model calls made by the build-time pipeline. |
| `KRANTHO_TOOLS_ENRICH_SERVICE_CAP` | `tools.enrich.serviceCap` | integer | `1500` | Characters of a service document sent to the model. |
| `KRANTHO_TOOLS_ENRICH_LLMS_DESCRIPTION_CAP` | `tools.enrich.llmsDescriptionCap` | integer | `300` | Longest generated llms.txt link description. |
| `KRANTHO_TOOLS_ENRICH_FAQ_MIN_PER_ROUTE` | `tools.enrich.faqMinPerRoute` | integer | `5` | FAQ entries a route must have before it is considered complete. |
| `KRANTHO_TOOLS_ENRICH_SKIP_FIELDS` | `tools.enrich.skipFields` | comma-separated list | `description`, `meta-description`, `meta-description-*`, `nav-*`, `footer-*`, `form-*` | Frontmatter fields left out of the text the enrichment tools send to the model. A trailing `*` matches every field with that prefix. Site-specific fields belong in the project's own krantho.config.ts. |
