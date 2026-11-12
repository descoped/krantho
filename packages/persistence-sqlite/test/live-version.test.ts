import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteCheckpointAdapter } from '../src/checkpoints.js'
import { v010ContentLiveVersion } from '../src/migrations/v010-content-live-version.js'
import { SqliteRetentionAdapter } from '../src/retention-adapter.js'
import { SQLiteAdapter } from '../src/sqlite-adapter.js'

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('SQLiteAdapter live version', () => {
  let adapter: SQLiteAdapter

  beforeEach(() => {
    adapter = new SQLiteAdapter(':memory:', { defaultLocale: 'en' })
  })

  afterEach(() => {
    adapter.close()
  })

  type Publication = 'publish' | 'unpublish' | 'archive'

  async function save(
    slug: string,
    title: string,
    publication?: Publication,
    target: { collection?: string; locale?: string } = {},
  ): Promise<void> {
    await adapter.writeContent({
      collection: target.collection ?? 'pages',
      slug,
      fields: { title },
      body: `# ${title}`,
      ...(publication ? { publication } : {}),
      ...(target.locale ? { locale: target.locale } : {}),
    })
  }

  async function liveTitle(slug: string, collection = 'pages', locale?: string): Promise<unknown> {
    const doc = await adapter.getPublished(collection, slug, locale)
    return doc?.fields['title'] ?? null
  }

  async function meta(
    slug: string,
  ): Promise<{ version: number; liveVersion: number | null; status: string } | null> {
    const doc = await adapter.getContent('pages', slug)
    return doc
      ? { version: doc.meta.version, liveVersion: doc.meta.liveVersion, status: doc.meta.status }
      : null
  }

  it('never shows a document that was never published', async () => {
    await save('home', 'Draft only')

    expect(await liveTitle('home')).toBeNull()
    expect(await meta('home')).toEqual({ version: 1, liveVersion: null, status: 'draft' })
  })

  it('keeps the live version when a published document is saved', async () => {
    await save('home', 'Published', 'publish')
    await save('home', 'Edited')

    expect(await liveTitle('home')).toBe('Published')
    expect((await adapter.getContent('pages', 'home'))?.fields['title']).toBe('Edited')
    expect(await meta('home')).toEqual({ version: 2, liveVersion: 1, status: 'published' })
  })

  it('makes the written version live when it is published', async () => {
    await save('home', 'First', 'publish')
    await save('home', 'Second')
    await save('home', 'Second', 'publish')

    const live = await adapter.getPublished('pages', 'home')
    expect(live?.fields['title']).toBe('Second')
    expect(live?.meta.status).toBe('published')
    expect(await meta('home')).toEqual({ version: 3, liveVersion: 3, status: 'published' })
  })

  it('takes the document offline when it is unpublished or archived', async () => {
    await save('home', 'Live', 'publish')
    await save('home', 'Live', 'unpublish')
    expect(await liveTitle('home')).toBeNull()
    expect((await meta('home'))?.status).toBe('draft')

    await save('about', 'Live', 'publish')
    await save('about', 'Live', 'archive')
    expect(await liveTitle('about')).toBeNull()
    expect((await adapter.getContent('pages', 'about'))?.meta.status).toBe('archived')
  })

  it('keeps an archived document archived and offline when it is saved', async () => {
    await save('home', 'Live', 'publish')
    await save('home', 'Gone', 'archive')
    await save('home', 'Edited while archived')

    expect(await liveTitle('home')).toBeNull()
    expect((await meta('home'))?.status).toBe('archived')
  })

  it('keeps publication state in framework metadata', async () => {
    await adapter.writeContent({
      collection: 'pages',
      slug: 'home',
      fields: { title: 'Home', status: 'draft' },
      body: '',
      publication: 'publish',
    })
    await adapter.writeContent({
      collection: 'pages',
      slug: 'home',
      fields: { title: 'Home edited', status: 'draft' },
      body: '',
    })

    expect((await adapter.getContent('pages', 'home'))?.meta.status).toBe('published')
    expect((await adapter.getPublished('pages', 'home'))?.meta.status).toBe('published')
  })

  it('takes the document offline when it is deleted, and a new draft stays offline', async () => {
    await save('home', 'Live', 'publish')
    await adapter.deleteContent('pages', 'home')
    expect(await liveTitle('home')).toBeNull()

    await save('home', 'Recreated draft')
    expect(await liveTitle('home')).toBeNull()
    expect((await meta('home'))?.status).toBe('draft')
  })

  it('resolves the same slug in two collections and two locales separately', async () => {
    await save('intro', 'Page', 'publish')
    await save('intro', 'Post', 'publish', { collection: 'blog' })
    await save('intro', 'Side', 'publish', { locale: 'no' })
    await save('intro', 'Side draft', undefined, { locale: 'no' })

    expect(await liveTitle('intro', 'pages')).toBe('Page')
    expect(await liveTitle('intro', 'blog')).toBe('Post')
    expect(await liveTitle('intro', 'pages', 'no')).toBe('Side')
  })

  it('lets an imported file decide by its status', async () => {
    await adapter.upsertFromFile('pages', 'home', { title: 'From file' }, 'body', '', {}, 'home.md')
    expect(await liveTitle('home')).toBe('From file')

    await adapter.upsertFromFile(
      'pages',
      'home',
      { title: 'Now a draft', status: 'draft' },
      'body',
      '',
      {},
      'home.md',
    )
    expect(await liveTitle('home')).toBeNull()

    await adapter.upsertFromFile(
      'pages',
      'home',
      { title: 'Archived', status: 'archived' },
      'body',
      '',
      {},
      'home.md',
    )
    expect((await meta('home'))?.status).toBe('archived')
  })

  it('restores a version as a save: the live version stays until it is published', async () => {
    await save('home', 'V1', 'publish')
    await save('home', 'V2')
    await save('home', 'V2', 'publish')

    await adapter.restoreVersion('pages', 'home', 1)
    expect(await liveTitle('home')).toBe('V2')
    expect((await adapter.getContent('pages', 'home'))?.fields['title']).toBe('V1')
    expect(await meta('home')).toEqual({ version: 4, liveVersion: 3, status: 'published' })
  })

  it('lists documents by publication state', async () => {
    await save('live', 'Live', 'publish')
    await save('ahead', 'Ahead', 'publish')
    await save('ahead', 'Ahead edited')
    await save('draft', 'Draft')
    await save('gone', 'Gone', 'archive')

    const slugs = async (status: 'draft' | 'published' | 'archived'): Promise<string[]> =>
      (
        await adapter.query({
          state: 'current',
          status,
          projection: 'meta',
          collections: ['pages'],
          sort: 'slug',
        })
      ).items.map((meta) => meta.slug)
    expect(await slugs('published')).toEqual(['ahead', 'live'])
    expect(await slugs('draft')).toEqual(['draft'])
    expect(await slugs('archived')).toEqual(['gone'])
  })

  it('lists the live version of each document, filtered by locale', async () => {
    await save('home', 'Home', 'publish')
    await save('home', 'Home draft')
    await save('about', 'About draft')
    await save('contact', 'Contact', 'publish')
    await save('home', 'Hjem', 'publish', { locale: 'no' })

    const published = (locale?: string) =>
      adapter.query({
        state: 'published',
        projection: 'full',
        collections: ['pages'],
        locale,
        sort: 'slug',
      })
    const english = (await published('en')).items
    expect(english.map((doc) => doc.fields['title'])).toEqual(['Contact', 'Home'])
    expect((await published()).items).toHaveLength(3)
  })

  it('reads a draft saved under the earlier rules on top of a live version as published', async () => {
    await save('home', 'Live', 'publish')
    adapter.database
      .prepare(
        `INSERT INTO content (id, collection, slug, locale, version, is_current, status, fields, body, live_version)
         VALUES ('old-draft', 'pages', 'home', 'en', 2, 0, 'draft', '{"title":"Old draft"}', '', 1)`,
      )
      .run()
    adapter.database.prepare("UPDATE content SET is_current = 0 WHERE id != 'old-draft'").run()
    adapter.database.prepare("UPDATE content SET is_current = 1 WHERE id = 'old-draft'").run()

    expect(await meta('home')).toEqual({ version: 2, liveVersion: 1, status: 'published' })
  })

  it('restores the live version with a checkpoint', async () => {
    const checkpoints = new SqliteCheckpointAdapter(adapter.database)
    await save('home', 'Before', 'publish')
    await pause(5)
    const checkpoint = await checkpoints.createCheckpoint('before')
    await pause(5)
    await save('home', 'Before', 'unpublish')
    expect(await liveTitle('home')).toBeNull()

    await checkpoints.restoreCheckpoint(checkpoint.version)
    expect(await liveTitle('home')).toBe('Before')
  })

  it('never purges the live version', async () => {
    await save('home', 'Live', 'publish')
    for (let i = 0; i < 5; i++) await save('home', `Draft ${i}`)

    await new SqliteRetentionAdapter(adapter.database).purgeVersions(2)

    expect(await liveTitle('home')).toBe('Live')
    const versions = await adapter.listVersions('pages', 'home')
    expect(versions.map((v) => v.version)).toEqual([6, 1])
  })
})

describe('v010 live-version backfill', () => {
  let adapter: SQLiteAdapter

  beforeEach(() => {
    adapter = new SQLiteAdapter(':memory:', { defaultLocale: 'en' })
  })

  afterEach(() => {
    adapter.close()
  })

  function insert(slug: string, version: number, status: string, current: boolean): void {
    adapter.database
      .prepare(
        `INSERT INTO content (id, collection, slug, locale, version, is_current, status, fields, body, deleted_at)
         VALUES (?, 'pages', ?, 'en', ?, ?, ?, ?, '', ?)`,
      )
      .run(
        `${slug}-${version}`,
        slug,
        version,
        current ? 1 : 0,
        status,
        JSON.stringify({ title: `${slug} v${version}` }),
        status === 'deleted' ? new Date().toISOString() : null,
      )
  }

  it('keeps the latest published version live and never resurrects one from before a deletion', async () => {
    adapter.database.exec('ALTER TABLE content DROP COLUMN live_version')
    // home: published, then drafts on top — stays live on its last publish
    insert('home', 1, 'published', false)
    insert('home', 2, 'draft', false)
    insert('home', 3, 'published', false)
    insert('home', 4, 'draft', true)
    // old: published, deleted, recreated as a draft — not live
    insert('old', 1, 'published', false)
    insert('old', 2, 'deleted', false)
    insert('old', 3, 'draft', true)
    // never: drafts only — not live
    insert('never', 1, 'draft', true)

    v010ContentLiveVersion.apply(adapter.database)

    expect((await adapter.getPublished('pages', 'home'))?.fields['title']).toBe('home v3')
    expect(await adapter.getPublished('pages', 'old')).toBeNull()
    expect(await adapter.getPublished('pages', 'never')).toBeNull()
  })
})
