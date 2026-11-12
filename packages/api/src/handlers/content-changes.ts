import { posix, relative, sep } from 'node:path'
import {
  type ContentDocument,
  type ContentManifestRecord,
  type ContentSummary,
  canGetContent,
  canReadPublished,
  repositoryFile,
} from '@krantho/persistence'
import { type Collection, documentChecksum } from '@krantho/schema'
import { requireRole } from '../permissions.js'
import type { ApiContext, ApiHandler } from '../types.js'
import { parsePositiveInt } from '../validators.js'

/**
 * `GET /api/changes` — what production's editors changed since the last content import, as the
 * repository files a pull writes. Published content only: a draft stays in the database until
 * it is published, so a pull never publishes anything.
 *
 * A document is a change when the checksum of its live version differs from the checksum the
 * database took from the repository's file at the last import (`content_manifest`). Only
 * documents whose live version was not imported from a file are read in full, so a site that
 * few people edit reads little.
 */

/** One file a pull writes, changes or removes */
export interface ContentChange {
  action: 'add' | 'edit' | 'delete'
  collection: string
  slug: string
  locale: string
  /** The file's path relative to the content directory, with forward slashes */
  path: string
  /** The checksum the database took from the repository's file, null for a new document */
  baselineChecksum: string | null
  /** The checksum of production's version, null for a deletion */
  checksum: string | null
  /** The file to write, null for a deletion */
  content: string | null
}

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

/** What to look at in a collection: a live document an editor changed, or a file production has no live document for */
type Work = { kind: 'live'; summary: ContentSummary } | { kind: 'missing'; slug: string }

/** A collection's directory relative to the content directory, with forward slashes */
function directoryKey(contentDir: string, collection: Collection): string {
  return relative(contentDir, collection.directory ?? '')
    .split(sep)
    .join('/')
}

/** The path of a collection's file for a slug, as the content migration keys it */
function fileKey(contentDir: string, collection: Collection, slug: string): string {
  return posix.join(directoryKey(contentDir, collection), `${slug}.md`)
}

/**
 * A cursor names the collection and the work item to continue from. The work is read again
 * for every page, so an edit between two pages can make one item repeat or be skipped; the
 * next pull lists it.
 */
function parseCursor(value: string | undefined): { collection: number; item: number } {
  const match = /^(\d+)\.(\d+)$/.exec(value ?? '')
  return match
    ? { collection: Number(match[1]), item: Number(match[2]) }
    : { collection: 0, item: 0 }
}

function fieldOrder(collection: Collection): readonly string[] {
  return Object.keys(collection.schema.shape)
}

/** The work for one collection: edited live documents, and baseline files with nothing live */
async function collectionWork(
  ctx: ApiContext,
  collection: Collection,
  manifest: ContentManifestRecord,
): Promise<Work[]> {
  const adapter = ctx.adapter
  if (!canReadPublished(adapter)) return []
  const locale = ctx.config.site.defaultLocale
  const { items: live } = await adapter.query({
    state: 'published',
    projection: 'summary',
    collections: [collection.name],
    locale,
  })
  const work: Work[] = live
    .filter((summary) => summary.meta.source !== 'filesystem')
    .map((summary) => ({ kind: 'live', summary }))

  const liveSlugs = new Set(live.map((summary) => summary.meta.slug))
  const prefix = `${directoryKey(ctx.config.paths.contentDir, collection)}/`
  for (const key of Object.keys(manifest.fileChecksums)) {
    const name = key.startsWith(prefix) ? key.slice(prefix.length) : ''
    if (!name.endsWith('.md') || name.includes('/')) continue
    const slug = name.slice(0, -3)
    if (!liveSlugs.has(slug)) work.push({ kind: 'missing', slug })
  }
  return work
}

function fileOf(collection: Collection, document: ContentDocument): string {
  return repositoryFile({
    fields: document.fields,
    body: document.body,
    metadata: document.metadata,
    defaults: document.defaults,
    status: 'published',
    fieldOrder: fieldOrder(collection),
  })
}

/** The change for one work item, or null when production agrees with the repository */
async function changeOf(
  ctx: ApiContext,
  collection: Collection,
  manifest: ContentManifestRecord,
  work: Work,
): Promise<ContentChange | null> {
  const adapter = ctx.adapter
  if (!canGetContent(adapter) || !canReadPublished(adapter)) return null
  const locale = ctx.config.site.defaultLocale
  const slug = work.kind === 'live' ? work.summary.meta.slug : work.slug
  const path = fileKey(ctx.config.paths.contentDir, collection, slug)
  const baseline = manifest.fileChecksums[path] ?? null
  const base = { collection: collection.name, slug, locale, path, baselineChecksum: baseline }

  const document =
    work.kind === 'live'
      ? await adapter.getPublished(collection.name, slug, locale)
      : await adapter.getContent(collection.name, slug, locale)
  if (!document || document.meta.status === 'deleted') {
    return baseline === null ? null : { ...base, action: 'delete', checksum: null, content: null }
  }
  // A document that is not live (unpublished, or a draft) stays in the database: its text is
  // never read out, and the repository keeps the file it has
  if (work.kind === 'missing') return null
  const checksum = documentChecksum(document)
  if (checksum === baseline) return null
  return {
    ...base,
    action: baseline === null ? 'add' : 'edit',
    checksum,
    content: fileOf(collection, document),
  }
}

function pageLimit(value: string | undefined): number {
  return Math.min(parsePositiveInt(value) ?? DEFAULT_LIMIT, MAX_LIMIT)
}

export const contentChanges: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied
  const migration = ctx.contentMigrationAdapter
  if (!migration || !canReadPublished(ctx.adapter) || !canGetContent(ctx.adapter)) {
    return {
      status: 501,
      body: { error: 'This site cannot compare its content with a repository' },
    }
  }
  const manifest = await migration.getContentManifest()
  if (!manifest) {
    return { status: 409, body: { error: 'The database has no content import to compare with' } }
  }

  const only = req.query['collection']
  const collections = [...ctx.contentConfig.collections.values()].filter(
    (collection) => collection.directory && (only === undefined || collection.name === only),
  )
  if (only !== undefined && collections.length === 0) {
    return { status: 400, body: { error: `No collection ${only} is kept in files` } }
  }

  const limit = pageLimit(req.query['limit'])
  const cursor = parseCursor(req.query['cursor'])
  const changes: ContentChange[] = []
  let looked = 0
  for (let c = cursor.collection; c < collections.length; c++) {
    const collection = collections[c]
    if (!collection) break
    const work = await collectionWork(ctx, collection, manifest)
    for (let i = c === cursor.collection ? cursor.item : 0; i < work.length; i++) {
      if (looked >= limit) {
        return respond(manifest, ctx, changes, `${c}.${i}`)
      }
      looked++
      const item = work[i]
      const change = item ? await changeOf(ctx, collection, manifest, item) : null
      if (change) changes.push(change)
    }
  }
  return respond(manifest, ctx, changes, null)
}

function respond(
  manifest: ContentManifestRecord,
  ctx: ApiContext,
  changes: ContentChange[],
  next: string | null,
) {
  return {
    status: 200,
    headers: { 'cache-control': 'no-store' },
    body: {
      baseline: {
        commit: manifest.repoCommit,
        repoVersion: manifest.repoVersion,
        importedAt: manifest.importedAt,
      },
      defaultLocale: ctx.config.site.defaultLocale,
      changes,
      next,
    },
  }
}
