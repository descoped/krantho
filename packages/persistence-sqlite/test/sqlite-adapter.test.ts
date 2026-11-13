import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SQLiteAdapter } from '../src/sqlite-adapter.js'

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter

  beforeEach(() => {
    adapter = new SQLiteAdapter(':memory:', { defaultLocale: 'en' })
  })

  afterEach(() => {
    adapter.close()
  })

  /** The current version of each document of a collection, whole */
  const listCurrent = async (
    collection: string,
    options: {
      status?: 'draft' | 'published' | 'archived'
      sort?: string
      limit?: number
      offset?: number
    } = {},
  ) =>
    (
      await adapter.query({
        state: 'current',
        projection: 'full',
        collections: [collection],
        ...options,
      })
    ).items

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
      const results = await listCurrent('blog')
      expect(results).toHaveLength(3)
    })

    it('filters by status', async () => {
      const published = await listCurrent('blog', { status: 'published' })
      expect(published).toHaveLength(2)
      for (const item of published) {
        expect(item.meta.status).toBe('published')
      }
    })

    it('sorts by fields', async () => {
      const sorted = await listCurrent('blog', { sort: 'date:desc' })
      expect(sorted[0]?.meta.slug).toBe('post-c')
      expect(sorted[2]?.meta.slug).toBe('post-a')
    })

    it('applies limit and offset', async () => {
      const results = await listCurrent('blog', { limit: 1, offset: 1 })
      expect(results).toHaveLength(1)
    })
  })

  describe('deleteContent', () => {
    it('deletes content by collection and slug', async () => {
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

      const results = await listCurrent('pages')
      const home = results.find((r) => r.meta.slug === 'home')
      expect(home?.meta.status).toBe('published')
      expect(home?.meta.liveVersion).toBe(2)
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

      const results = await listCurrent('blog', {})
      const item = results.find((r) => r.meta.slug === 'restore-me')
      expect(item?.fields.title).toBe('Original')

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
      const results = await listCurrent('pages')
      expect(results).toHaveLength(1)
      expect(results[0]?.fields.title).toBe('About Us')
    })

    it('dates the imported version by when the file last changed', async () => {
      const args = [
        { title: 'About' },
        'body',
        '<p>body</p>',
        {},
        'content/pages/about.md',
      ] as const
      await adapter.upsertFromFile('pages', 'about', ...args, undefined, '2026-03-04T05:06:07.000Z')
      await adapter.upsertFromFile('pages', 'team', ...args)

      const about = await adapter.getContent('pages', 'about')
      const team = await adapter.getContent('pages', 'team')
      expect(about?.meta.createdAt).toBe('2026-03-04T05:06:07.000Z')
      expect(team && Date.parse(team.meta.createdAt)).toBeGreaterThan(Date.now() - 60_000)
    })
  })
})
