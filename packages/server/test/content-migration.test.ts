import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  ContentConflict,
  ContentDocument,
  ContentManifestRecord,
  ContentQuery,
  IContentMigrationAdapter,
  ISiteSettingsAdapter,
  QueryItem,
  QueryPage,
  QueryProjection,
} from '@krantho/persistence'
import { SQLiteAdapter, SqliteContentMigrationAdapter } from '@krantho/persistence-sqlite'
import {
  compileContentContract,
  defineCollection,
  defineConfig,
  documentChecksum,
} from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  claimContentAnnouncement,
  contentChecksum,
  type MigratableAdapter,
  runContentMigration,
} from '../src/content-migration.js'
import { generateManifest } from '../src/manifest.js'

let contentDir: string

beforeEach(() => {
  contentDir = mkdtempSync(join(tmpdir(), 'krantho-migration-'))
  mkdirSync(join(contentDir, 'pages'))
})

afterEach(() => {
  rmSync(contentDir, { recursive: true, force: true })
})

function writePage(slug: string, title: string, body: string): void {
  writeFileSync(join(contentDir, 'pages', `${slug}.md`), `---\ntitle: ${title}\n---\n${body}`)
}

function sha(slug: string): string {
  const raw = readFileSync(join(contentDir, 'pages', `${slug}.md`), 'utf-8')
  const title = raw.split('\n')[1]?.slice(7) ?? ''
  const body = raw.split('---\n')[2] ?? ''
  const collection = contentConfig().collections.get('pages')!
  return documentChecksum({
    fields: { title },
    body,
    metadata: {},
    defaults: [],
    contract: compileContentContract(collection.archetype),
  })
}

const contentConfig = (): ReturnType<typeof defineConfig> =>
  defineConfig({
    collections: {
      pages: defineCollection({
        name: 'pages',
        source: 'filesystem',
        schema: z.object({ title: z.string() }),
        directory: join(contentDir, 'pages'),
      }),
    },
  })

/** A database of current documents, by slug; edited ones came from Studio */
function database(
  docs: Record<
    string,
    {
      title: string
      body: string
      edited?: boolean
      /** The repository content the document was last imported from, when it is not its own content */
      basis?: { title: string; body: string }
      /** Written by an import before documents carried a basis and a contract */
      legacy?: boolean
      /** Restored by an editor to an earlier version, whose source the restore copies */
      restored?: boolean
    }
  >,
): {
  adapter: MigratableAdapter
  imported: string[]
  deleted: string[]
} {
  const imported: string[] = []
  const deleted: string[] = []
  const current = new Map<string, ContentDocument>()
  for (const [slug, doc] of Object.entries(docs)) {
    current.set(slug, {
      meta: {
        collection: 'pages',
        slug,
        locale: 'en',
        version: 1,
        liveVersion: 1,
        status: 'published',
        source: doc.edited ? 'api' : 'filesystem',
        changedBy: doc.edited ? 'editor@example.com' : doc.restored ? 'restore:v1' : null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      fields: { title: doc.title },
      metadata: {},
      defaults: [],
      contract: doc.legacy
        ? null
        : compileContentContract(contentConfig().collections.get('pages')!.archetype),
      repositoryBasis:
        doc.legacy || (doc.edited && !doc.basis)
          ? null
          : {
              checksum: documentChecksum({
                fields: { title: (doc.basis ?? doc).title },
                body: (doc.basis ?? doc).body,
                metadata: {},
                defaults: [],
                contract: compileContentContract(
                  contentConfig().collections.get('pages')!.archetype,
                ),
              }),
              version: 1,
            },
      body: doc.body,
      html: '',
      sections: {},
    })
  }
  const adapter: MigratableAdapter = {
    listSlugs: async () => [...current.keys()],
    getContent: async (_collection, slug) => current.get(slug) ?? null,
    upsertFromFile: async (_collection, slug) => {
      imported.push(slug)
    },
    query: async <P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>> => ({
      items: [...current.values()]
        .filter((doc) => !spec.collections || spec.collections.includes(doc.meta.collection))
        .map((doc) => doc.meta as QueryItem<P>),
      hasMore: false,
    }),
    deleteContent: async (_collection, slug) => {
      deleted.push(slug)
    },
  }
  return { adapter, imported, deleted }
}

/** A migration record store holding `version` and the files it saw then */
function migrations(
  version: number | null,
  fileChecksums: Record<string, string> = {},
  open: readonly ContentConflict[] = [],
): IContentMigrationAdapter & {
  conflicts: string[]
  resolved: number[]
  saved: ContentManifestRecord[]
} {
  const conflicts: string[] = []
  const resolved: number[] = []
  const saved: ContentManifestRecord[] = []
  const record = (): ContentManifestRecord | null =>
    saved.at(-1) ??
    (version === null
      ? null
      : {
          id: 1,
          repoVersion: version,
          repoCommit: null,
          importedAt: '2026-01-01T00:00:00.000Z',
          fileChecksums,
        })
  return {
    conflicts,
    resolved,
    saved,
    getContentManifestVersion: async () => record()?.repoVersion ?? null,
    getContentManifest: async () => record(),
    saveContentManifest: async (manifest) => {
      saved.push(manifest)
    },
    listConflicts: async (): Promise<ContentConflict[]> => [...open],
    resolveConflict: async (id) => {
      resolved.push(id)
      return true
    },
    recordConflict: async (conflict) => {
      conflicts.push(conflict.slug)
    },
  }
}

/** An open conflict about a page */
function conflict(id: number, slug: string): ContentConflict {
  return {
    id,
    migrationId: 1,
    collection: 'pages',
    slug,
    locale: 'en',
    repoChecksum: 'repository checksum',
    dbChecksum: 'database checksum',
    resolved: false,
    resolvedAt: null,
    resolution: null,
  }
}

describe('runContentMigration', () => {
  it('imports into an empty database only, without a manifest', async () => {
    writePage('about', 'About', 'About us\n')
    const { adapter, imported } = database({ team: { title: 'Team', body: 'The team\n' } })

    const result = await runContentMigration(
      adapter,
      contentConfig(),
      migrations(null),
      undefined,
      contentDir,
    )
    expect(result.action).toBe('skip')
    expect(imported).toEqual([])
  })

  it('imports new and changed files into a database that holds content but no version', async () => {
    writePage('about', 'About', 'About us\n')
    writePage('team', 'Team', 'The whole team\n')
    writePage('news', 'News', 'What is new\n')
    await generateManifest(contentDir, 100)
    const { adapter, imported } = database({
      about: { title: 'About', body: 'About us\n' },
      team: { title: 'Team', body: 'The team\n' },
    })
    const store = migrations(null)

    const result = await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(result.action).toBe('full-import')
    expect(imported.sort()).toEqual(['news', 'team'])
    expect(store.saved.at(-1)?.repoVersion).toBe(100)
    expect(Object.keys(store.saved.at(-1)?.fileChecksums ?? {}).sort()).toEqual([
      'pages/about.md',
      'pages/news.md',
      'pages/team.md',
    ])
  })

  it('records a conflict for a changed file whose page an editor changed, and imports nothing', async () => {
    writePage('about', 'About', 'About us, rewritten\n')
    await generateManifest(contentDir, 200)
    const { adapter, imported } = database({
      about: { title: 'About', body: 'Edited in Studio\n', edited: true },
    })
    const store = migrations(100, { 'pages/about.md': 'checksum of the earlier file' })

    const result = await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(result.conflicts).toBe(1)
    expect(store.conflicts).toEqual(['about'])
    expect(imported).toEqual([])
  })

  it("keeps an editor's version while its file is unchanged", async () => {
    writePage('about', 'About', 'About us\n')
    await generateManifest(contentDir, 200)
    const { adapter, imported } = database({
      about: { title: 'About', body: 'Edited in Studio\n', edited: true },
    })
    const store = migrations(100, { 'pages/about.md': sha('about') })

    const result = await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(result.details).toEqual([{ collection: 'pages', slug: 'about', outcome: 'kept' }])
    expect(store.conflicts).toEqual([])
    expect(imported).toEqual([])
  })

  it("imports a repository edit over a page that carries the repository's previous file, as after a merged pull", async () => {
    // Production's edit was pulled into the repository and deployed: the database holds the
    // content the last deployment took, but the page's basis still names the file before it
    writePage('about', 'About', 'Pulled edit\n')
    const pulled = sha('about')
    writePage('about', 'About', 'Pulled edit, then a developer rewrote it\n')
    await generateManifest(contentDir, 300)
    const { adapter, imported } = database({
      about: {
        title: 'About',
        body: 'Pulled edit\n',
        edited: true,
        basis: { title: 'About', body: 'Original\n' },
      },
    })
    const store = migrations(200, { 'pages/about.md': pulled })

    const result = await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(result.details).toEqual([{ collection: 'pages', slug: 'about', outcome: 'imported' }])
    expect(store.conflicts).toEqual([])
    expect(imported).toEqual(['about'])
  })

  it("keeps an editor's newer version when the file is the one the last deployment took, whatever the page's basis", async () => {
    writePage('about', 'About', 'Pulled edit\n')
    await generateManifest(contentDir, 300)
    const { adapter, imported } = database({
      about: {
        title: 'About',
        body: 'Edited again after the pull\n',
        edited: true,
        basis: { title: 'About', body: 'Original\n' },
      },
    })
    const store = migrations(200, { 'pages/about.md': sha('about') })

    const result = await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(result.details[0]?.outcome).toBe('kept')
    expect(store.conflicts).toEqual([])
    expect(imported).toEqual([])
  })

  it('imports a changed file over a page an earlier import wrote before pages carried a basis and a contract', async () => {
    writePage('about', 'About', 'About us, rewritten\n')
    await generateManifest(contentDir, 200)
    const { adapter, imported } = database({
      about: { title: 'About', body: 'About us\n', legacy: true },
    })
    const store = migrations(100, { 'pages/about.md': 'checksum of the earlier file' })

    const result = await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(result.details).toEqual([{ collection: 'pages', slug: 'about', outcome: 'imported' }])
    expect(store.conflicts).toEqual([])
    expect(imported).toEqual(['about'])
  })

  it("keeps an editor's restore of an earlier imported version, though the restore copies its source", async () => {
    writePage('about', 'About', 'About us, rewritten\n')
    await generateManifest(contentDir, 200)
    const { adapter, imported } = database({
      about: { title: 'About', body: 'About us, first draft\n', legacy: true, restored: true },
    })
    const store = migrations(100, { 'pages/about.md': 'checksum of the earlier file' })

    const result = await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(result.details).toEqual([{ collection: 'pages', slug: 'about', outcome: 'conflict' }])
    expect(imported).toEqual([])
  })

  it('settles the open conflicts of a page it imports, and leaves those of other pages open', async () => {
    writePage('about', 'About', 'About us, rewritten\n')
    await generateManifest(contentDir, 200)
    const { adapter } = database({ about: { title: 'About', body: 'About us\n' } })
    const store = migrations(100, { 'pages/about.md': 'checksum of the earlier file' }, [
      conflict(7, 'about'),
      conflict(8, 'team'),
    ])

    await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(store.resolved).toEqual([7])
  })

  it('records a conflict once while it stays open across deployments', async () => {
    writePage('about', 'About', 'About us, rewritten\n')
    await generateManifest(contentDir, 200)
    const { adapter } = database({
      about: { title: 'About', body: 'Edited in Studio\n', edited: true },
    })
    const first = migrations(100, { 'pages/about.md': 'checksum of the earlier file' })
    await runContentMigration(adapter, contentConfig(), first, undefined, contentDir)
    expect(first.conflicts).toEqual(['about'])

    const edited = await adapter.getContent('pages', 'about')
    if (!edited) throw new Error('The edited page is missing')
    const open = {
      ...conflict(7, 'about'),
      repoChecksum: sha('about'),
      dbChecksum: documentChecksum(edited),
    }
    await generateManifest(contentDir, 300)
    const next = migrations(200, { 'pages/about.md': 'checksum of the earlier file' }, [open])
    const result = await runContentMigration(adapter, contentConfig(), next, undefined, contentDir)
    expect(result.conflicts).toBe(1)
    expect(next.conflicts).toEqual([])
  })

  it('records the commit the content was built from, and the checksums the database now holds', async () => {
    writePage('about', 'About', 'About us\n')
    const commit = 'c'.repeat(40)
    await generateManifest(contentDir, 200, commit)
    const { adapter } = database({ about: { title: 'About', body: 'About us\n' } })
    const store = migrations(100, { 'pages/about.md': 'an earlier checksum' })

    await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(store.saved.at(-1)).toMatchObject({
      repoVersion: 200,
      repoCommit: commit,
      fileChecksums: { 'pages/about.md': sha('about') },
    })
  })

  it('leaves a page deleted in Studio deleted', async () => {
    writePage('about', 'About', 'About us\n')
    await generateManifest(contentDir, 200)
    const { adapter, imported } = database({})
    const store = migrations(100, { 'pages/about.md': sha('about') })

    const result = await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(result.details[0]?.outcome).toBe('deleted')
    expect(imported).toEqual([])
  })

  it('deletes the pages whose files left the repository, and keeps those an editor changed', async () => {
    writePage('about', 'About', 'About us\n')
    await generateManifest(contentDir, 200)
    const { adapter, deleted } = database({
      about: { title: 'About', body: 'About us\n' },
      admin: { title: 'Admin', body: 'The old admin\n' },
      notes: { title: 'Notes', body: 'Written in Studio\n', edited: true },
    })

    const result = await runContentMigration(
      adapter,
      contentConfig(),
      migrations(100, { 'pages/about.md': sha('about') }),
      undefined,
      contentDir,
    )
    expect(deleted).toEqual(['admin'])
    expect(result.removed).toBe(1)
    expect(result.details).toContainEqual({
      collection: 'pages',
      slug: 'admin',
      outcome: 'removed',
    })
  })

  it('deletes nothing from a collection whose directory holds no files', async () => {
    await generateManifest(contentDir, 200)
    const { adapter, deleted } = database({ about: { title: 'About', body: 'About us\n' } })

    const result = await runContentMigration(
      adapter,
      contentConfig(),
      migrations(100),
      undefined,
      contentDir,
    )
    expect(deleted).toEqual([])
    expect(result.removed).toBe(0)
  })

  it('does nothing when the database already has the manifest version', async () => {
    writePage('about', 'About', 'About us, rewritten\n')
    await generateManifest(contentDir, 100)
    const { adapter, imported } = database({ about: { title: 'About', body: 'About us\n' } })

    const result = await runContentMigration(
      adapter,
      contentConfig(),
      migrations(100),
      undefined,
      contentDir,
    )
    expect(result.action).toBe('skip')
    expect(imported).toEqual([])
  })

  it('rejects a file that fails its schema, and does not remember it', async () => {
    writeFileSync(join(contentDir, 'pages', 'broken.md'), '---\nheading: No title\n---\nBody\n')
    await generateManifest(contentDir, 100)
    const { adapter, imported } = database({})
    const store = migrations(null)

    const result = await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    expect(result.rejected).toBe(1)
    expect(imported).toEqual([])
    expect(store.saved.at(-1)?.fileChecksums).toEqual({})
  })
})

describe('runContentMigration on SQLite', () => {
  it('deletes the page of a removed file, and imports the file again when it comes back', async () => {
    const adapter = new SQLiteAdapter(join(contentDir, 'content.db'), { defaultLocale: 'en' })
    const store = new SqliteContentMigrationAdapter(adapter.database)
    const deploy = async (version: number): Promise<void> => {
      await generateManifest(contentDir, version)
      await runContentMigration(adapter, contentConfig(), store, undefined, contentDir)
    }
    try {
      writePage('about', 'About', 'About us\n')
      writePage('admin', 'Admin', 'The old admin\n')
      await deploy(100)
      expect(await adapter.getContent('pages', 'admin')).not.toBeNull()

      rmSync(join(contentDir, 'pages', 'admin.md'))
      await deploy(200)
      expect(await adapter.getContent('pages', 'admin')).toBeNull()
      expect(await adapter.getContent('pages', 'about')).not.toBeNull()

      writePage('admin', 'Admin', 'The admin is back\n')
      await deploy(300)
      expect((await adapter.getContent('pages', 'admin'))?.body).toBe('The admin is back\n')
    } finally {
      adapter.database.close()
    }
  })
})

describe('contentChecksum', () => {
  it('is the same for equal content read from a file or the database', () => {
    const fromFile = { title: 'About', published: new Date('2026-01-02T03:04:05.000Z') }
    const fromDatabase = { published: '2026-01-02T03:04:05.000Z', title: 'About' }
    expect(contentChecksum(fromFile, 'Body\n')).toBe(contentChecksum(fromDatabase, 'Body\n'))
    expect(contentChecksum(fromFile, 'Body\n')).not.toBe(contentChecksum(fromFile, 'Other\n'))
  })
})

describe('claimContentAnnouncement', () => {
  function settings(): ISiteSettingsAdapter {
    const values = new Map<string, string>()
    return {
      getSetting: async (key) => values.get(key) ?? null,
      setSetting: async (key, value) => {
        values.set(key, value)
      },
      getAllSettings: async () => Object.fromEntries(values),
    }
  }

  it('announces each new content version once', async () => {
    const store = settings()
    expect(await claimContentAnnouncement(migrations(100), store)).toBe(true)
    expect(await claimContentAnnouncement(migrations(100), store)).toBe(false)
    expect(await claimContentAnnouncement(migrations(200), store)).toBe(true)
  })

  it('announces nothing before any content version', async () => {
    expect(await claimContentAnnouncement(migrations(null), settings())).toBe(false)
    expect(await claimContentAnnouncement(undefined, settings())).toBe(false)
  })
})
