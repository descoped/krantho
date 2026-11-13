import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderContent, slugOfFile } from '@krantho/core'
import {
  type ContentDocument,
  type ContentManifest,
  canGetContent,
  type DocumentMeta,
  type ICheckpointAdapter,
  type IContentMigrationAdapter,
  type IPersistenceAdapter,
  type ISiteSettingsAdapter,
  publicationOfFile,
} from '@krantho/persistence'
import {
  type ContentConfig,
  documentChecksum,
  type ParsedRepositoryContent,
  parseRepositoryContent,
  resolveCollectionContract,
} from '@krantho/schema'
import matter from 'gray-matter'
import { recordNewConflict, resolveConflictsOf } from './content-conflicts.js'
import { type ContentDateOf, contentDateKey, contentDateLookup } from './content-dates.js'
import type { ImportableAdapter } from './import.js'
import { autoImport } from './import.js'
import { CONTENT_MANIFEST_FILE } from './manifest.js'

/**
 * An adapter the migration can import into and read each document's current
 * version from; with `query` and `deleteContent` it also removes the documents
 * whose files left the repository
 */
export interface MigratableAdapter
  extends ImportableAdapter,
    Pick<IPersistenceAdapter, 'query' | 'deleteContent'> {
  getContent(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null>
}

/** What the migration did with one content file */
export type FileOutcome =
  /** New or changed in the repository, and not edited in Studio: imported */
  | 'imported'
  /** The database already holds the file's content */
  | 'unchanged'
  /** Edited in Studio while the file stayed the same: the editor's version stands */
  | 'kept'
  /** Changed in the repository and edited in Studio: recorded as a conflict */
  | 'conflict'
  /** Imported before and deleted in Studio since: stays deleted */
  | 'deleted'
  /** The file fails its collection's schema */
  | 'rejected'
  /** The file left the repository, and its document, never edited in Studio, was deleted */
  | 'removed'

/** Per-file migration detail */
export interface ImportDetail {
  collection: string
  slug: string
  outcome: FileOutcome
}

/** Result of running content migration on startup */
export interface ContentMigrationResult {
  action: 'skip' | 'full-import' | 'migrate'
  imported: number
  conflicts: number
  rejected: number
  /** Documents deleted because their files left the repository */
  removed: number
  checkpointVersion: number | null
  reason?: string | undefined
  details: ImportDetail[]
}

/** A content file read from the repository, ready to compare and import */
interface RepositoryFile {
  key: string
  collection: string
  slug: string
  filePath: string
  /** SHA-256 of the file as it is on disk — what the manifest records */
  fileChecksum: string
  /** Schema-validated fields, or null when the file fails its schema */
  fields: Record<string, unknown> | null
  /** Why the file fails its schema */
  issues: readonly string[]
  body: string
  document?: ParsedRepositoryContent | undefined
  status?: string | undefined
}

/**
 * Bring the database up to date with the repository's content on startup.
 *
 * Without `<contentDir>/manifest.json` (or a migration adapter) the content is
 * imported into an empty database only. With one, every deployment whose
 * manifest is newer than the database's compares each file with its document:
 * a new or changed file is imported, unless an editor changed the document in
 * Studio since — then the editor's version stands and a changed file is
 * recorded as a conflict. A document deleted in Studio stays deleted. A
 * document whose file left the repository is deleted, unless an editor changed
 * it in Studio or its collection's directory holds no files at all (a deployment
 * without the content is not a request to delete it).
 */
export async function runContentMigration(
  adapter: MigratableAdapter,
  contentConfig: ContentConfig,
  migrationAdapter: IContentMigrationAdapter | undefined,
  checkpointAdapter: ICheckpointAdapter | undefined,
  contentDir: string,
  defaultStatus: string = 'published',
): Promise<ContentMigrationResult> {
  const manifest = await loadManifest(contentDir)
  const dateOf = await contentDateLookup(contentDir)

  if (!manifest || !migrationAdapter) {
    const imported = await autoImport(adapter, contentConfig, dateOf, defaultStatus)
    return {
      action: imported > 0 ? 'full-import' : 'skip',
      imported,
      conflicts: 0,
      rejected: 0,
      removed: 0,
      checkpointVersion: null,
      reason: !manifest ? `No ${CONTENT_MANIFEST_FILE} found` : 'Migration adapter not configured',
      details: [],
    }
  }

  const dbVersion = await migrationAdapter.getContentManifestVersion()
  if (dbVersion !== null && dbVersion >= manifest.version) {
    return {
      action: 'skip',
      imported: 0,
      conflicts: 0,
      rejected: 0,
      removed: 0,
      checkpointVersion: null,
      reason: `DB version ${dbVersion} >= repo version ${manifest.version}`,
      details: [],
    }
  }

  const previous = (await migrationAdapter.getContentManifest())?.fileChecksums ?? {}
  const files = await readRepositoryFiles(adapter, contentConfig, contentDir)
  const planned = await planFiles(adapter, files, previous)
  const removals = await findRemovedDocuments(adapter, contentConfig, files)
  const checkpointVersion = await checkpointBeforeImport(
    adapter,
    checkpointAdapter,
    planned.some((p) => p.outcome === 'imported') || removals.length > 0,
    manifest.version,
  )
  await applyPlan(adapter, migrationAdapter, planned, dateOf, defaultStatus)
  const removed = await removeDocuments(adapter, removals)

  await migrationAdapter.saveContentManifest({
    id: 0,
    repoVersion: manifest.version,
    repoCommit: manifest.commit ?? null,
    importedAt: new Date().toISOString(),
    fileChecksums: knownFiles(planned),
  })

  const count = (outcome: FileOutcome): number =>
    planned.filter((p) => p.outcome === outcome).length
  return {
    action: dbVersion === null ? 'full-import' : 'migrate',
    imported: count('imported'),
    conflicts: count('conflict'),
    rejected: count('rejected'),
    removed: removed.length,
    checkpointVersion,
    details: [
      ...planned.map(({ file, outcome }) => ({
        collection: file.collection,
        slug: file.slug,
        outcome,
      })),
      ...removed.map((meta) => ({
        collection: meta.collection,
        slug: meta.slug,
        outcome: 'removed' as const,
      })),
    ],
  }
}

/** A file and what the migration does with it */
interface PlannedFile {
  file: RepositoryFile
  current: ContentDocument | null
  outcome: FileOutcome
}

async function planFiles(
  adapter: MigratableAdapter,
  files: readonly RepositoryFile[],
  previous: Readonly<Record<string, string>>,
): Promise<PlannedFile[]> {
  const planned: PlannedFile[] = []
  for (const file of files) {
    const read = await adapter.getContent(file.collection, file.slug, file.document?.locale)
    const current =
      file.document?.locale !== undefined && read?.meta.locale !== file.document.locale
        ? null
        : read
    planned.push({ file, current, outcome: decideFile(file, current, previous[file.key]) })
  }
  return planned
}

/**
 * What to do with one repository file, given its document's current version
 * and the file's checksum when the database last took the repository's
 * content (undefined: the database never saw this file).
 *
 * Content equal to a state the repository held (the document's basis, or what
 * the last deployment took) is not an edit: a document that carries the
 * repository's previous file, as one does after a pull of production's edits was
 * merged, is not reported as edited, and a file at that state is not reported as changed.
 *
 * A version an import wrote is not an edit either, whatever its checksum: nobody changed it since,
 * even when it predates the document's basis and contract. A restore copies the restored version's
 * source but always names who restored it, so only a version with no `changedBy` is an import's.
 */
export function decideFile(
  file: Pick<RepositoryFile, 'fileChecksum' | 'fields' | 'body' | 'document'>,
  current: ContentDocument | null,
  previousChecksum: string | undefined,
): FileOutcome {
  if (!file.fields) return 'rejected'
  if (!current) return previousChecksum === undefined ? 'imported' : 'deleted'
  const repo = documentChecksum({ ...file.document, fields: file.fields, body: file.body })
  const database = documentChecksum(current)
  if (repo === database) return 'unchanged'
  if (current.meta.source === 'filesystem' && current.meta.changedBy === null) return 'imported'
  const basis = current.repositoryBasis?.checksum ?? previousChecksum
  if (basis === undefined) return 'conflict'
  const heldByRepository = (checksum: string): boolean =>
    checksum === basis || checksum === previousChecksum
  const repositoryChanged = !heldByRepository(repo)
  const databaseChanged = !heldByRepository(database)
  if (repositoryChanged && databaseChanged) return 'conflict'
  return repositoryChanged ? 'imported' : 'kept'
}

/** A checkpoint before an import writes to, or deletes from, a database that already holds content */
async function checkpointBeforeImport(
  adapter: MigratableAdapter,
  checkpointAdapter: ICheckpointAdapter | undefined,
  writes: boolean,
  version: number,
): Promise<number | null> {
  if (!checkpointAdapter) return null
  if (!writes) return null
  if ((await adapter.listSlugs()).length === 0) return null
  const checkpoint = await checkpointAdapter.createCheckpoint(
    `pre-content-migration-v${version}`,
    'pre-migration',
  )
  return checkpoint.version
}

async function applyPlan(
  adapter: MigratableAdapter,
  migrationAdapter: IContentMigrationAdapter,
  planned: PlannedFile[],
  dateOf: ContentDateOf,
  defaultStatus: string,
): Promise<void> {
  const migrationId = (await migrationAdapter.getContentManifest())?.id ?? 0
  // Read once: each document is planned once, so no conflict this run touches is read again
  const open = await migrationAdapter.listConflicts()
  for (const plan of planned) {
    const { file, current } = plan
    if (plan.outcome === 'imported' && file.fields) {
      try {
        await importFile(adapter, file, file.fields, dateOf, defaultStatus, current?.meta.version)
      } catch (err: unknown) {
        console.warn(`[content-migration] Failed to import ${file.key}:`, err)
        plan.outcome = 'rejected'
        continue
      }
      await resolveConflictsOf(migrationAdapter, open, {
        collection: file.collection,
        slug: file.slug,
        locale: file.document?.locale ?? current?.meta.locale,
      })
    } else if (plan.outcome === 'conflict' && file.fields && current) {
      await recordNewConflict(migrationAdapter, open, {
        migrationId,
        collection: file.collection,
        slug: file.slug,
        locale: current.meta.locale,
        repoChecksum: documentChecksum({ ...file.document, fields: file.fields, body: file.body }),
        dbChecksum: documentChecksum(current),
      })
    } else if (plan.outcome === 'rejected') {
      console.warn(`[import] Skipping ${file.key}: schema validation failed`)
      for (const issue of file.issues) console.warn(`  - ${issue}`)
    }
  }
}

async function importFile(
  adapter: MigratableAdapter,
  file: RepositoryFile,
  fields: Record<string, unknown>,
  dateOf: ContentDateOf,
  defaultStatus: string,
  /** The current version it replaces; none for a new document or one deleted before */
  expectedVersion: number | undefined,
): Promise<void> {
  const { html, sections } = await renderContent(fields, file.body, { atNotation: false })
  await adapter.upsertFromFile(
    file.collection,
    file.slug,
    fields,
    file.body,
    html,
    sections,
    file.filePath,
    file.document?.locale,
    dateOf(file.filePath),
    {
      ...file.document,
      publication: publicationOfFile(file.status ?? defaultStatus),
      expectedVersion,
    },
  )
}

/**
 * The documents an import wrote and nobody changed since whose files are gone:
 * in a collection whose directory still holds files, no file with the
 * document's slug (in its locale, or without one) is left
 */
async function findRemovedDocuments(
  adapter: MigratableAdapter,
  contentConfig: ContentConfig,
  files: readonly RepositoryFile[],
): Promise<DocumentMeta[]> {
  if (!adapter.query || !adapter.deleteContent) return []
  const collections = [...contentConfig.collections.values()]
    .filter((c) => c.directory && files.some((f) => f.collection === c.name))
    .map((c) => c.name)
  if (collections.length === 0) return []
  const { items } = await adapter.query({ state: 'current', collections, projection: 'meta' })
  const hasFile = (meta: DocumentMeta): boolean =>
    files.some(
      (f) =>
        f.collection === meta.collection &&
        f.slug === meta.slug &&
        (f.document?.locale === undefined || f.document.locale === meta.locale),
    )
  return items.filter(
    (meta) =>
      meta.source === 'filesystem' &&
      meta.changedBy === null &&
      meta.status !== 'deleted' &&
      !hasFile(meta),
  )
}

/** Delete each document whose file left the repository; returns the ones deleted */
async function removeDocuments(
  adapter: MigratableAdapter,
  removals: readonly DocumentMeta[],
): Promise<DocumentMeta[]> {
  const removed: DocumentMeta[] = []
  for (const meta of removals) {
    try {
      await adapter.deleteContent?.(meta.collection, meta.slug, meta.locale)
      removed.push(meta)
    } catch (err: unknown) {
      console.warn(`[content-migration] Failed to remove ${meta.collection}/${meta.slug}:`, err)
    }
  }
  return removed
}

/** The files the database now knows, by key: every file it holds or chose not to */
function knownFiles(planned: readonly PlannedFile[]): Record<string, string> {
  return Object.fromEntries(
    planned
      .filter((p) => p.outcome !== 'rejected')
      .map((p) => [
        p.file.key,
        p.outcome === 'conflict' || p.outcome === 'kept'
          ? (p.current?.repositoryBasis?.checksum ?? p.file.fileChecksum)
          : p.file.fileChecksum,
      ]),
  )
}

/** Every markdown file in each collection's directory, parsed and validated */
async function readRepositoryFiles(
  adapter: MigratableAdapter,
  contentConfig: ContentConfig,
  contentDir: string,
): Promise<RepositoryFile[]> {
  const files: RepositoryFile[] = []
  for (const [, collection] of contentConfig.collections) {
    if (!collection.directory) continue
    let entries: string[]
    try {
      entries = await readdir(collection.directory)
    } catch {
      continue
    }
    const contract = resolveCollectionContract(
      collection,
      (await adapter.getRuntimeSchema?.(collection.name)) ?? null,
    )
    for (const name of entries) {
      const slug = slugOfFile(collection, name)
      if (slug === null) continue
      const filePath = join(collection.directory, name)
      const raw = await readFile(filePath, 'utf-8')
      const parsed = matter(raw)
      const result = parseRepositoryContent(
        collection,
        slug,
        parsed.data,
        parsed.content,
        collection.schema,
        contract,
      )
      files.push({
        key: contentDateKey(contentDir, filePath),
        collection: collection.name,
        slug,
        filePath,
        fileChecksum: result.success
          ? documentChecksum(result.data)
          : createHash('sha256').update(raw).digest('hex'),
        document: result.success ? result.data : undefined,
        status: typeof parsed.data.status === 'string' ? parsed.data.status : undefined,
        fields: result.success ? result.data.fields : null,
        issues: result.success
          ? []
          : result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
        body: parsed.content,
      })
    }
  }
  return files
}

/** Read `<contentDir>/manifest.json`, or null when the build wrote none */
export async function loadManifest(contentDir: string): Promise<ContentManifest | null> {
  try {
    const raw = await readFile(join(contentDir, CONTENT_MANIFEST_FILE), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).version !== 'number' ||
      typeof (parsed as Record<string, unknown>).files !== 'object'
    ) {
      return null
    }
    return parsed as ContentManifest
  } catch {
    return null
  }
}

/** Canonical authored content checksum, independent of YAML spelling and key order. */
export function contentChecksum(fields: Record<string, unknown>, body: string): string {
  return documentChecksum({ fields, body })
}

/**
 * Import the repository's content into the database when it needs it (an
 * empty database, or a newer content manifest), logging what happened. Both
 * the API handler and the page loader run it on first use, so whichever a
 * fresh deployment serves first finds the content in place.
 *
 * @returns how many documents were imported
 */
export async function importRepositoryContent(
  adapter: IPersistenceAdapter,
  contentConfig: ContentConfig,
  migrationAdapter: IContentMigrationAdapter | undefined,
  checkpointAdapter: ICheckpointAdapter | undefined,
  contentDir: string,
  defaultStatus: string = 'published',
): Promise<number> {
  if (!('upsertFromFile' in adapter && 'listSlugs' in adapter && canGetContent(adapter))) return 0
  const result = await runContentMigration(
    adapter as unknown as MigratableAdapter,
    contentConfig,
    migrationAdapter,
    checkpointAdapter,
    contentDir,
    defaultStatus,
  )
  if (result.imported > 0 || result.conflicts > 0 || result.rejected > 0 || result.removed > 0) {
    const parts = [`[krantho] Content migration: ${result.action}`]
    parts.push(`${result.imported} imported`)
    if (result.removed > 0) parts.push(`${result.removed} removed`)
    if (result.conflicts > 0) parts.push(`${result.conflicts} conflicts`)
    if (result.rejected > 0) parts.push(`${result.rejected} rejected`)
    console.log(parts.join(', '))
  }
  return result.imported
}

/** The site setting that holds the last content version the site announced */
const ANNOUNCED_CONTENT_VERSION = 'content.announcedVersion'

/**
 * Whether the database holds a content version the site has not announced
 * yet, recording it as announced. The page loader can import a deployment's
 * content before the API handler starts, and only the handler can announce a
 * change, so it announces each new content version once, whoever imported it.
 */
export async function claimContentAnnouncement(
  migrationAdapter: IContentMigrationAdapter | undefined,
  settings: ISiteSettingsAdapter | undefined,
): Promise<boolean> {
  if (!migrationAdapter || !settings) return false
  const version = await migrationAdapter.getContentManifestVersion()
  if (version === null) return false
  if ((await settings.getSetting(ANNOUNCED_CONTENT_VERSION)) === String(version)) return false
  await settings.setSetting(ANNOUNCED_CONTENT_VERSION, String(version))
  return true
}
