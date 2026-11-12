/**
 * The resolved krantho configuration tree.
 *
 * Every leaf has a value after {@link resolveConfig} runs — optional leaves are
 * the ones that are genuinely absent by default (a secret nobody set, a limit
 * nobody imposed). Defaults reproduce the values the code used before the tree
 * existed.
 */

import type { LlmProviderName } from './llm-providers.js'
import type { WEBHOOK_EVENTS } from './webhook-events.js'

/** Persistence backend selector */
export type PersistenceProvider = 'sqlite' | 'postgres' | 'filesystem'

/**
 * How rendered pages are cached: `none` renders every request; `next-isr`
 * keeps each Next.js page until a content change invalidates it; `cdn` sends
 * CDN cache headers with each page and purges the CDN when content changes
 */
export type PageCacheStrategy = 'none' | 'next-isr' | 'cdn'

/** The CDN in front of the site, purged when content changes — `none` purges nothing */
export type CacheCdnProvider = 'none' | 'vercel' | 'cloudfront' | 'gcp'

/** Where Next.js keeps its cache: `none` per instance, `database` shared through persistence */
export type SharedCacheStrategy = 'none' | 'database'

/** Authentication mode */
export type AuthMode = 'none' | 'token' | 'oidc'

/** Whether OIDC first-time logins create a user */
export type SignupMode = 'open' | 'closed'
/** How /studio treats a visitor without a session */
export type StudioEntry = 'login' | 'redirect'

/** Cookie `Secure` policy — `auto` derives it from the request protocol */
export type CookieSecurePolicy = 'auto' | 'always' | 'never'

/** Cookie `SameSite` policy */
export type CookieSameSite = 'lax' | 'strict' | 'none'

/** SEO seed behaviour — `seed` preserves existing rows, `overwrite` replaces them */
export type SeedMode = 'seed' | 'overwrite'

/** A Schema.org entity with its properties, as stored in the SEO config */
export interface SeoEntityConfig {
  '@type': string
  '@id'?: string | undefined
  role?: string | undefined
  properties: Record<string, unknown>
}

/** Rich SEO configuration for one scope (site, collection or route) */
export interface SeoScopeConfig {
  entities: SeoEntityConfig[]
  fieldMappings?: Record<string, string> | undefined
  /** The page structure the scope's pages get when their template states none */
  structure?: SeoStructureConfig | undefined
}

/** A scope's page structure: the trail above its pages, root first, and their kind */
export interface SeoStructureConfig {
  trail?: Array<{ name: string; url?: string | undefined }> | undefined
  kind?: string | undefined
}

/** The SEO definition files of `seo.configDir`, parsed and checked */
export interface SeoDefinitions {
  site: SeoScopeConfig | null
  /** Keyed by collection name */
  collections: Record<string, SeoScopeConfig>
  /** Keyed by URL pattern */
  routes: Record<string, SeoScopeConfig>
}

/** Site identity — the only section that must be supplied */
export interface SiteSection {
  domain: string
  name: string
  language: string
  baseUrl: string
  supportedLocales: string[]
  defaultLocale: string
  /** The site's or its organization's logo, an absolute URL */
  logo?: string | undefined
  /** What the site or its organization is, in a sentence */
  description?: string | undefined
  /** Another name the site or organization is known by */
  alternateName?: string | undefined
  /** Profile pages that identify the organization — social, registry, code hosting */
  sameAs: string[]
}

/** Filesystem and URL locations */
export interface PathsSection {
  dataDir: string
  contentDir: string
  seoGeneratedDir: string
}

export interface SqlitePersistenceSection {
  path: string
  busyTimeoutMs: number
  walRetries: number
  walRetryDelayMs: number
}

export interface PostgresPersistenceSection {
  url?: string | undefined
  maxConnections?: number | undefined
  prepare?: boolean | undefined
  idleTimeoutSec?: number | undefined
}

export interface FilesystemPersistenceSection {
  contentPath: string
}

export interface PersistenceSection {
  provider: PersistenceProvider
  sqlite: SqlitePersistenceSection
  postgres: PostgresPersistenceSection
  filesystem: FilesystemPersistenceSection
}

export interface ContentSection {
  cache: { enabled: boolean; ttlMs: number; maxEntries: number }
  atNotation: boolean
  watch: boolean
  defaultStatus: { filesystem: string }
  list: { maxLimit?: number | undefined }
  search: { minQueryLength: number; defaultLimit: number; maxLimit: number }
  versions: { keep: number }
  lock: { leaseMs: number }
}

export interface CdnSection {
  provider: CacheCdnProvider
  sMaxAgeSec: number
  staleWhileRevalidateSec: number
  /** Response header carrying the cache tags — CloudFront only */
  tagHeader: string
  cloudfront: { distributionId?: string | undefined }
  gcp: {
    project?: string | undefined
    urlMap?: string | undefined
    accessToken?: string | undefined
  }
}

export interface CacheSection {
  pages: PageCacheStrategy
  cdn: CdnSection
  shared: SharedCacheStrategy
}

export interface AuthSection {
  mode: AuthMode
  requireAuthForReads: boolean
  token: { secret?: string | undefined; email: string; role: string }
  jwtSecret?: string | undefined
  oidc: {
    issuer?: string | undefined
    clientId?: string | undefined
    clientSecret?: string | undefined
    redirectUri?: string | undefined
    postLogoutUri: string
    scopes: string[]
    signup: SignupMode
    studioEntry: StudioEntry
    adminEmails: string[]
    newUserRole: string
  }
  /** A CI platform's workload identity: all three leaves set turns it on, none leaves it off */
  workload: {
    issuer?: string | undefined
    audience?: string | undefined
    subjects: string[]
  }
  session: {
    accessTtlSec: number
    refreshTtlSec: number
    cookiePrefix: string
    secure: CookieSecurePolicy
    sameSite: CookieSameSite
  }
  trustProxy: boolean
}

/** Where media file bytes are stored; unset means media is off */
export type MediaProvider = 'local' | 'vercel-blob' | 's3' | 'gcs'

/** Local-disk file store */
export interface LocalMediaSection {
  /** Directory files are written to; the host framework serves it at `urlPrefix` */
  dir: string
  urlPrefix: string
}

/** Vercel Blob file store */
export interface VercelBlobMediaSection {
  token?: string | undefined
}

/** S3-compatible file store */
export interface S3MediaSection {
  bucket?: string | undefined
  region?: string | undefined
  endpoint?: string | undefined
  forcePathStyle: boolean
  publicUrl?: string | undefined
  accessKeyId?: string | undefined
  secretAccessKey?: string | undefined
}

/** Google Cloud Storage file store */
export interface GcsMediaSection {
  bucket?: string | undefined
  publicUrl?: string | undefined
  /** Service-account key JSON; unset uses the metadata server */
  credentials?: string | undefined
}

export interface MediaSection {
  provider?: MediaProvider | undefined
  local: LocalMediaSection
  vercelBlob: VercelBlobMediaSection
  s3: S3MediaSection
  gcs: GcsMediaSection
  maxFileSize: number
  allowedMimeTypes: string[]
  image: {
    maxWidth: number
    quality: { jpeg: number; webp: number; avif: number; normalize: number }
    presets: Record<string, number | null>
    cache: { maxEntries: number; maxMb: number; ttiSec: number }
  }
}

/** Where secrets the site stores (a pasted LLM key) are encrypted: the vault that holds the key */
export type SecretsProvider = 'local'

/** Vault that encrypts the secrets a site stores in its database */
export interface SecretsSection {
  provider: SecretsProvider
  local: {
    /** Key the local vault derives its encryption key from; unset falls back to `auth.jwtSecret` */
    key?: string | undefined
  }
}

export interface LlmSection {
  provider: string
  model?: string | undefined
  baseUrl?: string | undefined
  /** One credential per provider; ollama needs none */
  anthropic: { apiKey?: string | undefined }
  openai: { apiKey?: string | undefined }
  gemini: { apiKey?: string | undefined }
  openrouter: { apiKey?: string | undefined }
  /** Claude subscription token for the `claude-code` provider — development only, never stored */
  claudeCode: { authToken?: string | undefined }
  /** Per-model request settings over the defaults, by model id */
  profiles: Record<string, LlmModelProfile>
}

/** How requests to one model are shaped, over the default for that model */
export interface LlmModelProfile {
  /** `reasoning_effort` to ask for, or `default` to leave it to the model; not read by the Anthropic providers */
  reasoningEffort?: 'default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | undefined
  /** Output tokens added to a request's cap for the thinking a model does before it answers */
  reasoningHeadroom?: number | undefined
  /** Sampling temperature to send; unset sends none */
  temperature?: number | undefined
}

/** The lowest role that may use the Studio assistant */
export type AssistantRole = 'admin' | 'editor' | 'viewer'

/** The Studio assistant — off unless enabled */
export interface AssistantSection {
  enabled: boolean
  /** Provider for the assistant, with that provider's own credential; unset uses the provider in Setup › AI provider */
  provider?: LlmProviderName | undefined
  /** Model for the assistant; unset uses the model in Setup › AI provider, or the provider's default when `provider` is set */
  model?: string | undefined
  /** The lowest role that may use the assistant */
  role: AssistantRole
  /** How long a proposed action can be confirmed, in seconds */
  confirmTtlSec: number
  limits: {
    /** Model calls per chat request */
    maxTurns: number
    /** Tool executions per chat request */
    maxToolCalls: number
    /** Output token cap per model call */
    maxTokens: number
    /** Input plus output tokens across all model calls of one chat request */
    maxRequestTokens: number
    /** Conversation messages accepted from the client */
    maxHistoryMessages: number
    /** Characters accepted from the client across the conversation */
    maxInputChars: number
    /** Characters of one tool result sent to the model */
    toolResultChars: number
  }
}

export interface SeoSection {
  identity?: string | undefined
  collections: Record<string, string[]>
  routes: Record<string, string[]>
  site?: SeoScopeConfig | undefined
  richCollections: Record<string, SeoScopeConfig>
  richRoutes: Record<string, SeoScopeConfig>
  seedMode: SeedMode
  /** Readers whose published rules the structured data is checked against, by profile id */
  readers: string[]
  configDir?: string | undefined
  /**
   * The definition files of `configDir`. Read by `loadConfig` from
   * `@krantho/config/node`; empty from the pure `resolveConfig`, which reads
   * no files.
   */
  definitions: SeoDefinitions
  /** IndexNow (Bing and other participating engines): the site's key, served at `/<key>.txt` */
  indexNow: { key?: string | undefined }
  enrichment: {
    meta: { minChars: number; maxChars: number; contentCap: number; maxTokens: number }
    title: { maxChars: number }
    archetype: { contentCap: number; maxTokens: number }
  }
}

/** A content event a webhook can subscribe to */
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

/** One outgoing webhook: where to POST, for which events, and how to sign it */
export interface WebhookTarget {
  /** Absolute http(s) URL the payload is POSTed to */
  url: string
  /** Events that trigger the webhook; at least one */
  events: WebhookEvent[]
  /** Signs each delivery with HMAC-SHA256 in the `X-Webhook-Signature` header */
  secret?: string | undefined
}

export interface ToolsSection {
  concurrency: number
  enrich: {
    serviceCap: number
    llmsDescriptionCap: number
    faqMinPerRoute: number
    /** Frontmatter fields left out of the text sent to the model; a trailing `*` matches a prefix */
    skipFields: string[]
  }
}

/** The configuration sections, without the resolution metadata */
export interface KranthoConfigTree {
  site: SiteSection
  paths: PathsSection
  persistence: PersistenceSection
  content: ContentSection
  cache: CacheSection
  auth: AuthSection
  media: MediaSection
  secrets: SecretsSection
  llm: LlmSection
  assistant: AssistantSection
  seo: SeoSection
  webhooks: WebhookTarget[]
  tools: ToolsSection
}

/** Recursively optional view of a type — arrays and primitives are kept whole */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> | undefined }
    : T

/** What a developer writes in `krantho.config.ts` */
export type KranthoConfigInput = DeepPartial<KranthoConfigTree>

/** Where a resolved leaf's value came from */
export type ConfigSource = 'default' | 'code' | 'env' | 'file'

/** Dotted leaf path to the layer that supplied its value */
export type ConfigSources = ReadonlyMap<string, ConfigSource>

/**
 * The resolved configuration tree handed to the server and the tools.
 *
 * `sources` records which layer supplied each leaf, so a settings screen can
 * say whether a value came from the environment, from code, or from the
 * shipped default.
 */
export interface KranthoConfig extends KranthoConfigTree {
  readonly sources: ConfigSources
}

/** Only the server may hold secret leaves — the browser gets `PublicConfig` */
export type ServerConfig = KranthoConfig
