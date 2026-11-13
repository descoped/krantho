import type { AuthMode, KranthoConfig, WebhookTarget } from '@krantho/config'
import type { IContentEngine } from '@krantho/core'
import type { ContentDocument, IAuthAdapter, IPersistenceAdapter, Role } from '@krantho/persistence'
import type { ContentConfig, PageDefinition } from '@krantho/schema'

/** Framework-agnostic HTTP request */
export interface ApiRequest {
  method: string
  path: string
  params: Record<string, string>
  query: Record<string, string>
  body?: unknown | undefined
  headers?: Record<string, string> | undefined
  rawRequest?: Request | undefined
  files?: Array<{ name: string; data: Uint8Array; filename: string; mimeType: string }> | undefined
}

/**
 * How the host shows an editor a draft on the site: `draft-mode` — the host
 * turns the API's answer into its own preview mode (Next.js draft mode);
 * `signed-url` — the API sends the editor to the page with a short-lived
 * signed token the page's server verifies
 */
export type SitePreviewMode = 'draft-mode' | 'signed-url'

/** The server package hosting the API: `@krantho/server-next`, `-sveltekit` or `-node` */
export type ServerFramework = 'next' | 'sveltekit' | 'node'

/** Framework-agnostic HTTP response */
export interface ApiResponse {
  status: number
  /** JSON by default; a string or bytes as is; a `ReadableStream<Uint8Array>` is streamed to the client as is */
  body: unknown
  headers?: Record<string, string> | undefined
  /** Set-Cookie values — one per cookie, emitted as separate header lines (RFC 6265). */
  cookies?: readonly string[] | undefined
}

/** Handler function signature */
export type ApiHandler = (req: ApiRequest, ctx: ApiContext) => Promise<ApiResponse>

/** Webhook configuration: the `webhooks` entries of the configuration tree, or wiring passed to `createApiHandlers` */
export type WebhookConfig = WebhookTarget

/** Shared context passed to all handlers */
export interface ApiContext {
  contentConfig: ContentConfig
  /** The resolved configuration tree — the only place a handler reads settings from */
  config: KranthoConfig
  adapter: IPersistenceAdapter
  engine: IContentEngine
  auth?: AuthenticatedUser | undefined
  pages?: readonly PageDefinition[] | undefined
  /** Fire webhook callback after content mutations */
  fireWebhook?: ((event: string, collection: string, slug: string) => void) | undefined
  /** The configured webhooks: a retried delivery is sent to the one with its URL, signed with its secret */
  webhooks?: readonly WebhookConfig[] | undefined
  /** Lifecycle hooks */
  contentHooks?: import('./hooks.js').ContentHooks | undefined
  /** Told about every committed write (see `announceChange`) */
  changeListeners?: readonly import('@krantho/core').ContentChangeListener[] | undefined
  /** Keeps a background job running until it settles (see `CreateApiHandlersConfig.waitUntil`) */
  waitUntil?: ((work: Promise<unknown>) => void) | undefined
  /** Media storage adapter */
  mediaStorage?: import('@krantho/persistence').IMediaStorage | undefined
  /** Media folder storage adapter */
  mediaFolderStorage?: import('@krantho/persistence').IMediaFolderStorage | undefined
  /** The file store's display name (e.g. 'Local disk', 'Vercel Blob') */
  mediaStorageLabel?: string | undefined
  /** The file store's directory or bucket, when it has one */
  mediaStoragePath?: string | undefined
  /** Image optimizer instance */
  imageOptimizer?: import('./image-optimizer.js').ImageOptimizer | undefined
  /** Image variant cache */
  imageCache?: import('./image-cache.js').ImageCache | undefined
  /** Checkpoint adapter for backup/restore operations */
  checkpointAdapter?: import('@krantho/persistence').ICheckpointAdapter | undefined
  /** Current schema version from migration runner */
  schemaVersion?: number | undefined
  /** Persistence adapter type */
  persistenceType?: 'filesystem' | 'sqlite' | 'postgres' | undefined
  /** How the host renders drafts for editors on the site (see `CreateApiHandlersConfig.sitePreview`) */
  sitePreview?: SitePreviewMode | undefined
  /** The server package hosting the API (see `CreateApiHandlersConfig.framework`) */
  framework?: ServerFramework | undefined
  /** Content migration adapter for conflict resolution */
  contentMigrationAdapter?: import('@krantho/persistence').IContentMigrationAdapter | undefined
  /** Auth adapter for user/token operations */
  authAdapter?: IAuthAdapter | undefined
  /** Advisory lock adapter */
  lockAdapter?: import('@krantho/persistence').ILockAdapter | undefined
  /** Webhook delivery log adapter */
  webhookDeliveryAdapter?: import('@krantho/persistence').IWebhookDeliveryAdapter | undefined
  /** Version retention adapter */
  retentionAdapter?: import('@krantho/persistence').IRetentionAdapter | undefined
  /** Site settings adapter */
  siteSettingsAdapter?: import('@krantho/persistence').ISiteSettingsAdapter | undefined
  /** Vault that seals the secrets stored in site settings; none means a site stores none */
  secrets?: import('@krantho/persistence').ISecretVault | undefined
  /** SEO configuration adapter */
  seoConfigAdapter?: import('@krantho/persistence').ISeoConfigAdapter | undefined
  /** The page cache the site's instances share, when `cache.shared` is `database` */
  pageCacheStore?: import('@krantho/persistence').IPageCacheStore | undefined
}

/** Authenticated user attached to request context */
export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  roles: Role[]
  mode: AuthMode
}

/** Content item response shape — mirrors ContentDocument from persistence */
export type ContentItemResponse = ContentDocument

/** Error response shape */
export interface ErrorResponse {
  error: string
  details?: unknown | undefined
}

/** Media wiring: metadata and folders from the persistence, bytes from the file store */
export interface MediaConfig {
  metadata: import('@krantho/persistence').IMediaMetadataAdapter
  folders: import('@krantho/persistence').IMediaFolderStorage
  files: import('@krantho/persistence').IFileStore
}

/** Check if adapter supports version history (append-only adapters do) */
export function hasVersioning(adapter: unknown): boolean {
  const a = adapter as Record<string, unknown>
  return typeof a.listVersions === 'function' && typeof a.getVersion === 'function'
}
