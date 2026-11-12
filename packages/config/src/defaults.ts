import type { KranthoConfigInput } from './types.js'

/**
 * Every default in the tree, in one place.
 *
 * Each value reproduces what the code did before the tree existed, so a site
 * that sets nothing behaves exactly as it did. `site.domain`, `site.name`,
 * `site.language` and `site.baseUrl` have no default — they identify the site
 * and must come from code or the environment. `media.provider` has no default:
 * media is off until a file store is chosen. `site.supportedLocales`,
 * `site.defaultLocale`, `paths.seoGeneratedDir`, `persistence.sqlite.path`,
 * `persistence.filesystem.contentPath`, `media.s3.publicUrl` and
 * `media.gcs.publicUrl` are derived from other leaves; see `derive.ts`.
 */
export const DEFAULTS: KranthoConfigInput = {
  site: { sameAs: [] },
  paths: {
    dataDir: '.krantho',
    contentDir: 'content',
  },
  persistence: {
    provider: 'sqlite',
    sqlite: { busyTimeoutMs: 10000, walRetries: 10, walRetryDelayMs: 50 },
    postgres: {},
    filesystem: {},
  },
  content: {
    cache: { enabled: true, ttlMs: 300000, maxEntries: 100 },
    atNotation: true,
    watch: false,
    defaultStatus: { filesystem: 'published' },
    list: {},
    search: { minQueryLength: 2, defaultLimit: 200, maxLimit: 500 },
    versions: { keep: 10 },
    lock: { leaseMs: 300000 },
  },
  cache: {
    pages: 'none',
    cdn: {
      provider: 'none',
      sMaxAgeSec: 86400,
      staleWhileRevalidateSec: 604800,
      tagHeader: 'x-krantho-cache-tag',
      cloudfront: {},
      gcp: {},
    },
    shared: 'none',
  },
  auth: {
    mode: 'none',
    requireAuthForReads: false,
    token: { email: 'admin@local', role: 'admin' },
    oidc: {
      postLogoutUri: '/studio/',
      scopes: ['openid', 'email', 'profile'],
      signup: 'closed',
      studioEntry: 'login',
      adminEmails: [],
      newUserRole: 'viewer',
    },
    workload: { subjects: [] },
    session: {
      accessTtlSec: 900,
      refreshTtlSec: 2592000,
      cookiePrefix: 'krantho',
      secure: 'auto',
      sameSite: 'lax',
    },
    trustProxy: false,
  },
  secrets: { provider: 'local', local: {} },
  media: {
    local: { dir: 'public/uploads', urlPrefix: '/uploads' },
    vercelBlob: {},
    s3: { forcePathStyle: false },
    gcs: {},
    maxFileSize: 10485760,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/avif',
      'image/svg+xml',
    ],
    image: {
      maxWidth: 2048,
      quality: { jpeg: 82, webp: 80, avif: 65, normalize: 85 },
      presets: { xs: 48, sm: 96, md: 256, lg: 512, xl: 1024, full: null },
      cache: { maxEntries: 1000, maxMb: 256, ttiSec: 3600 },
    },
  },
  llm: {
    provider: 'anthropic',
    anthropic: {},
    openai: {},
    gemini: {},
    openrouter: {},
    claudeCode: {},
    profiles: {},
  },
  assistant: {
    enabled: false,
    role: 'editor',
    confirmTtlSec: 600,
    limits: {
      maxTurns: 8,
      maxToolCalls: 16,
      maxTokens: 16000,
      maxRequestTokens: 200000,
      maxHistoryMessages: 40,
      maxInputChars: 60000,
      toolResultChars: 12000,
    },
  },
  seo: {
    collections: {},
    routes: {},
    richCollections: {},
    richRoutes: {},
    seedMode: 'seed',
    readers: ['google', 'bing'],
    indexNow: {},
    enrichment: {
      meta: { minChars: 120, maxChars: 155, contentCap: 2000, maxTokens: 1024 },
      title: { maxChars: 70 },
      archetype: { contentCap: 3000, maxTokens: 2048 },
    },
  },
  webhooks: [],
  tools: {
    concurrency: 5,
    enrich: {
      serviceCap: 1500,
      llmsDescriptionCap: 300,
      faqMinPerRoute: 5,
      // The kinds of field every site has: descriptions, navigation, footer, forms.
      // A site's own field names are added in its krantho.config.ts.
      skipFields: [
        'description',
        'meta-description',
        'meta-description-*',
        'nav-*',
        'footer-*',
        'form-*',
      ],
    },
  },
}
