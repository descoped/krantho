/** How an environment variable's string is turned into a configuration value */
export type LeafKind = 'string' | 'int' | 'boolean' | 'list' | 'structured'

/** One configurable leaf of the tree */
export interface LeafSpec {
  /** Dotted path into the resolved tree */
  path: string
  kind: LeafKind
  /**
   * Environment variable name. Omitted means the mechanical
   * `KRANTHO_<SECTION>_<KEY>` form derived from {@link LeafSpec.path}.
   * `structured` leaves have no environment override.
   */
  env?: string
  /** Secret leaves are redacted, never serialized to a browser, and accept a `_FILE` suffix */
  secret?: true
  description: string
}

/** Derive the mechanical environment variable name for a dotted path */
export function mechanicalEnvName(path: string): string {
  const parts = path
    .split('.')
    .flatMap((segment) => segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' '))
    .map((word) => word.toUpperCase())
  return `KRANTHO_${parts.join('_')}`
}

/** The environment variable a leaf reads, or null when it has none */
export function envNameFor(leaf: LeafSpec): string | null {
  if (leaf.kind === 'structured') return null
  return leaf.env ?? mechanicalEnvName(leaf.path)
}

/**
 * Every leaf of the configuration tree.
 *
 * The `env` overrides are the variables that existed before the tree did, which
 * keep their names so running deployments keep working, and the one credential
 * whose name states what the token is. Everything else takes the mechanical form.
 */
export const LEAVES: readonly LeafSpec[] = [
  // --- site ---
  { path: 'site.domain', kind: 'string', description: 'Bare hostname of the site.' },
  { path: 'site.name', kind: 'string', description: 'Human-readable site name.' },
  {
    path: 'site.language',
    kind: 'string',
    description: 'Primary content language as a locale code.',
  },
  {
    path: 'site.baseUrl',
    kind: 'string',
    description: 'Absolute base URL used for canonical links, the sitemap and robots.',
  },
  {
    path: 'site.supportedLocales',
    kind: 'list',
    description: 'Locales the site publishes. Defaults to the primary language alone.',
  },
  {
    path: 'site.defaultLocale',
    kind: 'string',
    description: 'Locale served when a request names none. Defaults to the primary language.',
  },
  {
    path: 'site.logo',
    kind: 'string',
    description: "Absolute URL of the site's or its organization's logo, used in structured data.",
  },
  {
    path: 'site.description',
    kind: 'string',
    description: 'What the site or its organization is, in a sentence, used in structured data.',
  },
  {
    path: 'site.alternateName',
    kind: 'string',
    description: 'Another name the site or organization is known by.',
  },
  {
    path: 'site.sameAs',
    kind: 'list',
    description: 'Absolute URLs of profile pages that identify the organization.',
  },

  // --- paths ---
  {
    path: 'paths.dataDir',
    kind: 'string',
    description: 'Directory for krantho runtime data, relative to the working directory.',
  },
  { path: 'paths.contentDir', kind: 'string', description: 'Directory holding markdown content.' },
  {
    path: 'paths.seoGeneratedDir',
    kind: 'string',
    description:
      'Directory the SEO pipeline writes generated files to. Defaults to seo/generated under the content directory.',
  },

  // --- persistence ---
  {
    path: 'persistence.provider',
    kind: 'string',
    description: 'Persistence backend: sqlite, postgres or filesystem.',
  },
  {
    path: 'persistence.sqlite.path',
    kind: 'string',
    description: 'SQLite database file. Defaults to the data directory plus content.db.',
  },
  {
    path: 'persistence.sqlite.busyTimeoutMs',
    kind: 'int',
    description: "How long a statement waits for another connection's write lock.",
  },
  {
    path: 'persistence.sqlite.walRetries',
    kind: 'int',
    description: 'Attempts to switch a new database file into WAL mode. At least one.',
  },
  {
    path: 'persistence.sqlite.walRetryDelayMs',
    kind: 'int',
    description: 'Pause between WAL switch attempts.',
  },
  {
    path: 'persistence.postgres.url',
    kind: 'string',
    secret: true,
    description: 'Postgres connection URL. Required when the provider is postgres.',
  },
  {
    path: 'persistence.postgres.maxConnections',
    kind: 'int',
    description:
      'Connection pool size per process. Unset uses the driver default of 10; keep it small on serverless.',
  },
  {
    path: 'persistence.postgres.prepare',
    kind: 'boolean',
    description:
      'Use prepared statements. Unset uses the driver default (on); set false behind a transaction pooler such as PgBouncer or a pooled Neon URL.',
  },
  {
    path: 'persistence.postgres.idleTimeoutSec',
    kind: 'int',
    description:
      'Seconds before an idle pooled connection is closed. Unset keeps idle connections open.',
  },
  {
    path: 'persistence.filesystem.contentPath',
    kind: 'string',
    description: 'Content root for the filesystem adapter. Defaults to the content directory.',
  },

  // --- content ---
  {
    path: 'content.cache.enabled',
    kind: 'boolean',
    description:
      'Enable the content cache of the API and of server-rendered pages. With cache.pages next-isr, Next.js caches page reads instead; with cdn, the CDN caches the pages and pages read uncached.',
  },
  {
    path: 'content.cache.ttlMs',
    kind: 'int',
    description:
      'Cache entry lifetime in milliseconds. A published change reaches server-rendered pages after at most this long, since pages and the API may run in separate processes.',
  },
  { path: 'content.cache.maxEntries', kind: 'int', description: 'Maximum cached documents.' },
  {
    path: 'content.atNotation',
    kind: 'boolean',
    description: 'Expand @field references in markdown bodies.',
  },
  {
    path: 'content.watch',
    kind: 'boolean',
    description: 'Watch filesystem collections and sync changes into the database.',
  },
  {
    path: 'content.defaultStatus.filesystem',
    kind: 'string',
    description: 'Status given to documents imported from markdown files.',
  },
  {
    path: 'content.list.maxLimit',
    kind: 'int',
    description: 'Cap on list responses. Unset means a list returns every row.',
  },
  {
    path: 'content.search.minQueryLength',
    kind: 'int',
    description: 'Shortest accepted search query.',
  },
  {
    path: 'content.search.defaultLimit',
    kind: 'int',
    description: 'Search results returned when the request names no limit.',
  },
  { path: 'content.search.maxLimit', kind: 'int', description: 'Cap on search results.' },
  {
    path: 'content.versions.keep',
    kind: 'int',
    description: 'Versions retained per document when purging.',
  },
  {
    path: 'content.lock.leaseMs',
    kind: 'int',
    description: 'How long an editing lock is held before it expires.',
  },

  // --- cache ---
  {
    path: 'cache.pages',
    kind: 'string',
    description:
      'How rendered pages are cached: none (render every request), next-isr (Next.js keeps each page until a content change invalidates it; the page routes must be ISR routes) or cdn (each page carries CDN cache headers and cache tags, and a content change purges the CDN; requires cache.cdn.provider).',
  },
  {
    path: 'cache.cdn.provider',
    kind: 'string',
    description:
      'CDN in front of the site, purged when content changes: none, vercel, cloudfront or gcp (Cloud CDN).',
  },
  {
    path: 'cache.cdn.sMaxAgeSec',
    kind: 'int',
    description: 'Seconds the CDN keeps a page when no content change purges it first.',
  },
  {
    path: 'cache.cdn.staleWhileRevalidateSec',
    kind: 'int',
    description: 'Seconds the CDN may serve a stale page while it fetches a fresh one.',
  },
  {
    path: 'cache.cdn.tagHeader',
    kind: 'string',
    description:
      'Response header carrying the cache tags with the cloudfront provider. The CloudFront distribution must be configured to read the same header.',
  },
  {
    path: 'cache.cdn.cloudfront.distributionId',
    kind: 'string',
    description: 'CloudFront distribution to purge. Required when the provider is cloudfront.',
  },
  {
    path: 'cache.cdn.gcp.project',
    kind: 'string',
    description: 'Google Cloud project of the URL map. Required when the provider is gcp.',
  },
  {
    path: 'cache.cdn.gcp.urlMap',
    kind: 'string',
    description: 'Cloud CDN URL map to purge. Required when the provider is gcp.',
  },
  {
    path: 'cache.cdn.gcp.accessToken',
    kind: 'string',
    secret: true,
    description:
      'OAuth access token for the Compute Engine API. Unset fetches one from the metadata server.',
  },
  {
    path: 'cache.shared',
    kind: 'string',
    description:
      'Where Next.js keeps its page and data cache: none (each instance keeps its own) or database (shared by every instance through the persistence backend).',
  },

  // --- auth ---
  {
    path: 'auth.mode',
    kind: 'string',
    env: 'KRANTHO_AUTH',
    description: 'Authentication mode: none, token or oidc.',
  },
  {
    path: 'auth.requireAuthForReads',
    kind: 'boolean',
    description:
      'Require authentication for GET endpoints as well as writes. Sign-in, robots.txt, the sitemap, llms.txt and the IndexNow key stay public.',
  },
  {
    path: 'auth.token.secret',
    kind: 'string',
    env: 'KRANTHO_API_TOKEN',
    secret: true,
    description: 'Shared secret accepted by token mode.',
  },
  {
    path: 'auth.token.email',
    kind: 'string',
    env: 'KRANTHO_TOKEN_EMAIL',
    description: 'Email reported for the token-mode identity.',
  },
  {
    path: 'auth.token.role',
    kind: 'string',
    env: 'KRANTHO_TOKEN_ROLE',
    description: 'Role granted to the token-mode identity.',
  },
  {
    path: 'auth.jwtSecret',
    kind: 'string',
    env: 'KRANTHO_JWT_SECRET',
    secret: true,
    description: 'Signing secret for session tokens. An ephemeral one is generated when unset.',
  },
  {
    path: 'auth.oidc.issuer',
    kind: 'string',
    env: 'OIDC_ISSUER_URL',
    description: 'OIDC issuer URL.',
  },
  {
    path: 'auth.oidc.clientId',
    kind: 'string',
    env: 'OIDC_CLIENT_ID',
    description: 'OIDC client identifier.',
  },
  {
    path: 'auth.oidc.clientSecret',
    kind: 'string',
    env: 'OIDC_CLIENT_SECRET',
    secret: true,
    description:
      'OIDC client secret, sent on the token exchange (client_secret_post). Unset means a public client (PKCE only).',
  },
  {
    path: 'auth.oidc.redirectUri',
    kind: 'string',
    env: 'OIDC_REDIRECT_URI',
    description: 'OIDC redirect URI registered with the provider.',
  },
  {
    path: 'auth.oidc.postLogoutUri',
    kind: 'string',
    env: 'OIDC_POST_LOGOUT_URI',
    description: 'Where the provider returns the browser after logout.',
  },
  {
    path: 'auth.oidc.scopes',
    kind: 'list',
    description: 'Scopes requested at the authorize step.',
  },
  {
    path: 'auth.oidc.signup',
    kind: 'string',
    env: 'KRANTHO_SIGNUP',
    description: 'Whether a first-time OIDC login creates a user: open or closed.',
  },
  {
    path: 'auth.oidc.studioEntry',
    kind: 'string',
    description:
      'How /studio treats a visitor without a session: login shows the Studio sign-in page; redirect sends the visitor to the OIDC provider and answers 404 when sign-in is refused.',
  },
  {
    path: 'auth.oidc.adminEmails',
    kind: 'list',
    env: 'KRANTHO_ADMIN_EMAILS',
    description: 'Emails promoted to Studio on login.',
  },
  {
    path: 'auth.oidc.newUserRole',
    kind: 'string',
    description: 'Role given to a user created by OIDC signup.',
  },
  {
    path: 'auth.workload.issuer',
    kind: 'string',
    description:
      'Issuer URL of the platform whose workload identity tokens may call the API without a stored secret, for example https://token.actions.githubusercontent.com for GitHub Actions. Turns on workload identity together with audience and subjects.',
  },
  {
    path: 'auth.workload.audience',
    kind: 'string',
    description:
      'Audience a workload identity token must carry: the value the workflow asks the platform for, usually the site URL.',
  },
  {
    path: 'auth.workload.subjects',
    kind: 'list',
    description:
      'Subjects a workload identity token may carry: an exact value, or a prefix ending in * such as repo:ORG/REPO:*. A token with any other subject is refused.',
  },
  {
    path: 'auth.session.accessTtlSec',
    kind: 'int',
    description: 'Access token lifetime in seconds.',
  },
  {
    path: 'auth.session.refreshTtlSec',
    kind: 'int',
    description: 'Refresh token lifetime in seconds.',
  },
  {
    path: 'auth.session.cookiePrefix',
    kind: 'string',
    description: 'Prefix for the session cookie names.',
  },
  {
    path: 'auth.session.secure',
    kind: 'string',
    description: 'Secure cookie flag: always, never, or auto — infer it from x-forwarded-proto.',
  },
  {
    path: 'auth.session.sameSite',
    kind: 'string',
    description:
      'SameSite cookie policy: lax, strict or none. none requires auth.session.secure always.',
  },
  {
    path: 'auth.trustProxy',
    kind: 'boolean',
    description:
      'Widen what auth.session.secure "auto" accepts as proof of HTTPS to the other headers a terminating proxy may send.',
  },

  // --- secrets ---
  {
    path: 'secrets.provider',
    kind: 'string',
    description:
      'The vault that encrypts the secrets a site stores in its database, such as a pasted LLM key. Only local is available: it encrypts with a key from the environment.',
  },
  {
    path: 'secrets.local.key',
    kind: 'string',
    secret: true,
    description:
      'Key the local vault encrypts stored secrets with, at least 32 characters. Unset uses auth.jwtSecret; with neither, a site stores no secrets in its database.',
  },

  // --- media ---
  {
    path: 'media.provider',
    kind: 'string',
    description:
      'Where media files are stored: local, vercel-blob, s3 or gcs. Unset turns media off. Media needs sqlite or postgres persistence.',
  },
  {
    path: 'media.local.dir',
    kind: 'string',
    description:
      'Directory the local store writes files to. The host framework must serve it at media.local.urlPrefix.',
  },
  {
    path: 'media.local.urlPrefix',
    kind: 'string',
    description: 'URL prefix the host framework serves the local store directory under.',
  },
  {
    path: 'media.vercelBlob.token',
    kind: 'string',
    secret: true,
    description:
      'Read-write token of the Vercel Blob store. Required when the provider is vercel-blob.',
  },
  {
    path: 'media.s3.bucket',
    kind: 'string',
    description: 'S3 bucket name. Required when the provider is s3.',
  },
  {
    path: 'media.s3.region',
    kind: 'string',
    description:
      'S3 region, such as eu-north-1, or auto for Cloudflare R2. Required when the provider is s3.',
  },
  {
    path: 'media.s3.endpoint',
    kind: 'string',
    description:
      'Endpoint URL of an S3-compatible service such as Cloudflare R2 or MinIO. Unset uses AWS. When set, media.s3.publicUrl is required.',
  },
  {
    path: 'media.s3.forcePathStyle',
    kind: 'boolean',
    description: 'Address the bucket in the URL path rather than the host name, as MinIO needs.',
  },
  {
    path: 'media.s3.publicUrl',
    kind: 'string',
    description:
      'Public base URL objects are served from, such as a CDN or bucket domain. Objects must be publicly readable there.',
  },
  {
    path: 'media.s3.accessKeyId',
    kind: 'string',
    description:
      'Access key ID. Set it together with media.s3.secretAccessKey; unset both to use the AWS default credential chain.',
  },
  {
    path: 'media.s3.secretAccessKey',
    kind: 'string',
    secret: true,
    description: 'Secret access key paired with media.s3.accessKeyId.',
  },
  {
    path: 'media.gcs.bucket',
    kind: 'string',
    description: 'Google Cloud Storage bucket name. Required when the provider is gcs.',
  },
  {
    path: 'media.gcs.publicUrl',
    kind: 'string',
    description:
      'Public base URL objects are served from, such as a CDN in front of the bucket. Objects must be publicly readable there.',
  },
  {
    path: 'media.gcs.credentials',
    kind: 'string',
    secret: true,
    description:
      'Service-account key JSON. Unset uses the metadata server of Cloud Run, GKE or Compute Engine.',
  },
  {
    path: 'media.maxFileSize',
    kind: 'int',
    env: 'KRANTHO_MEDIA_MAX_SIZE',
    description: 'Largest accepted upload in bytes.',
  },
  { path: 'media.allowedMimeTypes', kind: 'list', description: 'Upload MIME types accepted.' },
  {
    path: 'media.image.maxWidth',
    kind: 'int',
    description: 'Uploads wider than this are downscaled.',
  },
  { path: 'media.image.quality.jpeg', kind: 'int', description: 'JPEG variant quality.' },
  { path: 'media.image.quality.webp', kind: 'int', description: 'WebP variant quality.' },
  { path: 'media.image.quality.avif', kind: 'int', description: 'AVIF variant quality.' },
  {
    path: 'media.image.quality.normalize',
    kind: 'int',
    description: 'Quality used when re-encoding an upload.',
  },
  { path: 'media.image.presets', kind: 'structured', description: 'Preset name to pixel width.' },
  {
    path: 'media.image.cache.maxEntries',
    kind: 'int',
    env: 'KRANTHO_IMAGE_CACHE_MAX_ENTRIES',
    description: 'Image variants held in memory.',
  },
  {
    path: 'media.image.cache.maxMb',
    kind: 'int',
    env: 'KRANTHO_IMAGE_CACHE_MAX_MB',
    description: 'Memory budget for the image variant cache.',
  },
  {
    path: 'media.image.cache.ttiSec',
    kind: 'int',
    env: 'KRANTHO_IMAGE_CACHE_TTI_SECS',
    description: 'Idle seconds before a cached variant is dropped.',
  },

  // --- llm ---
  {
    path: 'llm.provider',
    kind: 'string',
    description:
      'LLM provider used for enrichment: anthropic, claude-code, openai, gemini, openrouter or ollama. Each provider has its own credential below; ollama needs none.',
  },
  {
    path: 'llm.model',
    kind: 'string',
    description: "Model identifier. Unset uses the provider's preset default.",
  },
  {
    path: 'llm.anthropic.apiKey',
    kind: 'string',
    secret: true,
    description: 'API key for the anthropic provider.',
  },
  {
    path: 'llm.openai.apiKey',
    kind: 'string',
    secret: true,
    description: 'API key for the openai provider.',
  },
  {
    path: 'llm.gemini.apiKey',
    kind: 'string',
    secret: true,
    description: 'API key for the gemini provider.',
  },
  {
    path: 'llm.openrouter.apiKey',
    kind: 'string',
    secret: true,
    description: 'API key for the openrouter provider.',
  },
  {
    path: 'llm.claudeCode.authToken',
    kind: 'string',
    env: 'KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN',
    secret: true,
    description:
      'The token `claude setup-token` prints, used only by the claude-code provider, for development on your own machine. No other provider reads it; deployments use an API key.',
  },
  {
    path: 'llm.profiles',
    kind: 'structured',
    description:
      'How requests to one model are shaped, by model id, over the default for that model: reasoningEffort (openai, gemini, openrouter and ollama; default leaves it to the model), reasoningHeadroom (output tokens added for the thinking a model does) and temperature. Models such as the gpt-5 family and the o-series reject a temperature and need their reasoning kept short, so the defaults ask for the lowest effort each accepts.',
  },
  {
    path: 'llm.baseUrl',
    kind: 'string',
    description: "Override the provider's base URL for a proxy or self-hosted endpoint.",
  },

  // --- assistant ---
  {
    path: 'assistant.enabled',
    kind: 'boolean',
    description:
      'Turn on the Studio assistant. It needs sqlite or postgres and an LLM configured in Setup › AI provider.',
  },
  {
    path: 'assistant.provider',
    kind: 'string',
    description:
      "Provider for the assistant, one of the llm.provider values, using that provider's own credential. Unset uses the provider chosen in Setup › AI provider.",
  },
  {
    path: 'assistant.model',
    kind: 'string',
    description:
      "Model for the assistant. Unset uses the model chosen in Setup › AI provider, or the provider's default model when assistant.provider is set.",
  },
  {
    path: 'assistant.role',
    kind: 'string',
    description:
      "The lowest role that may use the assistant: viewer, editor or Studio. It decides who can spend the site's LLM credential.",
  },
  {
    path: 'assistant.confirmTtlSec',
    kind: 'int',
    description: 'Seconds a proposed action can be confirmed in the chat. At most 3600.',
  },
  {
    path: 'assistant.limits.maxTurns',
    kind: 'int',
    description: 'Model calls in one chat request.',
  },
  {
    path: 'assistant.limits.maxToolCalls',
    kind: 'int',
    description: 'Tool executions in one chat request.',
  },
  {
    path: 'assistant.limits.maxTokens',
    kind: 'int',
    description: 'Output token cap for each model call.',
  },
  {
    path: 'assistant.limits.maxRequestTokens',
    kind: 'int',
    description: 'Input plus output tokens across all model calls of one chat request.',
  },
  {
    path: 'assistant.limits.maxHistoryMessages',
    kind: 'int',
    description: 'Conversation messages accepted from Studio in one chat request.',
  },
  {
    path: 'assistant.limits.maxInputChars',
    kind: 'int',
    description: 'Characters accepted from Studio across the conversation.',
  },
  {
    path: 'assistant.limits.toolResultChars',
    kind: 'int',
    description: 'Characters of one tool result sent to the model.',
  },

  // --- seo ---
  { path: 'seo.identity', kind: 'string', description: 'Schema.org type describing the site.' },
  {
    path: 'seo.collections',
    kind: 'structured',
    description: 'Collection name to Schema.org types.',
  },
  { path: 'seo.routes', kind: 'structured', description: 'URL pattern to Schema.org types.' },
  { path: 'seo.site', kind: 'structured', description: 'Rich site-level SEO configuration.' },
  {
    path: 'seo.richCollections',
    kind: 'structured',
    description: 'Rich per-collection SEO configuration.',
  },
  { path: 'seo.richRoutes', kind: 'structured', description: 'Rich per-route SEO configuration.' },
  {
    path: 'seo.seedMode',
    kind: 'string',
    description: 'seed preserves rows already in the database; overwrite replaces them.',
  },
  {
    path: 'seo.readers',
    kind: 'list',
    description:
      'Reader profiles (google, bing, or a site-registered one) whose published rules the structured data is checked against.',
  },
  {
    path: 'seo.configDir',
    kind: 'string',
    description: 'Directory of SEO seed files, relative to the working directory.',
  },
  {
    path: 'seo.indexNow.key',
    kind: 'string',
    description:
      'IndexNow key. When set, the site serves it at /<key>.txt and notifies IndexNow (Bing and other participating engines) of published, changed and removed pages.',
  },
  {
    path: 'seo.enrichment.meta.minChars',
    kind: 'int',
    description:
      'Shortest meta description the SEO checks accept — the editorial limit Studio and the API share, and the target for generated ones.',
  },
  {
    path: 'seo.enrichment.meta.maxChars',
    kind: 'int',
    description:
      'Longest meta description the SEO checks accept — the editorial limit Studio and the API share, and the target for generated ones.',
  },
  {
    path: 'seo.enrichment.meta.contentCap',
    kind: 'int',
    description: 'Characters of body text sent to the model for a meta description.',
  },
  {
    path: 'seo.enrichment.meta.maxTokens',
    kind: 'int',
    description: 'Token budget for a meta description completion.',
  },
  {
    path: 'seo.enrichment.title.maxChars',
    kind: 'int',
    description:
      'Longest title the SEO checks accept — the editorial limit Studio and the API share.',
  },
  {
    path: 'seo.enrichment.archetype.contentCap',
    kind: 'int',
    description: 'Characters of body text sent to the model for archetype enrichment.',
  },
  {
    path: 'seo.enrichment.archetype.maxTokens',
    kind: 'int',
    description: 'Token budget for an archetype completion.',
  },

  // --- webhooks ---
  {
    path: 'webhooks',
    kind: 'structured',
    description:
      'Outgoing webhooks, a list of { url, events, secret? }: url is an absolute http(s) URL, events lists at least one of create, update, publish and delete, and secret signs each delivery with HMAC-SHA256. Read a secret from the environment inside krantho.config.ts, for example secret: process.env.KRANTHO_WEBHOOK_SECRET. Deliveries are logged and retried automatically on SQLite and Postgres; on the filesystem adapter there is no log, so deliveries are fire-and-forget.',
  },

  // --- tools ---
  {
    path: 'tools.concurrency',
    kind: 'int',
    env: 'CLAUDE_CONCURRENCY',
    description: 'Parallel model calls made by the build-time pipeline.',
  },
  {
    path: 'tools.enrich.serviceCap',
    kind: 'int',
    description: 'Characters of a service document sent to the model.',
  },
  {
    path: 'tools.enrich.llmsDescriptionCap',
    kind: 'int',
    description: 'Longest generated llms.txt link description.',
  },
  {
    path: 'tools.enrich.faqMinPerRoute',
    kind: 'int',
    description: 'FAQ entries a route must have before it is considered complete.',
  },
  {
    path: 'tools.enrich.skipFields',
    kind: 'list',
    description:
      "Frontmatter fields left out of the text the enrichment tools send to the model. A trailing `*` matches every field with that prefix. Site-specific fields belong in the project's own krantho.config.ts.",
  },
]

/** Look a leaf up by its dotted path */
export function leafByPath(path: string): LeafSpec | undefined {
  return LEAVES.find((leaf) => leaf.path === path)
}

/** Dotted paths of every secret leaf */
export const SECRET_PATHS: readonly string[] = LEAVES.filter((leaf) => leaf.secret).map(
  (leaf) => leaf.path,
)
