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
import type { Sql } from 'postgres'
import { runContentQuery } from './content-query.js'
import { runMigrations } from './migration-runner.js'
import { postgresMigrations } from './migrations/index.js'
import type { ContentRow, MetaRow } from './row-mapping.js'
import { rowToContentDocument, rowToDocumentMeta } from './row-mapping.js'

/** Status written when the caller supplies none, per write path */
export interface PostgresDefaultStatus {
  /** Documents upserted from a markdown file whose frontmatter has no status */
  filesystem: string
}

/** Construction options for {@link PostgresAdapter} */
export interface PostgresAdapterOptions {
  /**
   * Locale of every read and write that names none: the site's default locale,
   * `site.defaultLocale` in the krantho configuration.
   */
  defaultLocale: string
  defaultStatus?: Partial<PostgresDefaultStatus> | undefined
}

/**
 * Status default used when a file declares none.
 *
 * A deployment sets it through `content.defaultStatus.filesystem` in the
 * krantho configuration tree; the server passes the resolved value down. This
 * literal is the standalone-library fallback and mirrors that tree's default.
 */
export const DEFAULT_POSTGRES_STATUS: PostgresDefaultStatus = {
  filesystem: 'published',
}

export class PostgresAdapter implements IPersistenceAdapter {
  private readonly sql: Sql
  private readonly defaultStatus: PostgresDefaultStatus
  private readonly defaultLocale: string
  private initialization: Promise<void> | null = null

  constructor(sql: Sql, options: PostgresAdapterOptions) {
    this.sql = sql
    this.defaultLocale = options.defaultLocale
    this.defaultStatus = { ...DEFAULT_POSTGRES_STATUS, ...options.defaultStatus }
  }

  static async create(sql: Sql, options: PostgresAdapterOptions): Promise<PostgresAdapter> {
    const adapter = new PostgresAdapter(sql, options)
    await adapter.ensureInitialized()
    return adapter
  }

  /**
   * Run migrations once per instance. Concurrent callers share the in-flight
   * run; a failed run is dropped so the next call retries it.
   */
  private ensureInitialized(): Promise<void> {
    this.initialization ??= runMigrations(this.sql, postgresMigrations).then(
      () => undefined,
      (err: unknown) => {
        this.initialization = null
        throw err
      },
    )
    return this.initialization
  }

  // --- IContentLoader methods ---

  async exists(slug: string): Promise<boolean> {
    await this.ensureInitialized()
    const rows = await this.sql<{ count: string }[]>`
      SELECT COUNT(*) as count FROM content
      WHERE slug = ${slug} AND is_current = TRUE AND deleted_at IS NULL`
    return parseInt(rows[0]?.count ?? '0', 10) > 0
  }

  async read(slug: string): Promise<string> {
    await this.ensureInitialized()
    const rows = await this.sql<ContentRow[]>`
      SELECT * FROM content
      WHERE slug = ${slug} AND is_current = TRUE AND deleted_at IS NULL
      LIMIT 1`
    const row = rows[0]
    if (!row) throw new Error(`Content not found: ${slug}`)

    const yamlLines = Object.entries(row.fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    return `---\n${yamlLines.join('\n')}\n---\n${row.body}`
  }

  async getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>> {
    await this.ensureInitialized()
    const rows = await this.sql<ContentRow[]>`
      SELECT * FROM content
      WHERE slug = ${slug} AND is_current = TRUE AND deleted_at IS NULL
      LIMIT 1`
    const row = rows[0]
    if (!row) throw new Error(`Content not found: ${slug}`)

    return {
      size: row.body.length + JSON.stringify(row.fields).length,
      lastModified: new Date(row.created_at),
    }
  }

  // --- IPersistenceAdapter methods ---

  async listSlugs(): Promise<string[]> {
    await this.ensureInitialized()
    const rows = await this.sql<{ slug: string }[]>`
      SELECT DISTINCT slug FROM content WHERE is_current = TRUE AND deleted_at IS NULL`
    return rows.map((r) => r.slug)
  }

  async writeContent(data: WriteContentData, changedBy?: string | undefined): Promise<void> {
    await this.ensureInitialized()
    await this.appendVersion(data.collection, data.slug, data.locale ?? this.defaultLocale, {
      authored: authoredOf(data),
      expectedVersion: data.expectedVersion,
      fields: data.fields,
      body: data.body,
      html: data.html ?? '',
      sections: data.sections ?? {},
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
    await this.ensureInitialized()
    const loc = locale ?? this.defaultLocale
    const rows = await this.sql<ContentRow[]>`
      SELECT * FROM content
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${loc}
        AND is_current = TRUE AND deleted_at IS NULL
      LIMIT 1`
    const row = rows[0]
    if (!row) return

    const maxRows = await this.sql<{ max_version: number | null }[]>`
      SELECT MAX(version) as max_version FROM content
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${row.locale}`
    const nextVersion = (maxRows[0]?.max_version ?? 0) + 1
    const now = new Date().toISOString()

    await this.sql.begin(async (tx) => {
      await tx.unsafe(
        'UPDATE content SET is_current = FALSE WHERE collection = $1 AND slug = $2 AND locale = $3 AND is_current = TRUE',
        [collection, slug, row.locale],
      )
      await tx.unsafe(
        `INSERT INTO content (id, collection, slug, locale, version, is_current, status, fields, body, html, sections, source, file_path, changed_by, deleted_at, created_at, live_version)
         VALUES ($1, $2, $3, $4, $5, TRUE, 'deleted', '{}'::jsonb, '', '', '{}'::jsonb, 'api', NULL, $6, $7, $7, NULL)`,
        [randomUUID(), collection, slug, row.locale, nextVersion, changedBy ?? null, now],
      )
    })
  }

  async getContent(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null> {
    await this.ensureInitialized()
    const loc = locale ?? this.defaultLocale
    const rows = await this.sql<ContentRow[]>`
      SELECT * FROM content
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${loc}
        AND is_current = TRUE AND deleted_at IS NULL
      LIMIT 1`
    const row = rows[0]
    return row ? rowToContentDocument(row) : null
  }

  async getPublished(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null> {
    await this.ensureInitialized()
    const loc = locale ?? this.defaultLocale
    const rows = await this.sql<ContentRow[]>`
      SELECT live.* FROM content cur
      JOIN content live ON live.collection = cur.collection AND live.slug = cur.slug
        AND live.locale = cur.locale AND live.version = cur.live_version
      WHERE cur.collection = ${collection} AND cur.slug = ${slug} AND cur.locale = ${loc}
        AND cur.is_current = TRUE AND cur.deleted_at IS NULL
      LIMIT 1`
    const row = rows[0]
    return row ? rowToContentDocument(row) : null
  }

  async query<P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>> {
    await this.ensureInitialized()
    return runContentQuery(this.sql, spec)
  }

  async listVersions(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<DocumentMeta[]> {
    await this.ensureInitialized()
    const loc = locale ?? this.defaultLocale
    const rows = await this.sql<MetaRow[]>`
      SELECT id, collection, slug, locale, version, is_current, status, source, file_path,
        changed_by, deleted_at, created_at, live_version
      FROM content
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${loc}
      ORDER BY version DESC`
    return rows.map(rowToDocumentMeta)
  }

  async getVersion(
    collection: string,
    slug: string,
    version: number,
    locale?: string | undefined,
  ): Promise<ContentDocument | null> {
    await this.ensureInitialized()
    const loc = locale ?? this.defaultLocale
    const rows = await this.sql<ContentRow[]>`
      SELECT * FROM content
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${loc} AND version = ${version}
      LIMIT 1`
    const row = rows[0]
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
    await this.ensureInitialized()
    const loc = locale ?? this.defaultLocale
    const status = typeof fields.status === 'string' ? fields.status : this.defaultStatus.filesystem

    // Check if content exists and is unchanged
    const existing = await this.sql<ContentRow[]>`
      SELECT * FROM content
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${loc}
        AND is_current = TRUE AND deleted_at IS NULL
      LIMIT 1`
    const row = existing[0]
    if (
      row &&
      canonicalJson(row.fields) === canonicalJson(fields) &&
      row.body === body &&
      sameAuthoredValues(row.authored, authored ?? {})
    ) {
      return // No change — skip
    }

    await this.appendVersion(collection, slug, loc, {
      fields,
      body,
      html,
      sections,
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
    await this.ensureInitialized()
    const loc = locale ?? this.defaultLocale
    const rows = await this.sql<ContentRow[]>`
      SELECT * FROM content
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${loc} AND version = ${version}
      LIMIT 1`
    const target = rows[0]
    if (!target) return false

    await this.appendVersion(collection, slug, target.locale, {
      authored: target.authored,
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

  // --- Runtime Schema methods ---

  async getRuntimeSchema(collection: string): Promise<RuntimeSchemaDefinition | null> {
    await this.ensureInitialized()
    const rows = await this.sql<
      Array<{
        collection: string
        fields: RuntimeFieldDefinition[]
        metadata_groups: RuntimeMetadataGroup[]
        created_at: Date
      }>
    >`SELECT collection, fields, metadata_groups, created_at FROM collection_schemas
      WHERE collection = ${collection} AND is_current = TRUE AND deleted_at IS NULL`

    const row = rows[0]
    if (!row) return null

    return {
      collection: row.collection,
      fields: row.fields,
      metadata: row.metadata_groups,
      updatedAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }
  }

  async saveRuntimeSchema(
    collection: string,
    schema: RuntimeSchemaDefinition,
    changedBy?: string | undefined,
  ): Promise<void> {
    await this.ensureInitialized()

    const current = await this.sql<{ version: number }[]>`
      SELECT version FROM collection_schemas
      WHERE collection = ${collection} AND is_current = TRUE`
    const nextVersion = current[0] ? current[0].version + 1 : 1
    const now = new Date().toISOString()

    // See `appendVersion` for the JSONB binding explanation — `sql.json()`
    // wraps the fields array as a JSONB parameter so the driver binds it
    // as an object, not a JSON-text-wrapped-as-string.
    await this.sql.begin(async (tx) => {
      if (current[0]) {
        await tx.unsafe(
          'UPDATE collection_schemas SET is_current = FALSE WHERE collection = $1 AND is_current = TRUE',
          [collection],
        )
      }
      await tx.unsafe(
        `INSERT INTO collection_schemas (row_id, collection, version, is_current, fields, changed_by, created_at, metadata_groups)
         VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7)`,
        [
          randomUUID(),
          collection,
          nextVersion,
          this.sql.json(schema.fields as never),
          changedBy ?? null,
          now,
          this.sql.json((schema.metadata ?? []) as never),
        ],
      )
    })
  }

  /** Close the database connection */
  async close(): Promise<void> {
    await this.sql.end()
  }

  // --- Private helpers ---

  /**
   * Core append-only write: flip current, insert the new version. Its live
   * version follows the write's publication (a save keeps it) and its stored
   * status follows the live version.
   */
  private async appendVersion(
    collection: string,
    slug: string,
    locale: string,
    data: {
      authored?: AuthoredWrite | undefined
      expectedVersion?: number | undefined
      fields: Record<string, unknown>
      body: string
      html: string
      sections: Record<string, string>
      source: string
      filePath: string | null
      changedBy: string | null
      publication: Publication | undefined
      /** When the content was written; an imported file passes its last git change, otherwise now */
      createdAt?: string | undefined
    },
  ): Promise<void> {
    const now = data.createdAt ?? new Date().toISOString()

    // JSONB binding note: the postgres driver's `sql.json(value)` helper
    // wraps an object as a JSONB parameter for `.unsafe()` calls. A previous
    // implementation used `JSON.stringify(fields)` with a `::jsonb` cast,
    // which double-encoded the value — JSONB stored the JSON text as a
    // string literal, so every read returned the stringified text instead of
    // the parsed object. Pass objects through `this.sql.json(...)` to bind
    // correctly as JSONB without the redundant text→jsonb cast.
    await this.sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([collection, slug, locale])}, 0))`
      const maxRows = await tx<{ max_version: number | null }[]>`
      SELECT MAX(version) as max_version FROM content
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${locale}`
      const nextVersion = (maxRows[0]?.max_version ?? 0) + 1
      if (
        data.expectedVersion !== undefined &&
        data.expectedVersion !== (maxRows[0]?.max_version ?? 0)
      ) {
        throw new ContentWriteConflict(maxRows[0]?.max_version ?? 0, data.expectedVersion)
      }

      const previous = (await tx.unsafe(
        'SELECT live_version, status, authored FROM content WHERE collection = $1 AND slug = $2 AND locale = $3 AND is_current = TRUE',
        [collection, slug, locale],
      )) as Array<{ live_version: number | null; status: string; authored: AuthoredMetadata }>
      const liveVersion = resolveLiveVersion(
        liveOnWrite(data.publication),
        nextVersion,
        previous[0]?.live_version ?? null,
      )
      const status = storedStatus(data.publication, liveVersion, previous[0]?.status)
      await tx.unsafe(
        'UPDATE content SET is_current = FALSE WHERE collection = $1 AND slug = $2 AND locale = $3 AND is_current = TRUE',
        [collection, slug, locale],
      )
      await tx.unsafe(
        `INSERT INTO content (id, collection, slug, locale, version, is_current, status, fields, body, html, sections, source, file_path, changed_by, created_at, live_version, authored)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          randomUUID(),
          collection,
          slug,
          locale,
          nextVersion,
          status,
          this.sql.json(data.fields as never),
          data.body,
          data.html,
          this.sql.json(data.sections as never),
          data.source,
          data.filePath,
          data.changedBy,
          now,
          liveVersion,
          this.sql.json(
            nextAuthored(previous[0]?.authored ?? null, data.authored ?? {}, nextVersion) as never,
          ),
        ],
      )
    })
  }
}
