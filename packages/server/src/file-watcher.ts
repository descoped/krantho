import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { ApiHandlers } from '@krantho/api'
import {
  type Collection,
  type ContentConfig,
  documentChecksum,
  parseRepositoryContent,
  resolveCollectionContract,
} from '@krantho/schema'
import matter from 'gray-matter'
import type { ZodObject, ZodRawShape } from 'zod'
import type { ImportableAdapter } from './import.js'

type FsCollection = Collection<ZodObject<ZodRawShape>>

/** Parse a repository edit and save a draft through the common document write path. */
async function importFile(
  filePath: string,
  collection: FsCollection,
  adapter: ImportableAdapter,
  save: ApiHandlers['saveRepositoryDocument'],
): Promise<void> {
  const raw = await readFile(filePath, 'utf-8')
  const parsed = matter(raw)
  const fields = parsed.data as Record<string, unknown>

  // Validate against collection schema (parity with auto-import)
  const contract = resolveCollectionContract(
    collection,
    (await adapter.getRuntimeSchema?.(collection.name)) ?? null,
  )
  const result = parseRepositoryContent(
    collection,
    basename(filePath, '.md'),
    fields,
    parsed.content,
    collection.schema,
    contract,
  )
  if (!result.success) {
    console.warn(
      `[watch] Skipping ${collection.name}/${basename(filePath, '.md')}: schema validation failed`,
    )
    for (const issue of result.error.issues) {
      console.warn(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
    return
  }

  const body = parsed.content
  const slug = basename(filePath, '.md')

  const read = await adapter.getContent?.(collection.name, slug, result.data.locale)
  const current =
    result.data.locale !== undefined && read?.meta.locale !== result.data.locale ? null : read
  if (current && current.repositoryBasis?.checksum !== documentChecksum(current)) {
    console.warn(
      `[watch] ${collection.name}/${slug} has database edits; review an import before replacing them`,
    )
    return
  }
  if (current && documentChecksum(current) === documentChecksum(result.data)) return
  const saved = await save({
    collection: collection.name,
    slug,
    locale: result.data.locale,
    fields: result.data.fields,
    body,
    metadata: result.data.metadata,
    defaults: result.data.defaults,
    repositoryBasis: result.data.repositoryBasis,
    isNew: !current,
    expectedVersion: current?.meta.version ?? 0,
  })
  if (!saved.ok) throw new Error(`Repository edit rejected (${saved.response.status})`)
}

export interface FileWatcherOptions {
  contentConfig: ContentConfig
  adapter: ImportableAdapter
  saveDocument: ApiHandlers['saveRepositoryDocument']
}

/**
 * Start watching filesystem collection directories for changes.
 *
 * When a `.md` file is added or modified, it is parsed, validated against
 * the collection contract, and saved as a draft through the common document write
 * path. When a file is deleted, the document stays in the database until explicitly archived.
 *
 * Returns a cleanup function to stop watching.
 */
export async function startFileWatcher(options: FileWatcherOptions): Promise<() => void> {
  const { contentConfig, adapter, saveDocument } = options

  // Build directory → collection mapping for filesystem collections
  const dirToCollection = new Map<string, FsCollection>()
  for (const [, collection] of contentConfig.collections) {
    if (collection.source === 'filesystem' && collection.directory) {
      dirToCollection.set(collection.directory, collection)
    }
  }

  const dirs = [...dirToCollection.keys()]
  if (dirs.length === 0) return () => {}

  // Dynamic import so chokidar is only loaded when watching is enabled
  const { watch } = await import('chokidar')

  const watcher = watch(dirs, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })

  function findCollection(filePath: string): FsCollection | undefined {
    for (const [dir, col] of dirToCollection) {
      if (filePath.startsWith(dir + '/') || filePath === dir) return col
    }
    return undefined
  }

  function handleEvent(filePath: string, action: typeof importFile): void {
    if (!filePath.endsWith('.md')) return
    const collection = findCollection(filePath)
    if (!collection) return
    // A failed write is logged; a successful one is announced (onChange never throws)
    action(filePath, collection, adapter, saveDocument).then(
      () => undefined,
      (err: unknown) => {
        console.error(`[watch] Error processing ${filePath}:`, err)
      },
    )
  }

  watcher.on('add', (fp) => handleEvent(fp, importFile))
  watcher.on('change', (fp) => handleEvent(fp, importFile))
  watcher.on('error', (err) => console.error('[watch] File watcher error:', err))

  const watchedDirs = dirs.map((d) => basename(d)).join(', ')
  console.log(`[krantho] Watching filesystem collections: ${watchedDirs}`)

  return () => {
    void watcher.close()
  }
}
