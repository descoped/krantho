import { randomUUID } from 'node:crypto'
import { type ContentMetadata, canonicalJson } from '@krantho/core'
import type {
  AuthoredMetadata,
  AuthoredWrite,
  ContentDocument,
  ContentQuery,
  DocumentMeta,
  IPersistenceAdapter,
  Publication,
  QueryPage,
  QueryProjection,
  RuntimeFieldDefinition,
  RuntimeMetadataGroup,
  RuntimeSchemaDefinition,
  WriteContentData,
} from '@krantho/persistence'
import {
  authoredOf,
  ContentWriteConflict,
  liveOnWrite,
  nextAuthored,
  publicationOfFile,
  resolveLiveVersion,
  sameAuthoredValues,
  storedStatus,
} from '@krantho/persistence'
import type Database from 'better-sqlite3'
import { openDatabase, type SqliteConnectionOptions } from './connection.js'
import { runContentQuery } from './content-query.js'
import { runMigrations } from './migration-runner.js'
import { sqliteMigrations } from './migrations/index.js'
import type { PreparedStatements } from './queries.js'
import { prepareStatements } from './queries.js'
import { parseJsonRecord, rowToContentDocument, rowToDocumentMeta } from './row-mapping.js'

/** Safely parse a JSON array column value. */
function parseJsonArray(json: string, column: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) {
      throw new Error(`Expected array, got ${parsed === null ? 'null' : typeof parsed}`)
    }
    return parsed
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON in ${column} column: ${cause}`)
  }
}

/** Status written when the caller supplies none */
export interface SqliteDefaultStatus {
  /** Documents upserted from a markdown file whose frontmatter has no status */
  filesystem: string
}

/** Construction options for {@link SQLiteAdapter} */
export interface SQLiteAdapterOptions extends Partial<SqliteConnectionOptions> {
  /**
   * Locale of every read and write that names none: the site's default locale,
   * `site.defaultLocale` in the krantho configuration.
   */
  defaultLocale: string
  defaultStatus?: Partial<SqliteDefaultStatus> | undefined
}

/**
 * Status default used when a file declares none.
 *
 * A deployment sets it through `content.defaultStatus.filesystem` in the
 * krantho configuration tree; the server passes the resolved value down. This
 * literal is the standalone-library fallback and mirrors that tree's default.
 */
export const DEFAULT_SQLITE_STATUS: SqliteDefaultStatus = {
  filesystem: 'published',
}

export class SQLiteAdapter implements IPersistenceAdapter {
  /** @internal — exposed for checkpoint adapter co-location */
  readonly database: Database.Database
  private readonly stmts: PreparedStatements
  private readonly defaultStatus: SqliteDefaultStatus
  private readonly defaultLocale: string

  constructor(dbPath: string, options: SQLiteAdapterOptions) {
    const { defaultStatus, defaultLocale, ...connection } = options
    this.defaultLocale = defaultLocale
    this.defaultStatus = { ...DEFAULT_SQLITE_STATUS, ...defaultStatus }
    this.database = openDatabase(dbPath, connection)
    runMigrations(this.database, sqliteMigrations)
    this.stmts = prepareStatements(this.database)
  }

  // --- IContentLoader methods ---

  async exists(slug: string): Promise<boolean> {
    const result = this.stmts.existsBySlug.get(slug)
    return (result?.count ?? 0) > 0
  }

  async read(slug: string): Promise<string> {
    const row = this.stmts.getBySlug.get(slug)
    if (!row) {
      throw new Error(`Content not found: ${slug}`)
    }
    // Reconstruct raw markdown with YAML frontmatter for IContentLoader compatibility
    const fields = parseJsonRecord(row.fields, 'fields')
    const yamlLines = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    return `---\n${yamlLines.join('\n')}\n---\n${row.body}`
  }

  async getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>> {
    const row = this.stmts.getBySlug.get(slug)
    if (!row) {
      throw new Error(`Content not found: ${slug}`)
    }
    return {
      size: row.body.length + row.fields.length,
      lastModified: new Date(row.created_at),
    }
  }

  // --- IPersistenceAdapter methods ---

  async listSlugs(): Promise<string[]> {
    const rows = this.stmts.listAllSlugs.all()
    return rows.map((r) => r.slug)
  }

  async writeContent(data: WriteContentData, changedBy?: string | undefined): Promise<void> {
    this.appendVersion(data.collection, data.slug, data.locale ?? this.defaultLocale, {
      authored: authoredOf(data),
      expectedVersion: data.expectedVersion,
      fields: JSON.stringify(data.fields),
      body: data.body,
      html: data.html ?? '',
      sections: data.sections ? JSON.stringify(data.sections) : '{}',
      source: 'api',
      filePath: null,
      changedBy: changedBy ?? null,
      publication: data.publication,
    })
  }

  async deleteContent(
    collection: string,
    slug: string,
    locale?: string | undefined,
    changedBy?: string | undefined,
  ): Promise<void> {
    const row = this.stmts.getByCollectionSlugLocale.get(
      collection,
      slug,
      locale ?? this.defaultLocale,
    )
    if (!row) return

    const now = new Date().toISOString()
    const maxResult = this.stmts.getMaxVersion.get(collection, slug, row.locale)
    const nextVersion = (maxResult?.max_version ?? 0) + 1

    this.database
      .transaction(() => {
        this.stmts.flipCurrent.run(collection, slug, row.locale)
        this.stmts.insertVersion.run(
          randomUUID(),
          collection,
          slug,
          row.locale,
          nextVersion,
          'deleted',
          '{}',
          '',
          '',
          '{}',
          'api',
          null,
          changedBy ?? null,
          now,
          now,
          null, // live_version: nothing is live after a delete
          row.authored,
        )
      })
      .immediate()
  }

  async getContent(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null> {
    const row = this.stmts.getByCollectionSlugLocale.get(
      collection,
      slug,
      locale ?? this.defaultLocale,
    )
    return row ? rowToContentDocument(row) : null
  }

  async getPublished(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null> {
    const row = this.stmts.getPublished.get(collection, slug, locale ?? this.defaultLocale)
    return row ? rowToContentDocument(row) : null
  }

  async query<P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>> {
    return runContentQuery(this.database, spec)
  }

  async listVersions(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<DocumentMeta[]> {
    const rows = this.stmts.listVersionMeta.all(collection, slug, locale ?? this.defaultLocale)
    return rows.map(rowToDocumentMeta)
  }

  async getVersion(
    collection: string,
    slug: string,
    version: number,
    locale?: string | undefined,
  ): Promise<ContentDocument | null> {
    const row = this.stmts.getVersionByNumber.get(
      collection,
      slug,
      locale ?? this.defaultLocale,
      version,
    )
    return row ? rowToContentDocument(row) : null
  }

  /**
   * Import a filesystem content item — creates a new version if content changed.
   * `modifiedAt` (ISO 8601) dates the version when the file last changed, such as
   * its last git commit; without it the version is dated now.
   */
  async upsertFromFile(
    collection: string,
    slug: string,
    fields: Record<string, unknown>,
    body: string,
    html: string,
    sections: Record<string, string>,
    filePath: string,
    locale?: string | undefined,
    modifiedAt?: string | undefined,
    authored?:
      | (Partial<AuthoredMetadata> & {
          publication: Publication | undefined
          expectedVersion?: number | undefined
        })
      | undefined,
  ): Promise<void> {
    const loc = locale ?? this.defaultLocale
    const status = typeof fields.status === 'string' ? fields.status : this.defaultStatus.filesystem
    const fieldsJson = JSON.stringify(fields)
    const sectionsJson = JSON.stringify(sections)

    // Check if content exists and is unchanged
    const existing = this.stmts.getByCollectionSlugLocale.get(collection, slug, loc)
    if (
      existing &&
      canonicalJson(JSON.parse(existing.fields)) === canonicalJson(fields) &&
      existing.body === body &&
      sameAuthoredValues(JSON.parse(existing.authored) as AuthoredMetadata, authored ?? {})
    ) {
      return // No change — skip
    }

    this.appendVersion(collection, slug, loc, {
      fields: fieldsJson,
      body,
      html,
      sections: sectionsJson,
      source: 'filesystem',
      filePath,
      changedBy: null,
      publication: authored ? authored.publication : publicationOfFile(status),
      authored: authoredOf(authored ?? {}),
      expectedVersion: authored?.expectedVersion,
      createdAt: modifiedAt,
    })
  }

  /** Restore content to a specific version — a save: a new current version from the old one, the live version kept */
  async restoreVersion(
    collection: string,
    slug: string,
    version: number,
    changedBy?: string | undefined,
    locale?: string | undefined,
  ): Promise<boolean> {
    const target = this.stmts.getVersionByNumber.get(
      collection,
      slug,
      locale ?? this.defaultLocale,
      version,
    )
    if (!target) return false

    this.appendVersion(collection, slug, target.locale, {
      authored: JSON.parse(target.authored) as AuthoredMetadata,
      fields: target.fields,
      body: target.body,
      html: target.html,
      sections: target.sections,
      source: target.source,
      filePath: target.file_path,
      changedBy: changedBy ?? `restore:v${version}`,
      publication: undefined,
    })

    return true
  }

  /** Get runtime schema extensions for a collection */
  async getRuntimeSchema(collection: string): Promise<RuntimeSchemaDefinition | null> {
    const row = this.database
      .prepare(
        'SELECT collection, fields, metadata_groups, created_at FROM collection_schemas WHERE collection = ? AND is_current = 1 AND deleted_at IS NULL',
      )
      .get(collection) as
      | { collection: string; fields: string; metadata_groups: string; created_at: string }
      | undefined

    if (!row) return null

    return {
      collection: row.collection,
      fields: parseJsonArray(row.fields, 'fields') as RuntimeFieldDefinition[],
      metadata: parseJsonArray(row.metadata_groups, 'metadata_groups') as RuntimeMetadataGroup[],
      updatedAt: row.created_at,
    }
  }

  /** Save runtime schema extensions for a collection — creates a new schema version */
  async saveRuntimeSchema(
    collection: string,
    schema: RuntimeSchemaDefinition,
    changedBy?: string | undefined,
  ): Promise<void> {
    const now = new Date().toISOString()
    const fieldsJson = JSON.stringify(schema.fields)

    // Get current version
    const current = this.database
      .prepare('SELECT version FROM collection_schemas WHERE collection = ? AND is_current = 1')
      .get(collection) as { version: number } | undefined
    const nextVersion = current ? current.version + 1 : 1

    this.database
      .transaction(() => {
        if (current) {
          this.database
            .prepare(
              'UPDATE collection_schemas SET is_current = 0 WHERE collection = ? AND is_current = 1',
            )
            .run(collection)
        }

        this.database
          .prepare(
            'INSERT INTO collection_schemas (row_id, collection, version, is_current, fields, changed_by, created_at, metadata_groups) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
          )
          .run(
            randomUUID(),
            collection,
            nextVersion,
            fieldsJson,
            changedBy ?? null,
            now,
            JSON.stringify(schema.metadata ?? []),
          )
      })
      .immediate()
  }

  /** Close the database connection */
  close(): void {
    this.database.close()
  }

  // --- Private helpers ---

  /**
   * Core append-only write: flip current, insert the new version. Its live
   * version follows the write's publication (a save keeps it) and its stored
   * status follows the live version.
   */
  private appendVersion(
    collection: string,
    slug: string,
    locale: string,
    data: {
      authored?: AuthoredWrite | undefined
      expectedVersion?: number | undefined
      fields: string
      body: string
      html: string
      sections: string
      source: string
      filePath: string | null
      changedBy: string | null
      publication: Publication | undefined
      /** When the content was written; an imported file passes its last git change, otherwise now */
      createdAt?: string | undefined
    },
  ): void {
    const now = data.createdAt ?? new Date().toISOString()
    this.database
      .transaction(() => {
        const maxResult = this.stmts.getMaxVersion.get(collection, slug, locale)
        if (
          data.expectedVersion !== undefined &&
          data.expectedVersion !== (maxResult?.max_version ?? 0)
        ) {
          throw new ContentWriteConflict(maxResult?.max_version ?? 0, data.expectedVersion)
        }
        const nextVersion = (maxResult?.max_version ?? 0) + 1
        const previous = this.stmts.getCurrentState.get(collection, slug, locale)
        const liveVersion = resolveLiveVersion(
          liveOnWrite(data.publication),
          nextVersion,
          previous?.live_version ?? null,
        )
        const status = storedStatus(data.publication, liveVersion, previous?.status)

        this.stmts.flipCurrent.run(collection, slug, locale)
        this.stmts.insertVersion.run(
          randomUUID(),
          collection,
          slug,
          locale,
          nextVersion,
          status,
          data.fields,
          data.body,
          data.html,
          data.sections,
          data.source,
          data.filePath,
          data.changedBy,
          null, // deleted_at
          now,
          liveVersion,
          JSON.stringify(
            nextAuthored(
              previous ? (JSON.parse(previous.authored) as AuthoredMetadata) : null,
              data.authored ?? {},
              nextVersion,
            ),
          ),
        )
      })
      .immediate()
  }
}
