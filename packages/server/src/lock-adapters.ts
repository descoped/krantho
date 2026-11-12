import type {
  ILockAdapter,
  IMediaFolderStorage,
  IMediaMetadataAdapter,
  IPageCacheStore,
  IRetentionAdapter,
  ISeoConfigAdapter,
  ISiteSettingsAdapter,
  IWebhookDeliveryAdapter,
} from '@krantho/persistence'

export interface LockAdapterResult {
  lockAdapter: ILockAdapter | undefined
  webhookDeliveryAdapter: IWebhookDeliveryAdapter | undefined
  retentionAdapter: IRetentionAdapter | undefined
  siteSettingsAdapter: ISiteSettingsAdapter | undefined
  seoConfigAdapter: ISeoConfigAdapter | undefined
  mediaAdapter: IMediaMetadataAdapter | undefined
  mediaFolderAdapter: IMediaFolderStorage | undefined
  pageCacheStore: IPageCacheStore | undefined
}

const EMPTY: LockAdapterResult = {
  lockAdapter: undefined,
  webhookDeliveryAdapter: undefined,
  retentionAdapter: undefined,
  siteSettingsAdapter: undefined,
  seoConfigAdapter: undefined,
  mediaAdapter: undefined,
  mediaFolderAdapter: undefined,
  pageCacheStore: undefined,
}

/**
 * Create lock, webhook delivery, retention, site settings, SEO config, media
 * metadata and media folder adapters, and the shared page cache store, from a
 * raw database handle.
 *
 * Detects whether the handle is SQLite (has `prepare` method) or Postgres
 * (a callable function with `begin` method) and loads the appropriate adapter package.
 */
export async function createLockAdapters(
  lockDb: unknown | undefined,
  persistenceType?: string | undefined,
): Promise<LockAdapterResult> {
  if (!lockDb) return EMPTY

  // Postgres: the sql object is a function (tagged template) with a `begin` method
  if (persistenceType === 'postgres') {
    return createPostgresAdapters(lockDb)
  }

  // SQLite: the db object has a `prepare` method
  const db = lockDb as { prepare?: unknown }
  if (typeof db.prepare === 'function') {
    return createSqliteAdapters(lockDb)
  }

  return EMPTY
}

async function createSqliteAdapters(lockDb: unknown): Promise<LockAdapterResult> {
  try {
    const mod = (await import('@krantho/persistence-sqlite')) as {
      SqliteLockAdapter: new (db: unknown) => ILockAdapter
      SqliteWebhookDeliveryAdapter: new (db: unknown) => IWebhookDeliveryAdapter
      SqliteRetentionAdapter: new (db: unknown) => IRetentionAdapter
      SqliteSiteSettingsAdapter: new (db: unknown) => ISiteSettingsAdapter
      SqliteSeoConfigAdapter: new (db: unknown) => ISeoConfigAdapter
      SqliteMediaAdapter: new (db: unknown) => IMediaMetadataAdapter
      SqliteMediaFolderAdapter: new (db: unknown) => IMediaFolderStorage
      SqlitePageCacheStore: new (db: unknown) => IPageCacheStore
    }
    return {
      lockAdapter: new mod.SqliteLockAdapter(lockDb),
      webhookDeliveryAdapter: new mod.SqliteWebhookDeliveryAdapter(lockDb),
      retentionAdapter: new mod.SqliteRetentionAdapter(lockDb),
      siteSettingsAdapter: new mod.SqliteSiteSettingsAdapter(lockDb),
      seoConfigAdapter: new mod.SqliteSeoConfigAdapter(lockDb),
      mediaAdapter: new mod.SqliteMediaAdapter(lockDb),
      mediaFolderAdapter: new mod.SqliteMediaFolderAdapter(lockDb),
      pageCacheStore: new mod.SqlitePageCacheStore(lockDb),
    }
  } catch {
    return EMPTY
  }
}

/**
 * The Postgres package already loaded for the main adapter, so a failure here is
 * a real error. It propagates rather than leaving locks, settings and SEO config
 * silently disabled on a Postgres site.
 */
async function createPostgresAdapters(lockDb: unknown): Promise<LockAdapterResult> {
  const mod = (await import('@krantho/persistence-postgres')) as unknown as {
    PostgresLockAdapter: new (sql: unknown) => ILockAdapter
    PostgresWebhookDeliveryAdapter: new (sql: unknown) => IWebhookDeliveryAdapter
    PostgresRetentionAdapter: new (sql: unknown) => IRetentionAdapter
    PostgresSiteSettingsAdapter: new (sql: unknown) => ISiteSettingsAdapter
    PostgresSeoConfigAdapter: new (sql: unknown) => ISeoConfigAdapter
    PostgresMediaAdapter: new (sql: unknown) => IMediaMetadataAdapter
    PostgresMediaFolderAdapter: new (sql: unknown) => IMediaFolderStorage
    PostgresPageCacheStore: new (sql: unknown) => IPageCacheStore
  }
  return {
    lockAdapter: new mod.PostgresLockAdapter(lockDb),
    webhookDeliveryAdapter: new mod.PostgresWebhookDeliveryAdapter(lockDb),
    retentionAdapter: new mod.PostgresRetentionAdapter(lockDb),
    siteSettingsAdapter: new mod.PostgresSiteSettingsAdapter(lockDb),
    seoConfigAdapter: new mod.PostgresSeoConfigAdapter(lockDb),
    mediaAdapter: new mod.PostgresMediaAdapter(lockDb),
    mediaFolderAdapter: new mod.PostgresMediaFolderAdapter(lockDb),
    pageCacheStore: new mod.PostgresPageCacheStore(lockDb),
  }
}
