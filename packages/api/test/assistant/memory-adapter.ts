import type {
  AuthoredMetadata,
  ContentDocument,
  ContentLock,
  ContentQuery,
  ContentStatus,
  ContentSummary,
  DocumentMeta,
  ILockAdapter,
  IPersistenceAdapter,
  ISeoConfigAdapter,
  ISiteSettingsAdapter,
  MatchTarget,
  Publication,
  QueryPage,
  QueryProjection,
  RuntimeSchemaDefinition,
  SeoConfig,
  SeoConfigScope,
  WriteContentData,
} from '@krantho/persistence'
import {
  authoredMetadata,
  ContentWriteConflict,
  liveOnWrite,
  resolveLiveVersion,
  statusOf,
  storedStatus,
} from '@krantho/persistence'

/** One appended version of a document */
interface Row extends Partial<AuthoredMetadata> {
  collection: string
  slug: string
  locale: string
  version: number
  status: ContentStatus
  fields: Record<string, unknown>
  body: string
  changedBy: string | null
  /** The live version of the document as of this row */
  live: number | null
}

const PUBLICATION_OF_STATUS: Partial<Record<ContentStatus, Publication>> = {
  published: 'publish',
  archived: 'archive',
}

function key(collection: string, slug: string, locale: string): string {
  return `${collection}/${slug}@${locale}`
}

function toDocument(row: Row): ContentDocument {
  const meta: DocumentMeta = {
    collection: row.collection,
    slug: row.slug,
    locale: row.locale,
    version: row.version,
    liveVersion: row.live,
    status: statusOf(row.status, row.live),
    source: 'api',
    changedBy: row.changedBy,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  return {
    ...structuredClone(authoredMetadata(row)),
    meta,
    fields: structuredClone(row.fields),
    body: row.body,
    html: '',
    sections: {},
  }
}

/** `field` or `field:desc` over the row's column or field, then collection, slug and locale */
function compareRows(sort: string | undefined): (a: Row, b: Row) => number {
  const [field, direction] = (sort ?? '').split(':')
  const sign = direction === 'desc' ? -1 : 1
  const sortValue = (row: Row): string =>
    String(field ? ((row as unknown as Record<string, unknown>)[field] ?? row.fields[field]) : '')
  return (a, b) =>
    sign * sortValue(a).localeCompare(sortValue(b)) ||
    a.collection.localeCompare(b.collection) ||
    a.slug.localeCompare(b.slug) ||
    a.locale.localeCompare(b.locale)
}

function project(
  doc: ContentDocument,
  projection: QueryProjection,
): ContentDocument | ContentSummary | DocumentMeta {
  if (projection === 'meta') return doc.meta
  if (projection === 'summary')
    return { meta: doc.meta, fields: doc.fields, metadata: doc.metadata }
  return doc
}

/** Characters of a snippet before the match, and from the match on, as the SQL adapters cut them */
const SNIPPET_BEFORE = 80
const SNIPPET_LENGTH = 200

/** The text each match target searches; the fields are their JSON text */
function matchText(row: Row, target: MatchTarget): string {
  if (target === 'slug') return row.slug
  return target === 'body' ? row.body : JSON.stringify(row.fields)
}

function matches(row: Row, text: string, targets: readonly MatchTarget[]): boolean {
  const needle = text.toLowerCase()
  return targets.some((target) => matchText(row, target).toLowerCase().includes(needle))
}

/**
 * The window around the first match, from the body when it matches there, else from the fields.
 * A test double of the adapters' own snippet (the contract suite pins it), not production logic.
 */
function snippetOf(row: Row, text: string, targets: readonly MatchTarget[]): string | undefined {
  const needle = text.toLowerCase()
  for (const target of ['body', 'fields'] as const) {
    if (!targets.includes(target)) continue
    const haystack = matchText(row, target)
    const at = haystack.toLowerCase().indexOf(needle)
    if (at < 0) continue
    const start = Math.max(0, at - SNIPPET_BEFORE)
    return haystack.slice(start, start + SNIPPET_LENGTH).replace(/\s+/g, ' ')
  }
  return undefined
}

/**
 * An append-only, in-memory persistence adapter with the SQL adapters' rules:
 * every write appends a version, only a publication changes the live version
 * (a save keeps it), and a delete appends a tombstone.
 */
export class MemoryAdapter implements IPersistenceAdapter {
  readonly history = new Map<string, Row[]>()
  readonly runtimeSchemas = new Map<string, RuntimeSchemaDefinition>()

  /** @param defaultLocale - the locale of every read and write that names none, as for the real adapters */
  constructor(private readonly defaultLocale: string) {}

  private rows(k: string): Row[] {
    let rows = this.history.get(k)
    if (!rows) {
      rows = []
      this.history.set(k, rows)
    }
    return rows
  }

  private latest(collection: string, slug: string, locale: string): Row | undefined {
    const rows = this.history.get(key(collection, slug, locale))
    return rows?.[rows.length - 1]
  }

  private append(row: Omit<Row, 'version'>): Row {
    const rows = this.rows(key(row.collection, row.slug, row.locale))
    const version = (rows[rows.length - 1]?.version ?? 0) + 1
    const appended = structuredClone({ ...row, version })
    rows.push(appended)
    return appended
  }

  /** Every document's latest row that is not a tombstone */
  private currentRows(): Row[] {
    return [...this.history.values()]
      .map((rows) => rows[rows.length - 1])
      .filter((row): row is Row => row !== undefined && row.status !== 'deleted')
  }

  async exists(): Promise<boolean> {
    return true
  }
  async read(): Promise<string> {
    return ''
  }
  async getMetadata(): Promise<{ size: number; lastModified: Date }> {
    return { size: 0, lastModified: new Date(0) }
  }
  async listSlugs(): Promise<string[]> {
    return [...new Set(this.currentRows().map((row) => row.slug))]
  }

  async writeContent(data: WriteContentData, changedBy?: string): Promise<void> {
    const locale = data.locale ?? this.defaultLocale
    const previous = this.latest(data.collection, data.slug, locale)
    if (data.expectedVersion !== undefined && data.expectedVersion !== (previous?.version ?? 0))
      throw new ContentWriteConflict(previous?.version ?? 0, data.expectedVersion)
    const version = (previous?.version ?? 0) + 1
    const live = resolveLiveVersion(liveOnWrite(data.publication), version, previous?.live ?? null)
    this.append({
      collection: data.collection,
      slug: data.slug,
      locale,
      status: storedStatus(data.publication, live, previous?.status),
      ...structuredClone(authoredMetadata(data)),
      fields: structuredClone(data.fields),
      body: data.body,
      changedBy: changedBy ?? null,
      live,
    })
  }

  async deleteContent(
    collection: string,
    slug: string,
    locale?: string,
    changedBy?: string,
  ): Promise<void> {
    const row = this.latest(collection, slug, locale ?? this.defaultLocale)
    if (!row || row.status === 'deleted') return
    this.append({ ...row, status: 'deleted', changedBy: changedBy ?? null, live: null })
  }

  async getContent(
    collection: string,
    slug: string,
    locale?: string,
  ): Promise<ContentDocument | null> {
    const row = this.latest(collection, slug, locale ?? this.defaultLocale)
    return row && row.status !== 'deleted' ? toDocument(row) : null
  }

  async getPublished(
    collection: string,
    slug: string,
    locale?: string,
  ): Promise<ContentDocument | null> {
    const k = key(collection, slug, locale ?? this.defaultLocale)
    const rows = this.history.get(k) ?? []
    const live = rows[rows.length - 1]?.live
    const row = rows.find((candidate) => candidate.version === live)
    return row ? toDocument(row) : null
  }

  /** Every statement `query` was called with, for tests that count reads */
  readonly queries: ContentQuery[] = []

  async query<P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>> {
    this.queries.push(spec)
    const { match } = spec
    const rows = spec.state === 'current' ? this.currentRows() : this.liveRows()
    const wanted = rows
      .filter(
        (row) =>
          (!spec.collections || spec.collections.includes(row.collection)) &&
          (!spec.locale || row.locale === spec.locale) &&
          (spec.state !== 'current' ||
            !spec.status ||
            statusOf(row.status, row.live) === spec.status) &&
          (!match || matches(row, match.text, match.in)),
      )
      .sort(compareRows(spec.sort))
    const start = spec.offset ?? 0
    const page = wanted.slice(start, spec.limit === undefined ? undefined : start + spec.limit)
    const items = page.map((row) => {
      const item = project(toDocument(row), spec.projection)
      const snippet = match ? snippetOf(row, match.text, match.in) : undefined
      return snippet === undefined ? item : { ...item, snippet }
    })
    return {
      items: items as QueryPage<P>['items'],
      hasMore: spec.limit !== undefined && wanted.length > start + spec.limit,
    }
  }

  /** The live version of every document that has one */
  private liveRows(): Row[] {
    return this.currentRows().flatMap((last) => {
      const row = this.history
        .get(key(last.collection, last.slug, last.locale))
        ?.find((candidate) => candidate.version === last.live)
      return row ? [row] : []
    })
  }

  async listVersions(collection: string, slug: string, locale?: string): Promise<DocumentMeta[]> {
    const rows = this.history.get(key(collection, slug, locale ?? this.defaultLocale)) ?? []
    return rows.map((row) => toDocument(row).meta).reverse()
  }

  async getVersion(
    collection: string,
    slug: string,
    version: number,
    locale?: string,
  ): Promise<ContentDocument | null> {
    const rows = this.history.get(key(collection, slug, locale ?? this.defaultLocale)) ?? []
    const row = rows.find((candidate) => candidate.version === version)
    return row ? toDocument(row) : null
  }

  async restoreVersion(): Promise<boolean> {
    return false
  }

  async getRuntimeSchema(collection: string): Promise<RuntimeSchemaDefinition | null> {
    return this.runtimeSchemas.get(collection) ?? null
  }

  async saveRuntimeSchema(collection: string, schema: RuntimeSchemaDefinition): Promise<void> {
    this.runtimeSchemas.set(collection, schema)
  }

  /** Seed a document as a new version: published publishes it, archived archives it, draft saves it */
  async seed(
    doc: Partial<AuthoredMetadata> & {
      collection: string
      slug: string
      locale?: string
      fields: Record<string, unknown>
      body?: string
    },
    status: ContentStatus,
    changedBy = 'editor:author@example.com',
  ): Promise<ContentDocument> {
    const locale = doc.locale ?? this.defaultLocale
    const publication = PUBLICATION_OF_STATUS[status]
    const data = { ...doc, locale, body: doc.body ?? '' }
    await this.writeContent(publication ? { ...data, publication } : data, changedBy)
    return (await this.getContent(doc.collection, doc.slug, locale)) as ContentDocument
  }
}

/** Site settings in memory */
export class MemorySettings implements ISiteSettingsAdapter {
  readonly values = new Map<string, string>()
  async getSetting(k: string): Promise<string | null> {
    return this.values.get(k) ?? null
  }
  async setSetting(k: string, value: string): Promise<void> {
    this.values.set(k, value)
  }
  async getAllSettings(): Promise<Record<string, string>> {
    return Object.fromEntries(this.values)
  }
}

/** SEO configuration in memory */
export class MemorySeoConfigs implements ISeoConfigAdapter {
  readonly configs = new Map<string, SeoConfig>()
  async getConfig(id: string): Promise<SeoConfig | null> {
    return this.configs.get(id) ?? null
  }
  async saveConfig(config: Omit<SeoConfig, 'createdAt' | 'updatedAt'>): Promise<void> {
    const at = new Date().toISOString()
    this.configs.set(config.id, { ...structuredClone(config), createdAt: at, updatedAt: at })
  }
  async deleteConfig(id: string): Promise<void> {
    this.configs.delete(id)
  }
  async listConfigs(scope?: SeoConfigScope): Promise<SeoConfig[]> {
    return [...this.configs.values()].filter((config) => !scope || config.scope === scope)
  }
  async listConfigsByPrefix(prefix: string): Promise<SeoConfig[]> {
    return [...this.configs.values()].filter((config) => config.id.startsWith(prefix))
  }
  async deleteAllConfigs(): Promise<number> {
    const count = this.configs.size
    this.configs.clear()
    return count
  }
}

/** Advisory locks in memory */
export class MemoryLocks implements ILockAdapter {
  readonly locks = new Map<string, ContentLock>()
  async getLock(collection: string, slug: string, locale: string): Promise<ContentLock | null> {
    return this.locks.get(key(collection, slug, locale)) ?? null
  }
  async acquireLock(
    collection: string,
    slug: string,
    locale: string,
    lockedBy: string,
    expiresAt: string,
  ): Promise<void> {
    const lockedAt = new Date().toISOString()
    this.locks.set(key(collection, slug, locale), {
      collection,
      slug,
      locale,
      lockedBy,
      lockedAt,
      expiresAt,
    })
  }
  async releaseLock(collection: string, slug: string, locale: string): Promise<void> {
    this.locks.delete(key(collection, slug, locale))
  }
  async listLocks(): Promise<ContentLock[]> {
    const now = Date.now()
    return [...this.locks.values()].filter((lock) => new Date(lock.expiresAt).getTime() > now)
  }
}
