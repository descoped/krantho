import type {
  ContentSection,
  PersistenceSection,
  PostgresPersistenceSection,
  SiteSection,
} from '@krantho/config'
import type {
  ICheckpointAdapter,
  IContentMigrationAdapter,
  IPersistenceAdapter,
} from '@krantho/persistence'
import { FileSystemAdapter } from '@krantho/persistence-fs'

/** Result of creating a persistence adapter */
export interface AdapterResult {
  adapter: IPersistenceAdapter
  checkpointAdapter?: ICheckpointAdapter | undefined
  contentMigrationAdapter?: IContentMigrationAdapter | undefined
  authAdapter?: import('@krantho/persistence').IAuthAdapter | undefined
  /** Raw database handle for sub-adapter creation (SQLite Database or Postgres Sql) */
  lockDb?: unknown | undefined
  schemaVersion: number
}

/**
 * Create a persistence adapter from configuration.
 *
 * Filesystem is loaded directly. SQLite and Postgres are loaded via dynamic import
 * to avoid pulling in native modules when they're not needed.
 *
 * Every read and write that names no locale uses `site.defaultLocale`. The
 * filesystem adapter keeps each collection's files in that collection's
 * `directory`.
 */
export async function createAdapter(
  config: PersistenceSection,
  site: Pick<SiteSection, 'defaultLocale'>,
  content: Pick<ContentSection, 'defaultStatus'>,
  collections: ReadonlyMap<string, { directory?: string | undefined }>,
): Promise<AdapterResult> {
  const defaultStatus = content.defaultStatus
  const defaultLocale = site.defaultLocale

  switch (config.provider) {
    case 'filesystem':
      return {
        adapter: new FileSystemAdapter({
          contentPath: config.filesystem.contentPath,
          directories: collectionDirectories(collections),
          defaultLocale,
          defaultStatus: defaultStatus.filesystem,
        }),
        schemaVersion: 0,
      }

    case 'sqlite': {
      const {
        SQLiteAdapter,
        SqliteCheckpointAdapter,
        SqliteContentMigrationAdapter,
        SqliteAuthAdapter,
        getSchemaVersion,
      } = await import('@krantho/persistence-sqlite')
      const adapter = new SQLiteAdapter(config.sqlite.path, {
        busyTimeoutMs: config.sqlite.busyTimeoutMs,
        walRetries: config.sqlite.walRetries,
        walRetryDelayMs: config.sqlite.walRetryDelayMs,
        defaultLocale,
        defaultStatus,
      })
      const checkpointAdapter = new SqliteCheckpointAdapter(adapter.database)
      const contentMigrationAdapter = new SqliteContentMigrationAdapter(adapter.database)
      const authAdapter = new SqliteAuthAdapter(adapter.database)
      const schemaVersion = getSchemaVersion(adapter.database)
      return {
        adapter,
        checkpointAdapter,
        contentMigrationAdapter,
        authAdapter,
        lockDb: adapter.database,
        schemaVersion,
      }
    }

    case 'postgres': {
      const {
        pg,
        adapter: {
          PostgresAdapter,
          PostgresContentMigrationAdapter,
          PostgresAuthAdapter,
          PostgresCheckpointAdapter,
          getSchemaVersion,
        },
      } = await importPostgresPackages()
      // Validated at resolve time: a postgres provider without a URL never reaches here.
      const sql = pg.default(config.postgres.url as string, postgresClientOptions(config.postgres))
      const adapter = await PostgresAdapter.create(sql, { defaultLocale, defaultStatus })
      const checkpointAdapter = new PostgresCheckpointAdapter(sql)
      const contentMigrationAdapter = new PostgresContentMigrationAdapter(sql)
      const authAdapter = new PostgresAuthAdapter(sql)
      const schemaVersion = await getSchemaVersion(sql)
      return {
        adapter,
        checkpointAdapter,
        contentMigrationAdapter,
        authAdapter,
        lockDb: sql,
        schemaVersion,
      }
    }
  }
}

/**
 * Load the Postgres adapter package and driver. Both are optional peers of
 * `@krantho/server`, so an app that selects the postgres provider must list
 * them in its own dependencies.
 */
async function importPostgresPackages() {
  try {
    const adapter = await import('@krantho/persistence-postgres')
    const pg = await import('postgres')
    return { adapter, pg }
  } catch (err) {
    throw new Error(
      'persistence.provider is "postgres", but @krantho/persistence-postgres or postgres could not be loaded. ' +
        'Add both to the dependencies of the app that runs krantho.',
      { cause: err },
    )
  }
}

/**
 * Driver options from the configuration. Only the leaves that are set are
 * passed, so an unset leaf keeps the driver's own default — including any
 * value given as a query parameter on the connection URL.
 */
export function postgresClientOptions(config: PostgresPersistenceSection): {
  max?: number
  prepare?: boolean
  idle_timeout?: number
} {
  const options: { max?: number; prepare?: boolean; idle_timeout?: number } = {}
  if (config.maxConnections !== undefined) options.max = config.maxConnections
  if (config.prepare !== undefined) options.prepare = config.prepare
  if (config.idleTimeoutSec !== undefined) options.idle_timeout = config.idleTimeoutSec
  return options
}

/** Each collection's directory, for the collections that name one */
function collectionDirectories(
  collections: ReadonlyMap<string, { directory?: string | undefined }>,
): Map<string, string> {
  const directories = new Map<string, string>()
  for (const [name, { directory }] of collections) {
    if (directory) directories.set(name, directory)
  }
  return directories
}
