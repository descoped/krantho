import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  ContentHooks,
  CreateApiHandlersConfig,
  KranthoPlugin,
  ServerFramework,
  SitePreviewMode,
} from '@krantho/api'
import { createApiHandlers, deliverChange, startSeo } from '@krantho/api'
import type { KranthoConfig, KranthoConfigInput } from '@krantho/config'
import { productionWarnings } from '@krantho/config'
import { loadConfig } from '@krantho/config/node'
import type { ContentChange, ContentChangeListener } from '@krantho/core'
import { ContentEngineFactory } from '@krantho/core'
import type { IWebhookDeliveryAdapter } from '@krantho/persistence'
import type { ContentConfigInput, PageDefinition } from '@krantho/schema'
import { defineConfig } from '@krantho/schema'
import { createCdnInvalidator } from './cdn/index.js'
import { cdnChangeListener } from './cdn/listener.js'
import { claimContentAnnouncement, importRepositoryContent } from './content-migration.js'
import { toApiRequest, toResponse } from './convert.js'
import { createFileStore } from './file-store.js'
import type { ImportableAdapter } from './import.js'
import { changedUrlsFor, indexNowChangeListener } from './indexnow.js'
import { seedLlmConfig, shouldSeedLlm } from './llm-seed.js'
import type { LockAdapterResult } from './lock-adapters.js'
import { createLockAdapters } from './lock-adapters.js'
import { createAdapter } from './persistence.js'
import { createSecretVault } from './secret-vault.js'
import { seedSeoOnce } from './seo-seed.js'
import { createWebhookSweep } from './webhook-sweep.js'

/**
 * What a host application hands krantho: one configuration object and the
 * wiring that cannot be expressed as data.
 */
export interface KranthoHandlerOptions {
  /** The object `defineKranthoConfig()` returned. Resolved here, once. */
  config: KranthoConfigInput
  /** Collections from `defineCollection()`, keyed by collection name */
  collections: ContentConfigInput['collections']
  /** Page definitions from `definePage()` — enables resolvePageRoute */
  pages?: readonly PageDefinition[] | undefined
  /** Plugins contributing routes, hooks and field types */
  plugins?: KranthoPlugin[] | undefined
  /** Lifecycle hooks */
  hooks?: ContentHooks | undefined
  /**
   * Told about every committed write — through the API, the startup content
   * import or the file watcher — so the host can refresh what it caches.
   */
  onContentChange?: ContentChangeListener | undefined
  /**
   * Keep work that outlives a request — a background job — running until it
   * settles, on hosts that end a request's work with its response
   */
  waitUntil?: ((work: Promise<unknown>) => void) | undefined
  /**
   * How the host renders drafts for editors on the site: enables
   * `GET /api/preview`. `signed-url` pages verify with `verifyPreviewRequest()`.
   */
  sitePreview?: SitePreviewMode | undefined
  /**
   * The server package hosting the handler, reported by `GET /api/capabilities`.
   * Each server package sets it when it creates the handler.
   */
  framework?: ServerFramework | undefined
}

/** A handler that processes Web Requests via the krantho API */
export interface KranthoHandler {
  /** Handle a Web Request and return a Web Response */
  handle(request: Request): Promise<Response>
  /** Stop the file watcher and release resources */
  close(): void
}

/**
 * Create a krantho server handler.
 *
 * Resolves the configuration once — defaults, then the developer's code, then
 * the environment — then initializes the persistence adapter, the content
 * engine and the API handlers from the resolved tree. The returned handler
 * converts Web Requests to ApiRequests, dispatches them through the API
 * router, and returns Web Responses.
 *
 * Call this once at module level — the handler is designed to be reused
 * across requests (important for serverless environments).
 */
export async function createKranthoHandler(
  options: KranthoHandlerOptions,
): Promise<KranthoHandler> {
  const config = loadConfig({ code: options.config, env: process.env })
  for (const warning of productionWarnings(config, process.env['NODE_ENV'])) {
    console.warn(`[krantho] WARNING: ${warning}`)
  }
  await startSeo(config)
  const contentConfig = defineConfig({ collections: options.collections })

  if (config.persistence.provider === 'sqlite') {
    await mkdir(dirname(config.persistence.sqlite.path), { recursive: true })
  }

  const {
    adapter,
    checkpointAdapter,
    contentMigrationAdapter,
    authAdapter,
    lockDb,
    schemaVersion,
  } = await createAdapter(
    config.persistence,
    config.site,
    config.content,
    contentConfig.collections,
  )

  // Import repository content: new and changed files when the content manifest is newer, or every file into an empty database
  const importedAtStartup = await importRepositoryContent(
    adapter,
    contentConfig,
    contentMigrationAdapter,
    checkpointAdapter,
    config.paths.contentDir,
    config.content.defaultStatus.filesystem,
  )

  const engine = ContentEngineFactory.create(adapter, {
    cacheEnabled: config.content.cache.enabled,
    cacheTTL: config.content.cache.ttlMs,
    maxCacheSize: config.content.cache.maxEntries,
    enableAtNotation: config.content.atNotation,
  })

  // IndexNow lists the sitemap through the API, which is created below
  let listSitemap: () => Promise<readonly string[]> = async () => []
  const indexNow = indexNowChangeListener(
    config,
    process.env['NODE_ENV'],
    changedUrlsFor(config.site.baseUrl, Object.fromEntries(contentConfig.collections), () =>
      listSitemap(),
    ),
    options.waitUntil,
  )
  const onContentChange = withPublishers(
    options.onContentChange,
    config,
    options.waitUntil,
    indexNow,
  )
  const changeListeners = onContentChange ? [onContentChange] : undefined
  const notifyChange = (change: ContentChange): Promise<void> =>
    deliverChange(engine, changeListeners, change)

  // Create lock, webhook delivery, settings, SEO and media adapters from the DB handle
  const adapters = await createLockAdapters(lockDb, config.persistence.provider)
  const {
    lockAdapter,
    webhookDeliveryAdapter,
    retentionAdapter,
    siteSettingsAdapter,
    seoConfigAdapter,
    pageCacheStore,
  } = adapters
  const media = await buildMedia(config, adapters)

  // Seed SEO config from the seo section before serving (once per process, shared with the content loader)
  if (seoConfigAdapter) await seedSeoOnce(config, seoConfigAdapter)

  // Seed LLM config from developer-defined defaults (idempotent — Studio overrides preserved)
  if (shouldSeedLlm(options.config, config) && siteSettingsAdapter) {
    await seedLlmConfig(config, siteSettingsAdapter)
  }

  const apiConfig: CreateApiHandlersConfig = {
    contentConfig,
    config,
    adapter,
    engine,
    pages: options.pages,
    plugins: options.plugins,
    hooks: options.hooks,
    onContentChange,
    waitUntil: options.waitUntil,
    sitePreview: options.sitePreview,
    framework: options.framework,
    webhooks: config.webhooks,
    media,
    checkpoints: checkpointAdapter,
    contentMigration: contentMigrationAdapter,
    authAdapter,
    schemaVersion,
    persistenceType: config.persistence.provider,
    lockAdapter,
    webhookDeliveryAdapter,
    retentionAdapter,
    siteSettingsAdapter,
    secrets: await createSecretVault(config),
    seoConfigAdapter,
    pageCacheStore: config.cache.shared === 'database' ? pageCacheStore : undefined,
  }
  const api = createApiHandlers(apiConfig)
  // Watched repository edits use the same hooks, locks and draft saves as Studio.
  let stopWatcher: (() => void) | undefined
  if (config.content.watch && 'upsertFromFile' in adapter) {
    const { startFileWatcher } = await import('./file-watcher.js')
    stopWatcher = await startFileWatcher({
      contentConfig,
      adapter: adapter as ImportableAdapter,
      saveDocument: api.saveRepositoryDocument,
    })
  }
  const sweepWebhooks = webhookSweep(config, webhookDeliveryAdapter, options.waitUntil)
  listSitemap = () => sitemapLocations(api)
  // Announce imported content once, also when the page loader imported it first
  const newContent = await claimContentAnnouncement(contentMigrationAdapter, siteSettingsAdapter)
  if (importedAtStartup > 0 || newContent) await notifyChange({ kind: 'site' })

  return {
    async handle(request: Request): Promise<Response> {
      try {
        sweepWebhooks?.()
        const apiRequest = await toApiRequest(request)
        const apiResponse = await api.handle(apiRequest)
        return toResponse(apiResponse)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error'
        return toResponse({ status: 500, body: { error: message } })
      }
    },
    close(): void {
      if (stopWatcher) stopWatcher()
    },
  }
}

/** The retry sweep for failed webhook deliveries: only when webhooks are configured and their delivery log exists */
function webhookSweep(
  config: KranthoConfig,
  deliveries: IWebhookDeliveryAdapter | undefined,
  waitUntil: ((work: Promise<unknown>) => void) | undefined,
): (() => void) | undefined {
  if (config.webhooks.length === 0 || deliveries === undefined) return undefined
  return createWebhookSweep({ webhooks: config.webhooks, deliveries, waitUntil })
}

/**
 * The host's change listener, followed by what the site publishes a change to:
 * the CDN purge when a CDN is configured, then IndexNow when its key is set.
 * Each runs even when one before it throws.
 */
function withPublishers(
  host: ContentChangeListener | undefined,
  config: KranthoConfig,
  waitUntil: ((work: Promise<unknown>) => void) | undefined,
  indexNow: ContentChangeListener | null,
): ContentChangeListener | undefined {
  const invalidator = createCdnInvalidator(config.cache)
  const purge = invalidator ? cdnChangeListener(config.cache, invalidator, waitUntil) : null
  const listeners = [host, purge, indexNow].filter((listener): listener is ContentChangeListener =>
    Boolean(listener),
  )
  if (listeners.length <= 1) return listeners[0]
  return async (change) => {
    const errors: unknown[] = []
    for (const listener of listeners) {
      try {
        await listener(change)
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) throw errors[0]
  }
}

/** Every page the sitemap lists, read through the site's own API */
async function sitemapLocations(api: ReturnType<typeof createApiHandlers>): Promise<string[]> {
  const response = await api.handle({
    method: 'GET',
    path: '/api/seo/sitemap.json',
    params: {},
    query: {},
  })
  const body: unknown = response.body
  if (response.status !== 200 || typeof body !== 'object' || body === null) return []
  const urls: unknown = 'urls' in body ? body.urls : undefined
  if (!Array.isArray(urls)) return []
  return urls.flatMap((url: unknown) =>
    typeof url === 'object' && url !== null && 'loc' in url && typeof url.loc === 'string'
      ? [url.loc]
      : [],
  )
}

/**
 * Media is on exactly when `media.provider` is set: metadata and folders from
 * the database, bytes from the selected file store.
 */
async function buildMedia(
  config: KranthoConfig,
  adapters: LockAdapterResult,
): Promise<CreateApiHandlersConfig['media']> {
  if (config.media.provider === undefined) return undefined
  const { mediaAdapter, mediaFolderAdapter } = adapters
  if (!mediaAdapter || !mediaFolderAdapter) {
    throw new Error('media.provider is set, but this database provides no media adapter')
  }
  return {
    metadata: mediaAdapter,
    folders: mediaFolderAdapter,
    files: await createFileStore(config.media),
  }
}
