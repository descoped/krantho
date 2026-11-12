import type { AuthSection, KranthoConfig, WebhookEvent } from '@krantho/config'
import type { ContentChangeListener, IContentEngine } from '@krantho/core'
import type {
  IAuthAdapter,
  ICheckpointAdapter,
  IContentMigrationAdapter,
  ILockAdapter,
  IPageCacheStore,
  IPersistenceAdapter,
  IRetentionAdapter,
  ISecretVault,
  ISiteSettingsAdapter,
  IWebhookDeliveryAdapter,
} from '@krantho/persistence'
import type { ContentConfig, PageDefinition } from '@krantho/schema'
import { registerAssistantRoutes } from './assistant/routes.js'
import { applyDocumentDefaults } from './handlers/apply-metadata-defaults.js'
import {
  acquireLock,
  authCallback,
  authCapabilities,
  authLogin,
  authLogout,
  authMe,
  authOidcLogin,
  authRefresh,
  authRefreshRedirect,
  bulkDelete,
  bulkPublish,
  capabilities,
  checkLock,
  contentChanges,
  createContent,
  deleteAllSeoConfigs,
  deleteContent,
  deleteLLMSettings,
  deleteRuntimeField,
  deleteSeoConfig,
  exportBundle,
  exportContent,
  exportSchema,
  getContent,
  getLLMSettings,
  getLocaleSettings,
  getRuntimeSchema,
  getSchema,
  getSeoConfig,
  getVersion,
  importBundle,
  importContent,
  listCollection,
  listCollections,
  listContent,
  listContentTree,
  listLocks,
  listVersions,
  mediaBulkDelete,
  mediaBulkUpdate,
  mediaDelete,
  mediaDuplicate,
  mediaFolderCreate,
  mediaFolderDelete,
  mediaFolderRename,
  mediaFolders,
  mediaGet,
  mediaImage,
  mediaImageInfo,
  mediaInfo,
  mediaList,
  mediaMove,
  mediaRegister,
  mediaReplace,
  mediaTags,
  mediaUpdate,
  mediaUpload,
  mediaUsage,
  mediaUsageBatch,
  migrationConflicts,
  migrationStatus,
  publishContent,
  publishImpact,
  releaseLock,
  resolveConflict,
  resolvePageRoute,
  restoreVersion,
  SEO_INDEXNOW_KEY_PATH,
  SEO_LLMS_TXT_PATH,
  SEO_ROBOTS_PATH,
  SEO_SITEMAP_JSON_PATH,
  SEO_SITEMAP_PATH,
  saveRuntimeField,
  saveSeoConfig,
  searchContent,
  seoCatalog,
  seoCollectionImpact,
  seoEnrich,
  seoEnrichStatus,
  seoFindings,
  seoGenerate,
  seoIndexNowKey,
  seoLlmsTxt,
  seoPreview,
  seoResolved,
  seoRobots,
  seoSiteFindings,
  seoSitemap,
  seoSitemapJson,
  seoStatus,
  seoStructuredData,
  siteConfigHandler,
  sitePreview,
  snapshotCreate,
  snapshotDelete,
  snapshotGet,
  snapshotList,
  snapshotRestore,
  testLLMConnection,
  translationStatus,
  updateContent,
  updateLLMSettings,
  updateLocaleSettings,
  userCreate,
  userDelete,
  userGet,
  userList,
  userPermissionsGet,
  userPermissionsSet,
  userUpdate,
  validateAll,
  versionPurge,
  versionStats,
  webhookDeliveries,
  webhookRetry,
} from './handlers/index.js'
import { deleteRuntimeMetadata, saveRuntimeMetadata } from './handlers/runtime-metadata.js'
import { answerHead } from './head.js'
import type { ContentHooks } from './hooks.js'
import { ImageCache } from './image-cache.js'
import { ImageOptimizer } from './image-optimizer.js'
import { resolveJwtSecret } from './jwt.js'
import { MediaLibrary } from './media-library.js'
import { checkAuth } from './middleware/auth.js'
import { createOpenApiDocsHandler, createOpenApiSpecHandler } from './openapi.js'
import { assertRole } from './permissions.js'
import type { KranthoPlugin } from './plugins.js'
import { mergeHooks } from './plugins.js'
import { ApiRouter } from './router.js'
import { type SaveDocumentInput, type SaveDocumentResult, saveDocument } from './save-document.js'
import type {
  ApiContext,
  ApiRequest,
  ApiResponse,
  MediaConfig,
  ServerFramework,
  SitePreviewMode,
  WebhookConfig,
} from './types.js'
import { fireWebhooks } from './webhooks.js'
import { checkWorkloadAuth } from './workload-identity.js'

export interface CreateApiHandlersConfig {
  contentConfig: ContentConfig
  /** The resolved configuration tree */
  config: KranthoConfig
  adapter: IPersistenceAdapter
  engine: IContentEngine
  pages?: readonly PageDefinition[] | undefined
  webhooks?: readonly WebhookConfig[] | undefined
  hooks?: ContentHooks | undefined
  /** Told about every committed write, inside the request that made it */
  onContentChange?: ContentChangeListener | undefined
  /**
   * Keep work that outlives a request — a background job — running until it
   * settles, on hosts that end a request's work with its response
   */
  waitUntil?: ((work: Promise<unknown>) => void) | undefined
  plugins?: KranthoPlugin[] | undefined
  /** Media metadata, folders and file store — enables the media routes */
  media?: MediaConfig | undefined
  /** Checkpoint adapter for backup/restore */
  checkpoints?: ICheckpointAdapter | undefined
  /** Content migration adapter for conflict resolution */
  contentMigration?: IContentMigrationAdapter | undefined
  /** Auth adapter for user/token operations */
  authAdapter?: IAuthAdapter | undefined
  /** Current schema version from migration runner */
  schemaVersion?: number | undefined
  /** Persistence adapter type for capabilities reporting */
  persistenceType?: 'filesystem' | 'sqlite' | 'postgres' | undefined
  /**
   * The host renders drafts for editors on the site itself: registers
   * `GET /api/preview`, answered as the mode says
   */
  sitePreview?: SitePreviewMode | undefined
  /** The server package hosting the API, reported by `GET /api/capabilities`; each server package sets it */
  framework?: ServerFramework | undefined
  /** Advisory lock adapter */
  lockAdapter?: ILockAdapter | undefined
  /** The page cache the site's instances share, when `cache.shared` is `database` */
  pageCacheStore?: IPageCacheStore | undefined
  /** Webhook delivery log adapter */
  webhookDeliveryAdapter?: IWebhookDeliveryAdapter | undefined
  /** Version retention adapter */
  retentionAdapter?: IRetentionAdapter | undefined
  /** Site settings adapter */
  siteSettingsAdapter?: ISiteSettingsAdapter | undefined
  /** Vault that seals the secrets stored in site settings; none means a site stores none */
  secrets?: ISecretVault | undefined
  /** SEO configuration adapter */
  seoConfigAdapter?: import('@krantho/persistence').ISeoConfigAdapter | undefined
}

export interface ApiHandlers {
  /** Trusted repository edits share validation, hooks, locks and draft publication with REST saves. */
  saveRepositoryDocument(input: Omit<SaveDocumentInput, 'changedBy'>): Promise<SaveDocumentResult>
  /** Handle any API request via route matching */
  handle(req: ApiRequest): Promise<ApiResponse>
  /** Direct access to individual handlers */
  listCollections: typeof listCollections
  listCollection: typeof listCollection
  listContent: typeof listContent
  listContentTree: typeof listContentTree
  getContent: typeof getContent
  createContent: typeof createContent
  updateContent: typeof updateContent
  deleteContent: typeof deleteContent
  publishContent: typeof publishContent
  getSchema: typeof getSchema
  listVersions: typeof listVersions
  getVersion: typeof getVersion
  restoreVersion: typeof restoreVersion
  validateAll: typeof validateAll
  resolvePageRoute: typeof resolvePageRoute
  searchContent: typeof searchContent
  bulkDelete: typeof bulkDelete
  bulkPublish: typeof bulkPublish
  siteConfigHandler: typeof siteConfigHandler
  seoStatus: typeof seoStatus
  seoStructuredData: typeof seoStructuredData
  seoPreview: typeof seoPreview
  seoSitemap: typeof seoSitemap
  seoRobots: typeof seoRobots
  seoGenerate: typeof seoGenerate
  getRuntimeSchema: typeof getRuntimeSchema
  saveRuntimeField: typeof saveRuntimeField
  deleteRuntimeField: typeof deleteRuntimeField
  exportSchema: typeof exportSchema
  exportContent: typeof exportContent
  importContent: typeof importContent
  mediaList: typeof mediaList
  mediaGet: typeof mediaGet
  mediaUpload: typeof mediaUpload
  mediaRegister: typeof mediaRegister
  mediaUpdate: typeof mediaUpdate
  mediaDelete: typeof mediaDelete
  mediaImage: typeof mediaImage
  mediaInfo: typeof mediaInfo
  mediaImageInfo: typeof mediaImageInfo
  snapshotList: typeof snapshotList
  snapshotCreate: typeof snapshotCreate
  snapshotGet: typeof snapshotGet
  snapshotRestore: typeof snapshotRestore
  snapshotDelete: typeof snapshotDelete
  migrationStatus: typeof migrationStatus
  migrationConflicts: typeof migrationConflicts
  resolveConflict: typeof resolveConflict
  capabilities: typeof capabilities
  acquireLock: typeof acquireLock
  releaseLock: typeof releaseLock
  checkLock: typeof checkLock
  listLocks: typeof listLocks
  publishImpact: typeof publishImpact
  contentChanges: typeof contentChanges
  exportBundle: typeof exportBundle
  importBundle: typeof importBundle
  webhookDeliveries: typeof webhookDeliveries
  webhookRetry: typeof webhookRetry
}

/**
 * Create the full API handler set with route matching.
 *
 * @example
 * ```ts
 * const api = createApiHandlers({ config, contentConfig, adapter, engine })
 * const response = await api.handle({ method: 'GET', path: '/api/content/blog', params: {}, query: {} })
 * ```
 */
function registerMediaRoutes(router: ApiRouter): void {
  router.add('GET', '/api/media/info', mediaInfo)
  router.add('GET', '/api/media', mediaList)
  router.add('POST', '/api/media/upload', mediaUpload)
  router.add('POST', '/api/media/register', mediaRegister)
  router.add('DELETE', '/api/media/bulk', mediaBulkDelete)
  router.add('PUT', '/api/media/bulk', mediaBulkUpdate)
  router.add('GET', '/api/media/folders', mediaFolders)
  router.add('POST', '/api/media/folders', mediaFolderCreate)
  router.add('PUT', '/api/media/folders/:id', mediaFolderRename)
  router.add('DELETE', '/api/media/folders/:id', mediaFolderDelete)
  router.add('GET', '/api/media/tags', mediaTags)
  router.add('GET', '/api/media/usage', mediaUsageBatch)
  router.add('GET', '/api/media/:id/image/info', mediaImageInfo)
  router.add('GET', '/api/media/:id/image', mediaImage)
  router.add('HEAD', '/api/media/:id/image', mediaImage)
  router.add('GET', '/api/media/:id/usage', mediaUsage)
  router.add('POST', '/api/media/:id/replace', mediaReplace)
  router.add('POST', '/api/media/:id/duplicate', mediaDuplicate)
  router.add('PUT', '/api/media/:id/move', mediaMove)
  router.add('GET', '/api/media/:id', mediaGet)
  router.add('PUT', '/api/media/:id', mediaUpdate)
  router.add('DELETE', '/api/media/:id', mediaDelete)
}

function registerContentRoutes(router: ApiRouter): void {
  // Search (must be before :collection routes)
  router.add('GET', '/api/content/search', searchContent)

  // Import/Export (must be before :slug wildcard routes)
  router.add('GET', '/api/changes', contentChanges)
  router.add('GET', '/api/export/bundle', exportBundle)
  router.add('POST', '/api/import/bundle', importBundle)
  router.add('GET', '/api/content/:collection/export', exportContent)
  router.add('POST', '/api/content/:collection/import', importContent)
  router.add('PUT', '/api/schema/:collection/groups', saveRuntimeMetadata)
  router.add('DELETE', '/api/schema/:collection/groups/:slot', deleteRuntimeMetadata)

  // Bulk operations (must be before :slug wildcard routes)
  router.add('DELETE', '/api/content/:collection/bulk', bulkDelete)
  router.add('POST', '/api/content/:collection/bulk-publish', bulkPublish)

  // Content CRUD
  router.add('GET', '/api/content-tree', listContentTree)
  router.add('GET', '/api/content', listContent)
  router.add('GET', '/api/content/:collection', listCollection)
  router.add('GET', '/api/content/:collection/:slug', getContent)
  router.add('POST', '/api/content/:collection', createContent)
  router.add('PUT', '/api/content/:collection/:slug', updateContent)
  router.add('DELETE', '/api/content/:collection/:slug', deleteContent)
  router.add('POST', '/api/content/:collection/:slug/publish', publishContent)
  router.add('GET', '/api/content/:collection/:slug/publish-impact', publishImpact)

  // Versioning
  router.add('GET', '/api/content/:collection/:slug/versions', listVersions)
  router.add('GET', '/api/content/:collection/:slug/versions/:version', getVersion)
  router.add('POST', '/api/content/:collection/:slug/restore/:version', restoreVersion)
  router.add('POST', '/api/content/:collection/:slug/defaults', applyDocumentDefaults)

  // Advisory locking
  router.add('POST', '/api/content/:collection/:slug/lock', acquireLock)
  router.add('DELETE', '/api/content/:collection/:slug/lock', releaseLock)
  router.add('GET', '/api/content/:collection/:slug/lock', checkLock)
  router.add('GET', '/api/locks', listLocks)

  // Schema + collections metadata
  router.add('GET', '/api/collections', listCollections)
  router.add('GET', '/api/schema/:collection/runtime', getRuntimeSchema)
  router.add('GET', '/api/schema/:collection/export', exportSchema)
  router.add('PUT', '/api/schema/:collection/fields', saveRuntimeField)
  router.add('DELETE', '/api/schema/:collection/fields/:field', deleteRuntimeField)
  router.add('GET', '/api/schema/:collection', getSchema)

  // Validation + page composition + site config
  router.add('POST', '/api/validate', validateAll)
  router.add('GET', '/api/page', resolvePageRoute)
  router.add('GET', '/api/site-config', siteConfigHandler)
}

function registerSeoRoutes(router: ApiRouter): void {
  router.add('POST', '/api/seo/enrich', seoEnrich)
  router.add('GET', '/api/seo/enrich/status', seoEnrichStatus)
  router.add('GET', '/api/seo/catalog', seoCatalog)
  router.add('GET', '/api/seo/config', getSeoConfig)
  router.add('GET', '/api/seo/config/:id', getSeoConfig)
  router.add('PUT', '/api/seo/config/:id', saveSeoConfig)
  router.add('PUT', '/api/seo/config', saveSeoConfig)
  router.add('DELETE', '/api/seo/config/:id', deleteSeoConfig)
  router.add('DELETE', '/api/seo/config', deleteAllSeoConfigs)
  router.add('GET', '/api/seo/collection/:name/impact', seoCollectionImpact)
  router.add('GET', '/api/seo/status', seoStatus)
  router.add('GET', '/api/seo/structured-data', seoStructuredData)
  router.add('GET', '/api/seo/preview/:collection/:slug', seoPreview)
  router.add('GET', '/api/seo/resolved/:collection/:slug', seoResolved)
  router.add('GET', '/api/seo/findings', seoSiteFindings)
  router.add('GET', '/api/seo/findings/:collection/:slug', seoFindings)
  router.add('GET', SEO_SITEMAP_PATH, seoSitemap)
  router.add('GET', SEO_SITEMAP_JSON_PATH, seoSitemapJson)
  router.add('GET', SEO_ROBOTS_PATH, seoRobots)
  router.add('GET', SEO_LLMS_TXT_PATH, seoLlmsTxt)
  router.add('GET', SEO_INDEXNOW_KEY_PATH, seoIndexNowKey)
  router.add('POST', '/api/seo/generate', seoGenerate)
}

/** The exact paths and the prefix of the reads that machines make of a public site */
const MACHINE_READ_PATHS: ReadonlySet<string> = new Set([
  SEO_SITEMAP_PATH,
  SEO_SITEMAP_JSON_PATH,
  SEO_ROBOTS_PATH,
  SEO_LLMS_TXT_PATH,
])
const INDEXNOW_KEY_PREFIX = SEO_INDEXNOW_KEY_PATH.slice(0, SEO_INDEXNOW_KEY_PATH.indexOf(':'))

function isMachineRead(req: ApiRequest): boolean {
  if (req.method.toUpperCase() !== 'GET') return false
  return MACHINE_READ_PATHS.has(req.path) || req.path.startsWith(INDEXNOW_KEY_PREFIX)
}

function registerAdminRoutes(router: ApiRouter): void {
  // Checkpoints
  router.add('GET', '/api/checkpoints', snapshotList)
  router.add('POST', '/api/checkpoints', snapshotCreate)
  router.add('GET', '/api/checkpoints/:version', snapshotGet)
  router.add('POST', '/api/checkpoints/:version/restore', snapshotRestore)
  router.add('DELETE', '/api/checkpoints/:version', snapshotDelete)

  // Users
  router.add('GET', '/api/users', userList)
  router.add('POST', '/api/users', userCreate)
  router.add('GET', '/api/users/:id/permissions', userPermissionsGet)
  router.add('PUT', '/api/users/:id/permissions', userPermissionsSet)
  router.add('GET', '/api/users/:id', userGet)
  router.add('PUT', '/api/users/:id', userUpdate)
  router.add('DELETE', '/api/users/:id', userDelete)

  // Webhooks, translations, retention
  router.add('GET', '/api/webhooks/deliveries', webhookDeliveries)
  router.add('POST', '/api/webhooks/deliveries/:id/retry', webhookRetry)
  router.add('GET', '/api/translations/status', translationStatus)
  router.add('GET', '/api/versions/stats', versionStats)
  router.add('POST', '/api/versions/purge', versionPurge)

  // Settings
  router.add('GET', '/api/settings/locales', getLocaleSettings)
  router.add('PUT', '/api/settings/locales', updateLocaleSettings)
  router.add('GET', '/api/settings/llm', getLLMSettings)
  router.add('PUT', '/api/settings/llm', updateLLMSettings)
  router.add('DELETE', '/api/settings/llm', deleteLLMSettings)
  router.add('POST', '/api/settings/llm/test', testLLMConnection)

  // Migrations
  router.add('GET', '/api/migrations/status', migrationStatus)
  router.add('GET', '/api/migrations/conflicts', migrationConflicts)
  router.add('POST', '/api/migrations/conflicts/:id/resolve', resolveConflict)
}

function registerPluginRoutes(router: ApiRouter, plugins: KranthoPlugin[]): void {
  for (const plugin of plugins) {
    if (plugin.routes) {
      for (const route of plugin.routes) {
        router.add(route.method, `/api/plugins/${plugin.name}${route.path}`, route.handler)
      }
    }
  }

  router.add('GET', '/api/plugins', async () => ({
    status: 200,
    body: {
      plugins: plugins.map((p) => ({
        name: p.name,
        version: p.version,
        description: p.description,
        routes: (p.routes ?? []).map((r) => `${r.method} /api/plugins/${p.name}${r.path}`),
        studioPages: (p.studioPages ?? []).map((a) => a.label),
        fieldTypes: (p.fieldTypes ?? []).map((f) => f.type),
      })),
    },
  }))
}

/** Compose all route groups into a single router. */
function registerRoutes(config: CreateApiHandlersConfig, plugins: KranthoPlugin[]): ApiRouter {
  const router = new ApiRouter()
  if (config.media) registerMediaRoutes(router)
  registerAdminRoutes(router)
  registerSeoRoutes(router)
  registerContentRoutes(router)
  if (config.config.assistant.enabled) registerAssistantRoutes(router)
  if (config.sitePreview) router.add('GET', '/api/preview', sitePreview)
  registerPluginRoutes(router, plugins)
  return router
}

type MediaContext = Pick<
  ApiContext,
  | 'mediaStorage'
  | 'mediaFolderStorage'
  | 'mediaStorageLabel'
  | 'mediaStoragePath'
  | 'imageOptimizer'
  | 'imageCache'
>

/** The media part of the context: the library over the wiring, and the image pipeline */
function mediaContext(media: MediaConfig | undefined, config: KranthoConfig): MediaContext {
  if (!media) return {}
  return {
    mediaStorage: new MediaLibrary(media.metadata, media.files, config.media),
    mediaFolderStorage: media.folders,
    mediaStorageLabel: media.files.label,
    mediaStoragePath: media.files.location ?? undefined,
    imageOptimizer: new ImageOptimizer(config.media.image),
    imageCache: new ImageCache(config.media.image.cache),
  }
}

export function createApiHandlers(config: CreateApiHandlersConfig): ApiHandlers {
  const webhooks = config.webhooks ?? []
  const plugins = config.plugins ?? []

  // The effective auth section: the tree has already resolved env over code, so
  // the only thing left to decide is the ephemeral signing secret. Configured
  // roles are checked here so a bad value fails the boot rather than minting
  // tokens every permission check rejects.
  const auth: AuthSection = {
    ...config.config.auth,
    jwtSecret: resolveJwtSecret(config.config.auth),
  }
  assertRole(auth.token.role, 'auth.token.role')
  assertRole(auth.oidc.newUserRole, 'auth.oidc.newUserRole')

  // Merge plugin hooks with config hooks (chained, not overwritten)
  let mergedHooks: ContentHooks | undefined = config.hooks
  for (const plugin of plugins) {
    if (plugin.hooks) {
      mergedHooks = mergeHooks(mergedHooks ?? {}, plugin.hooks)
    }
    if (plugin.onLoad) {
      Promise.resolve(plugin.onLoad()).catch((err: unknown) => {
        console.warn(`[plugin] ${plugin.name} onLoad failed:`, err)
      })
    }
  }

  const ctx: ApiContext = {
    contentConfig: config.contentConfig,
    config: { ...config.config, auth },
    adapter: config.adapter,
    engine: config.engine,
    pages: config.pages,
    fireWebhook:
      webhooks.length > 0
        ? (event, collection, slug) =>
            fireWebhooks(
              webhooks,
              event as WebhookEvent,
              collection,
              slug,
              config.webhookDeliveryAdapter,
            )
        : undefined,
    webhooks: webhooks.length > 0 ? webhooks : undefined,
    contentHooks: mergedHooks,
    changeListeners: config.onContentChange ? [config.onContentChange] : undefined,
    waitUntil: config.waitUntil,
    ...mediaContext(config.media, config.config),
    checkpointAdapter: config.checkpoints,
    contentMigrationAdapter: config.contentMigration,
    authAdapter: config.authAdapter,
    schemaVersion: config.schemaVersion,
    persistenceType: config.persistenceType,
    sitePreview: config.sitePreview,
    framework: config.framework,
    lockAdapter: config.lockAdapter,
    webhookDeliveryAdapter: config.webhookDeliveryAdapter,
    retentionAdapter: config.retentionAdapter,
    siteSettingsAdapter: config.siteSettingsAdapter,
    secrets: config.secrets,
    seoConfigAdapter: config.seoConfigAdapter,
    pageCacheStore: config.pageCacheStore,
  }

  const router = registerRoutes(config, plugins)

  // OpenAPI spec + docs (registered after all routes for complete spec)
  const openApiSpec = createOpenApiSpecHandler(router)
  const openApiDocs = createOpenApiDocsHandler()

  // Public routes (no auth check)
  const publicRouter = new ApiRouter()
  publicRouter.add('GET', '/api/capabilities', capabilities)
  publicRouter.add('GET', '/api/openapi.json', openApiSpec)
  publicRouter.add('GET', '/api/docs', openApiDocs)
  publicRouter.add('GET', '/api/auth/capabilities', authCapabilities)
  publicRouter.add('POST', '/api/auth/login', authLogin)
  publicRouter.add('POST', '/api/auth/refresh', authRefresh)
  publicRouter.add('GET', '/api/auth/refresh', authRefreshRedirect)
  publicRouter.add('GET', '/api/auth/login/oidc', authOidcLogin)
  publicRouter.add('GET', '/api/auth/callback', authCallback)
  publicRouter.add('POST', '/api/auth/logout', authLogout)
  publicRouter.add('GET', '/api/auth/me', authMe)

  async function handleWithAuth(req: ApiRequest): Promise<ApiResponse> {
    // Machine reads of a public site (robots.txt, the sitemap, llms.txt, the IndexNow key) publish
    // what visitors can read, so crawlers get them without signing in
    if (isMachineRead(req)) return router.handle(req, ctx)
    // Public routes bypass auth middleware
    if (
      req.path.startsWith('/api/auth/') ||
      req.path === '/api/capabilities' ||
      req.path === '/api/openapi.json' ||
      req.path === '/api/docs'
    ) {
      return publicRouter.handle(req, ctx)
    }

    const authResult = (await checkWorkloadAuth(req, auth)) ?? checkAuth(req, auth)
    if (!authResult.isAuthenticated) return authResult.response
    const authedCtx = { ...ctx, auth: authResult.user }
    return router.handle(req, authedCtx)
  }

  function handle(req: ApiRequest): Promise<ApiResponse> {
    if (req.method.toUpperCase() === 'HEAD') return answerHead(req, handleWithAuth)
    return handleWithAuth(req)
  }

  return {
    saveRepositoryDocument: (input) =>
      saveDocument(
        {
          ...ctx,
          auth: {
            id: 'repository',
            email: 'repository',
            name: 'Repository',
            roles: ['admin'],
            mode: 'none',
          },
        },
        { ...input, changedBy: 'filesystem' },
      ),
    handle,
    listCollections,
    listCollection,
    listContent,
    listContentTree,
    getContent,
    createContent,
    updateContent,
    deleteContent,
    publishContent,
    getSchema,
    listVersions,
    getVersion,
    restoreVersion,
    validateAll,
    resolvePageRoute,
    searchContent,
    bulkDelete,
    bulkPublish,
    siteConfigHandler,
    seoStatus,
    seoStructuredData,
    seoPreview,
    seoSitemap,
    seoRobots,
    seoGenerate,
    getRuntimeSchema,
    saveRuntimeField,
    deleteRuntimeField,
    exportSchema,
    exportContent,
    importContent,
    mediaList,
    mediaGet,
    mediaUpload,
    mediaRegister,
    mediaUpdate,
    mediaDelete,
    mediaImage,
    mediaInfo,
    mediaImageInfo,
    snapshotList,
    snapshotCreate,
    snapshotGet,
    snapshotRestore,
    snapshotDelete,
    migrationStatus,
    migrationConflicts,
    resolveConflict,
    capabilities,
    acquireLock,
    listLocks,
    publishImpact,
    releaseLock,
    checkLock,
    contentChanges,
    exportBundle,
    importBundle,
    webhookDeliveries,
    webhookRetry,
  }
}
