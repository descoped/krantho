import type { QueryProjection } from '@krantho/persistence'
import type { Sql } from 'postgres'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { v010ContentLiveVersion } from '../src/migrations/v010-content-live-version.js'
import { PostgresAdapter } from '../src/postgres-adapter.js'
import { PostgresCheckpointAdapter } from '../src/postgres-checkpoints.js'
import { PostgresRetentionAdapter } from '../src/postgres-retention-adapter.js'

/**
 * Integration tests for the Postgres adapter, running against a real Postgres
 * instance started via testcontainers. Covers the same surface as the SQLite
 * adapter test suite plus Postgres-specific concerns (multi-locale deleteContent
 * regression, JSONB field access, timestamp conversion).
 *
 * Container lifecycle is managed by the vitest globalSetup file
 * `postgres-container-setup.ts`, which uses `.withReuse()` so a single
 * container is shared by every test file and persists across test runs.
 * Each test truncates the content + schema tables for isolation.
 */
describe('PostgresAdapter (integration)', () => {
  let sql: Sql
  let adapter: PostgresAdapter

  beforeAll(async () => {
    const connectionUri = process.env.KRANTHO_TEST_POSTGRES_URL
    if (!connectionUri) {
      throw new Error(
        'KRANTHO_TEST_POSTGRES_URL not set — globalSetup did not run. Check vitest.config.ts.',
      )
    }
    sql = postgres(connectionUri, { max: 4 })
    adapter = await PostgresAdapter.create(sql, { defaultLocale: 'en' })
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  beforeEach(async () => {
    // Truncate all tables the adapter touches so each test starts clean. This
    // is much faster than recreating the schema per test.
    await sql`TRUNCATE TABLE content RESTART IDENTITY CASCADE`
    await sql`TRUNCATE TABLE collection_schemas RESTART IDENTITY CASCADE`
  })

  const current = async <P extends QueryProjection>(
    projection: P,
    options: {
      collections?: string[]
      status?: 'draft' | 'published' | 'archived'
      locale?: string
      sort?: string
      limit?: number
      offset?: number
    } = {},
  ) => (await adapter.query({ state: 'current', projection, ...options })).items
  const live = async <P extends QueryProjection>(
    projection: P,
    options: { collections?: string[]; locale?: string; sort?: string } = {},
  ) => (await adapter.query({ state: 'published', projection, ...options })).items

  it('keeps authored values a write leaves out, and clears what it names as empty', async () => {
    const contract = {
      id: 'page',
      revision: 'first',
      label: 'Page',
      fields: { type: 'object', properties: { title: { type: 'string' } } },
      metadata: {},
      body: 'optional' as const,
      sections: [],
    }
    await adapter.writeContent({
      collection: 'pages',
      slug: 'kept',
      fields: { title: 'First' },
      body: 'Text with /old.png',
      contract,
      metadata: { sharing: { image: '/old.png' } },
      expectedVersion: 0,
    })
    // A write that names only fields and body, as a media rewrite once did
    await adapter.writeContent({
      collection: 'pages',
      slug: 'kept',
      fields: { title: 'First' },
      body: 'Text with /new.png',
      expectedVersion: 1,
    })
    const kept = await adapter.getContent('pages', 'kept')
    expect(kept?.metadata).toEqual({ sharing: { image: '/old.png' } })
    expect(kept?.contract).toEqual(contract)
    await adapter.writeContent({
      collection: 'pages',
      slug: 'kept',
      fields: { title: 'First' },
      body: 'Text',
      metadata: {},
      expectedVersion: 2,
    })
    expect((await adapter.getContent('pages', 'kept'))?.metadata).toEqual({})
  })

  it('archives metadata and its defining contract with every snapshot', async () => {
    const contract = {
      id: 'page',
      revision: 'first',
      label: 'Page',
      fields: {
        type: 'object',
        properties: { title: { type: 'string' } },
        additionalProperties: false,
      },
      metadata: {},
      body: 'optional' as const,
      sections: [],
    }
    const base = {
      collection: 'pages',
      slug: 'history',
      fields: { title: 'First' },
      body: 'Text',
      contract,
      metadata: { editorial: { byline: 'Author', tags: ['one'] } },
      defaults: [
        {
          collection: 'globals',
          slug: 'defaults',
          locale: 'en',
          version: 3,
          paths: ['metadata.editorial'],
          values: { 'metadata.editorial': { byline: 'Author', tags: ['one'] } },
        },
      ],
    }
    await adapter.writeContent(
      { ...base, publication: 'publish', expectedVersion: 0 },
      'first-author',
    )
    await adapter.writeContent(
      {
        ...base,
        fields: { title: 'Second' },
        contract: { ...contract, revision: 'second' },
        metadata: { editorial: { byline: 'Another' } },
        expectedVersion: 1,
      },
      'second-author',
    )
    expect((await adapter.getVersion('pages', 'history', 1))?.contract).toEqual(contract)
    expect((await adapter.getPublished('pages', 'history'))?.metadata).toEqual(base.metadata)
    await adapter.restoreVersion('pages', 'history', 1, 'restorer')
    const restored = await adapter.getContent('pages', 'history')
    expect(restored?.metadata).toEqual(base.metadata)
    expect(restored?.defaults).toEqual(base.defaults)
    expect(restored?.contract).toEqual(contract)
    expect(restored?.meta).toMatchObject({ version: 3, liveVersion: 1, changedBy: 'restorer' })
    expect((await adapter.getVersion('pages', 'history', 1))?.meta.changedBy).toBe('first-author')
  })

  it('atomically rejects competing saves with the same expected revision', async () => {
    const data = { collection: 'pages', slug: 'race', fields: { title: 'Initial' }, body: '' }
    await adapter.writeContent({ ...data, expectedVersion: 0 })
    const results = await Promise.allSettled([
      adapter.writeContent({ ...data, fields: { title: 'A' }, expectedVersion: 1 }),
      adapter.writeContent({ ...data, fields: { title: 'B' }, expectedVersion: 1 }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await adapter.getContent('pages', 'race'))?.meta.version).toBe(2)
  })

  describe('checkpoint restore', () => {
    beforeEach(async () => {
      await sql`TRUNCATE TABLE checkpoints RESTART IDENTITY CASCADE`
    })

    it('creates and restores a checkpoint', async () => {
      const checkpoints = new PostgresCheckpointAdapter(sql)
      const created = await checkpoints.createCheckpoint('before', 'manual')
      const restored = await checkpoints.restoreCheckpoint(created.version)
      expect(restored.version).toBe(created.version)
      const names = (await checkpoints.listCheckpoints()).map((c) => c.name)
      expect(names).toContain(`pre-restore-v${created.version}`)
    })
  })

  describe('status defaults', () => {
    it('writes draft when the API supplies no status', async () => {
      await adapter.writeContent({ collection: 'pages', slug: 'shipped', fields: {}, body: '' })
      const doc = await adapter.getContent('pages', 'shipped')
      expect(doc?.meta.status).toBe('draft')
    })

    it('writes published when a markdown file declares no status', async () => {
      await adapter.upsertFromFile('pages', 'from-file', {}, '', '', {}, 'content/x.md')
      const doc = await adapter.getContent('pages', 'from-file')
      expect(doc?.meta.status).toBe('published')
    })

    it('honours the configured status for a file that declares none', async () => {
      const configured = await PostgresAdapter.create(sql, {
        defaultLocale: 'en',
        defaultStatus: { filesystem: 'draft' },
      })
      await configured.upsertFromFile('pages', 'cfg-file', {}, '', '', {}, 'content/y.md')
      expect((await configured.getContent('pages', 'cfg-file'))?.meta.status).toBe('draft')
    })
  })

  describe('default locale', () => {
    it('keeps every locale-less read and write in the configured default locale', async () => {
      const nordic = await PostgresAdapter.create(sql, { defaultLocale: 'nb' })
      const save = (title: string) =>
        nordic.writeContent({ collection: 'pages', slug: 'home', fields: { title }, body: '' })

      await save('Første')
      await save('Andre')
      expect((await nordic.getContent('pages', 'home'))?.meta.locale).toBe('nb')
      expect(await nordic.getContent('pages', 'home', 'en')).toBeNull()
      expect((await nordic.listVersions('pages', 'home')).map((v) => v.locale)).toEqual([
        'nb',
        'nb',
      ])
      expect((await nordic.getVersion('pages', 'home', 1))?.fields.title).toBe('Første')

      expect(await nordic.restoreVersion('pages', 'home', 1)).toBe(true)
      expect((await nordic.getContent('pages', 'home'))?.fields.title).toBe('Første')

      await nordic.upsertFromFile('pages', 'about', { title: 'Om' }, '', '', {}, 'content/a.md')
      expect((await nordic.getContent('pages', 'about'))?.meta.locale).toBe('nb')

      await nordic.deleteContent('pages', 'home')
      expect(await nordic.getContent('pages', 'home')).toBeNull()
    })
  })

  describe('writeContent and exists', () => {
    it('writes and reads content', async () => {
      await adapter.writeContent({
        collection: 'blog',
        slug: 'my-post',
        fields: { title: 'My Post', status: 'published' },
        body: '# Hello World',
        html: '<h1>Hello World</h1>',
        sections: { intro: '<p>Intro text</p>' },
      })

      expect(await adapter.exists('my-post')).toBe(true)
    })

    it('returns false for non-existent content', async () => {
      expect(await adapter.exists('nonexistent')).toBe(false)
    })

    it('preserves nested sub-entities in JSONB fields', async () => {
      await adapter.writeContent({
        collection: 'pages',
        slug: 'business',
        fields: {
          title: 'Acme Consulting',
          address: {
            '@type': 'PostalAddress',
            streetAddress: '123 Example Road',
            addressLocality: 'Oslo',
          },
        },
        body: '# Acme',
      })

      const doc = await adapter.getContent('pages', 'business')
      expect(doc?.fields.address).toEqual({
        '@type': 'PostalAddress',
        streetAddress: '123 Example Road',
        addressLocality: 'Oslo',
      })
    })
  })

  describe('listSlugs', () => {
    it('lists all slugs', async () => {
      await adapter.writeContent({
        collection: 'blog',
        slug: 'post-1',
        fields: { title: 'Post 1' },
        body: 'body 1',
      })
      await adapter.writeContent({
        collection: 'blog',
        slug: 'post-2',
        fields: { title: 'Post 2' },
        body: 'body 2',
      })

      const slugs = await adapter.listSlugs()
      expect(slugs).toContain('post-1')
      expect(slugs).toContain('post-2')
    })
  })

  describe('query', () => {
    beforeEach(async () => {
      await adapter.writeContent({
        collection: 'blog',
        slug: 'post-a',
        fields: { title: 'A', date: '2026-01-01', status: 'published' },
        body: 'body a',
        publication: 'publish',
      })
      await adapter.writeContent({
        collection: 'blog',
        slug: 'post-b',
        fields: { title: 'B', date: '2026-01-02', status: 'draft' },
        body: 'body b',
      })
      await adapter.writeContent({
        collection: 'blog',
        slug: 'post-c',
        fields: { title: 'C', date: '2026-01-03', status: 'published' },
        body: 'body c',
        publication: 'publish',
      })
    })

    it('lists all items in a collection', async () => {
      const results = await current('full', { collections: ['blog'] })
      expect(results).toHaveLength(3)
    })

    it('filters by status', async () => {
      const published = await current('full', { collections: ['blog'], status: 'published' })
      expect(published).toHaveLength(2)
      for (const item of published) {
        expect(item.meta.status).toBe('published')
      }
    })

    it('sorts by fields via JSONB extraction', async () => {
      const sorted = await current('full', { collections: ['blog'], sort: 'date:desc' })
      expect(sorted[0]?.meta.slug).toBe('post-c')
      expect(sorted[2]?.meta.slug).toBe('post-a')
    })

    it('applies limit and offset', async () => {
      const results = await current('full', { collections: ['blog'], limit: 1, offset: 1 })
      expect(results).toHaveLength(1)
    })
  })

  describe('deleteContent', () => {
    it('soft-deletes content by collection and slug', async () => {
      await adapter.writeContent({
        collection: 'blog',
        slug: 'to-delete',
        fields: { title: 'Delete me' },
        body: 'bye',
      })

      expect(await adapter.exists('to-delete')).toBe(true)
      await adapter.deleteContent('blog', 'to-delete')
      expect(await adapter.exists('to-delete')).toBe(false)
    })

    it('scopes delete to the correct locale (regression for multi-locale bug)', async () => {
      // Write the same slug in two locales. Previously the Postgres adapter's
      // deleteContent ignored the `locale` parameter in its SELECT, so a
      // delete for `en` could destroy the `no` row.
      await adapter.writeContent({
        collection: 'blog',
        slug: 'multilingual',
        locale: 'en',
        fields: { title: 'Hello' },
        body: 'hello',
      })
      await adapter.writeContent({
        collection: 'blog',
        slug: 'multilingual',
        locale: 'no',
        fields: { title: 'Hallo' },
        body: 'hallo',
      })

      await adapter.deleteContent('blog', 'multilingual', 'en')

      const enDoc = await adapter.getContent('blog', 'multilingual', 'en')
      const noDoc = await adapter.getContent('blog', 'multilingual', 'no')

      expect(enDoc).toBeNull()
      expect(noDoc).not.toBeNull()
      expect(noDoc?.fields.title).toBe('Hallo')
    })

    it('deletes only the locale it is given, leaving the others', async () => {
      for (const [locale, title] of [
        ['en', 'Hello'],
        ['nb', 'Hei'],
      ] as const) {
        await adapter.writeContent({
          collection: 'blog',
          slug: 'nordic',
          locale,
          fields: { title },
          body: '',
        })
      }

      await adapter.deleteContent('blog', 'nordic', 'nb')

      expect(await adapter.getContent('blog', 'nordic', 'nb')).toBeNull()
      expect((await adapter.getContent('blog', 'nordic', 'en'))?.fields.title).toBe('Hello')
    })
  })

  describe('publication', () => {
    it('publishes the written version without rewriting author fields', async () => {
      await adapter.writeContent({
        collection: 'pages',
        slug: 'home',
        fields: { title: 'Home', status: 'draft' },
        body: '# Home',
      })
      await adapter.writeContent({
        collection: 'pages',
        slug: 'home',
        fields: { title: 'Home', status: 'draft' },
        body: '# Home',
        publication: 'publish',
      })

      const doc = await adapter.getContent('pages', 'home')
      expect(doc?.meta.status).toBe('published')
      expect(doc?.meta).toMatchObject({ version: 2, liveVersion: 2, status: 'published' })
    })
  })

  describe('versioning', () => {
    it('creates a version when writing content', async () => {
      await adapter.writeContent(
        {
          collection: 'blog',
          slug: 'versioned',
          fields: { title: 'V1', status: 'draft' },
          body: 'Version 1 body',
        },
        'cli',
      )

      const versions = await adapter.listVersions('blog', 'versioned')
      expect(versions).toHaveLength(1)
      expect(versions[0]?.version).toBe(1)
      expect(versions[0]?.changedBy).toBe('cli')

      const v1 = await adapter.getVersion('blog', 'versioned', 1)
      expect(v1?.body).toBe('Version 1 body')
    })

    it('increments version number on each write', async () => {
      await adapter.writeContent({
        collection: 'blog',
        slug: 'multi',
        fields: { title: 'V1' },
        body: 'body 1',
      })

      await adapter.writeContent(
        { collection: 'blog', slug: 'multi', fields: { title: 'V2' }, body: 'body 1' },
        'admin:user@test.com',
      )

      const versions = await adapter.listVersions('blog', 'multi')
      expect(versions).toHaveLength(2)
      expect(versions[0]?.version).toBe(2)
      expect(versions[1]?.version).toBe(1)
      expect(versions[0]?.changedBy).toBe('admin:user@test.com')
    })

    it('gets a specific version by number', async () => {
      await adapter.writeContent({
        collection: 'blog',
        slug: 'specific',
        fields: { title: 'Original' },
        body: 'original body',
      })

      await adapter.writeContent({
        collection: 'blog',
        slug: 'specific',
        fields: { title: 'Updated' },
        body: 'original body',
      })

      const v1 = await adapter.getVersion('blog', 'specific', 1)
      expect(v1?.fields.title).toBe('Original')
      expect(v1?.body).toBe('original body')

      const v2 = await adapter.getVersion('blog', 'specific', 2)
      expect(v2?.fields.title).toBe('Updated')
    })

    it('restores a previous version', async () => {
      await adapter.writeContent({
        collection: 'blog',
        slug: 'restore-me',
        fields: { title: 'Original', status: 'published' },
        body: 'original body',
      })

      await adapter.writeContent({
        collection: 'blog',
        slug: 'restore-me',
        fields: { title: 'Changed', status: 'published' },
        body: 'original body',
      })

      const restored = await adapter.restoreVersion('blog', 'restore-me', 1, 'admin:restore')
      expect(restored).toBe(true)

      const doc = await adapter.getContent('blog', 'restore-me')
      expect(doc?.fields.title).toBe('Original')

      const versions = await adapter.listVersions('blog', 'restore-me')
      expect(versions).toHaveLength(3)
    })

    it('returns empty for non-existent content versions', async () => {
      const versions = await adapter.listVersions('blog', 'nonexistent')
      expect(versions).toHaveLength(0)
    })

    it('returns false for restoring non-existent version', async () => {
      await adapter.writeContent({
        collection: 'blog',
        slug: 'no-version',
        fields: { title: 'Test' },
        body: 'test',
      })

      const restored = await adapter.restoreVersion('blog', 'no-version', 999)
      expect(restored).toBe(false)
    })
  })

  describe('upsertFromFile', () => {
    it('imports filesystem content', async () => {
      await adapter.upsertFromFile(
        'pages',
        'about',
        { title: 'About Us', status: 'published' },
        '# About\n\nWe are krantho.',
        '<h1>About</h1><p>We are krantho.</p>',
        { intro: '<p>We are krantho.</p>' },
        'content/pages/about.md',
      )

      expect(await adapter.exists('about')).toBe(true)
      const results = await current('full', { collections: ['pages'] })
      expect(results).toHaveLength(1)
      expect(results[0]?.fields.title).toBe('About Us')
    })

    it('skips unchanged content on re-import', async () => {
      await adapter.upsertFromFile(
        'pages',
        'stable',
        { title: 'Stable' },
        'same body',
        '<p>same body</p>',
        {},
        'content/pages/stable.md',
      )

      await adapter.upsertFromFile(
        'pages',
        'stable',
        { title: 'Stable' },
        'same body',
        '<p>same body</p>',
        {},
        'content/pages/stable.md',
      )

      const versions = await adapter.listVersions('pages', 'stable')
      expect(versions).toHaveLength(1)
    })

    it('dates the imported version by when the file last changed', async () => {
      await adapter.upsertFromFile(
        'pages',
        'dated',
        { title: 'Dated' },
        'body',
        '<p>body</p>',
        {},
        'content/pages/dated.md',
        undefined,
        '2026-03-04T05:06:07.000Z',
      )

      const doc = await adapter.getContent('pages', 'dated')
      expect(doc?.meta.createdAt).toBe('2026-03-04T05:06:07.000Z')
    })
  })

  describe('createdAt timestamp conversion', () => {
    it('converts Postgres Date values to ISO strings on read', async () => {
      await adapter.writeContent({
        collection: 'blog',
        slug: 'timestamped',
        fields: { title: 'Timestamped' },
        body: 'body',
      })

      const doc = await adapter.getContent('blog', 'timestamped')
      expect(doc?.meta.createdAt).toBeDefined()
      // ISO 8601 format produced by Date.toISOString()
      expect(doc?.meta.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('runtime schema', () => {
    it('returns null when no runtime schema exists', async () => {
      const schema = await adapter.getRuntimeSchema('blog')
      expect(schema).toBeNull()
    })

    it('saves and retrieves a runtime schema', async () => {
      await adapter.saveRuntimeSchema(
        'blog',
        {
          collection: 'blog',
          fields: [{ name: 'tags', type: 'array' } as never],
          updatedAt: new Date().toISOString(),
        },
        'admin',
      )

      const schema = await adapter.getRuntimeSchema('blog')
      expect(schema).not.toBeNull()
      expect(schema?.collection).toBe('blog')
      expect(schema?.fields).toHaveLength(1)
    })
  })

  describe('live version', () => {
    async function save(
      slug: string,
      title: string,
      publication?: 'publish' | 'unpublish' | 'archive',
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

    async function liveTitle(
      slug: string,
      collection = 'pages',
      locale?: string,
    ): Promise<unknown> {
      const doc = await adapter.getPublished(collection, slug, locale)
      return doc?.fields.title ?? null
    }

    it('keeps the live version when a published document is saved', async () => {
      await save('home', 'Published', 'publish')
      await save('home', 'Edited')

      expect(await liveTitle('home')).toBe('Published')
      const current = await adapter.getContent('pages', 'home')
      expect(current?.meta).toMatchObject({ version: 2, liveVersion: 1, status: 'published' })
    })

    it('lists documents by publication state', async () => {
      await save('live', 'Live', 'publish')
      await save('ahead', 'Ahead', 'publish')
      await save('ahead', 'Ahead edited')
      await save('draft', 'Draft')
      await save('gone', 'Gone', 'archive')

      const slugs = async (status: 'draft' | 'published' | 'archived'): Promise<string[]> =>
        (await current('meta', { collections: ['pages'], status, sort: 'slug' })).map(
          (meta) => meta.slug,
        )
      expect(await slugs('published')).toEqual(['ahead', 'live'])
      expect(await slugs('draft')).toEqual(['draft'])
      expect(await slugs('archived')).toEqual(['gone'])
    })

    it('restores a version as a save: the live version stays', async () => {
      await save('home', 'V1', 'publish')
      await save('home', 'V2', 'publish')
      await adapter.restoreVersion('pages', 'home', 1)

      expect(await liveTitle('home')).toBe('V2')
      expect((await adapter.getContent('pages', 'home'))?.fields.title).toBe('V1')
    })

    it('never shows a document that was never published', async () => {
      await save('home', 'Draft only')

      expect(await liveTitle('home')).toBeNull()
    })

    it('publishes the written version and takes it offline on unpublish, archive and delete', async () => {
      await save('home', 'First', 'publish')
      await save('home', 'Second')
      await save('home', 'Second', 'publish')
      expect(await liveTitle('home')).toBe('Second')

      await save('home', 'Second', 'unpublish')
      expect(await liveTitle('home')).toBeNull()

      await save('home', 'Second', 'archive')
      expect((await adapter.getContent('pages', 'home'))?.meta.status).toBe('archived')

      await save('home', 'Second', 'publish')
      await adapter.deleteContent('pages', 'home')
      expect(await liveTitle('home')).toBeNull()
    })

    it('resolves the same slug in two collections and two locales separately', async () => {
      await save('intro', 'Page', 'publish')
      await save('intro', 'Post', 'publish', { collection: 'blog' })
      await save('intro', 'Side', 'publish', { locale: 'no' })

      expect(await liveTitle('intro', 'pages')).toBe('Page')
      expect(await liveTitle('intro', 'blog')).toBe('Post')
      expect(await liveTitle('intro', 'pages', 'no')).toBe('Side')
    })

    it('lists the live version of each document, filtered by locale', async () => {
      await save('home', 'Home', 'publish')
      await save('home', 'Home draft')
      await save('about', 'About draft')
      await save('contact', 'Contact', 'publish')

      const english = await live('full', { collections: ['pages'], locale: 'en', sort: 'slug' })
      expect(english.map((doc) => doc.fields.title)).toEqual(['Contact', 'Home'])
    })

    it('never purges the live version', async () => {
      await save('home', 'Live', 'publish')
      for (let i = 0; i < 5; i++) await save('home', `Draft ${i}`)

      await new PostgresRetentionAdapter(sql).purgeVersions(2)

      expect(await liveTitle('home')).toBe('Live')
      const versions = await adapter.listVersions('pages', 'home')
      expect(versions.map((v) => v.version)).toEqual([6, 1])
    })

    it('backfills the latest published version and never one from before a deletion', async () => {
      const insert = async (slug: string, version: number, status: string, current: boolean) => {
        await sql.unsafe(
          `INSERT INTO content (id, collection, slug, locale, version, is_current, status, fields, body, deleted_at)
           VALUES ($1, 'pages', $2, 'en', $3, $4, $5, $6, '', $7)`,
          [
            `${slug}-${version}`,
            slug,
            version,
            current,
            status,
            sql.json({ title: `${slug} v${version}` }),
            status === 'deleted' ? new Date().toISOString() : null,
          ],
        )
      }
      await insert('home', 1, 'published', false)
      await insert('home', 2, 'draft', false)
      await insert('home', 3, 'published', false)
      await insert('home', 4, 'draft', true)
      await insert('old', 1, 'published', false)
      await insert('old', 2, 'deleted', false)
      await insert('old', 3, 'draft', true)

      await sql.unsafe('ALTER TABLE content DROP COLUMN live_version')
      await v010ContentLiveVersion.apply(sql)

      expect(await liveTitle('home')).toBe('home v3')
      expect(await liveTitle('old')).toBeNull()
    })
  })

  describe('summaries', () => {
    beforeEach(async () => {
      const save = (slug: string, title: string, publication?: 'publish', locale?: string) =>
        adapter.writeContent({
          collection: 'pages',
          slug,
          fields: { title },
          body: `# ${title}\n\n${'Long body. '.repeat(50)}`,
          ...(publication ? { publication } : {}),
          ...(locale ? { locale } : {}),
          metadata: { sharing: { title: `Share ${title}` } },
        })
      await save('a', 'A', 'publish')
      await save('b', 'B')
      await save('c', 'C1', 'publish')
      await save('c', 'C2')
      await save('om', 'Om', 'publish', 'nb')
    })

    const withoutContent = (docs: Array<{ meta: unknown; fields: unknown; metadata: unknown }>) =>
      docs.map(({ meta, fields, metadata }) => ({ meta, fields, metadata }))

    it('lists the meta of the current version of each document as its full list does', async () => {
      const metas = await current('meta', { sort: 'slug' })
      const full = await current('full', { sort: 'slug' })
      expect(metas).toEqual(full.map(({ meta }) => meta))
      expect(metas.map((meta) => [meta.slug, meta.status])).toEqual([
        ['a', 'published'],
        ['b', 'draft'],
        ['c', 'published'],
        ['om', 'published'],
      ])
      for (const meta of metas) {
        for (const content of ['fields', 'body', 'html', 'sections']) {
          expect(meta).not.toHaveProperty(content)
        }
      }
    })

    it('lists the current version of each document as its full list does, minus the content', async () => {
      const summaries = await current('summary', { sort: 'slug' })
      const full = await current('full', { sort: 'slug' })
      expect(summaries).toEqual(withoutContent(full))
      // c's current version is the newer draft, though its live one is the first
      expect(summaries.map((s) => [s.meta.slug, s.fields.title, s.meta.status])).toEqual([
        ['a', 'A', 'published'],
        ['b', 'B', 'draft'],
        ['c', 'C2', 'published'],
        ['om', 'Om', 'published'],
      ])
      for (const summary of summaries) {
        for (const content of ['body', 'html', 'sections']) {
          expect(summary).not.toHaveProperty(content)
        }
      }
      const page = await current('summary', { sort: 'slug', limit: 2, offset: 1 })
      expect(page.map((s) => s.meta.slug)).toEqual(['b', 'c'])
    })

    it('lists the live version of each document as its full list does, minus the content', async () => {
      const summaries = await live('summary', { sort: 'slug' })
      const full = await live('full', { sort: 'slug' })
      expect(summaries).toEqual(withoutContent(full))
      expect(summaries.map((s) => [s.meta.slug, s.fields.title])).toEqual([
        ['a', 'A'],
        ['c', 'C1'],
        ['om', 'Om'],
      ])
    })

    it('honours the locale, status and paging the full list honours', async () => {
      expect((await current('meta', { locale: 'nb' })).map((meta) => meta.slug)).toEqual(['om'])
      expect(
        (await live('summary', { locale: 'en', sort: 'slug' })).map((s) => s.meta.slug),
      ).toEqual(['a', 'c'])
      const page = await current('meta', { sort: 'slug', limit: 2, offset: 1 })
      expect(page.map((meta) => meta.slug)).toEqual(['b', 'c'])
    })

    it('asks the database for meta columns alone, or with the fields, never the body, HTML or sections', async () => {
      const queries: string[] = []
      const unsafe = sql.unsafe.bind(sql)
      const spy = vi.spyOn(sql, 'unsafe').mockImplementation(((query: string, params?: never) => {
        queries.push(query)
        return unsafe(query, params)
      }) as typeof sql.unsafe)
      try {
        await current('meta')
        await live('summary')
      } finally {
        spy.mockRestore()
      }
      expect(queries).toHaveLength(2)
      const [metas, summaries] = queries as [string, string]
      expect(metas).toMatch(/\bslug\b/)
      expect(metas).not.toMatch(/SELECT \*|\bfields\b|\bbody\b|\bhtml\b|\bsections\b/)
      expect(summaries).toMatch(/\bfields\b/)
      expect(summaries).not.toMatch(/SELECT \*|\bbody\b|\bhtml\b|\bsections\b/)
    })

    it("lists a document's versions newest first with their meta", async () => {
      const versions = await adapter.listVersions('pages', 'c')
      expect(versions.map((v) => [v.version, v.liveVersion, v.status])).toEqual([
        [2, 1, 'published'],
        [1, 1, 'published'],
      ])
      for (const version of versions) {
        for (const content of ['body', 'html', 'sections', 'fields']) {
          expect(version).not.toHaveProperty(content)
        }
      }
    })
  })
})
