import type { QueryProjection } from '@krantho/persistence'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SQLiteAdapter } from '../src/sqlite-adapter.js'

describe('SQLiteAdapter projections', () => {
  let adapter: SQLiteAdapter

  beforeEach(async () => {
    adapter = new SQLiteAdapter(':memory:', { defaultLocale: 'en' })
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

  afterEach(() => {
    adapter.close()
  })

  const current = async <P extends QueryProjection>(
    projection: P,
    options: { sort?: string; locale?: string; limit?: number; offset?: number } = {},
  ) => (await adapter.query({ state: 'current', projection, ...options })).items
  const live = async <P extends QueryProjection>(
    projection: P,
    options: { sort?: string; locale?: string } = {},
  ) => (await adapter.query({ state: 'published', projection, ...options })).items

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
    expect(summaries.map((s) => [s.meta.slug, s.fields['title'], s.meta.status])).toEqual([
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
    // c's live version is the first one, though a newer draft exists; b has none
    expect(summaries.map((s) => [s.meta.slug, s.fields['title']])).toEqual([
      ['a', 'A'],
      ['c', 'C1'],
      ['om', 'Om'],
    ])
  })

  it('honours the locale, status and paging the full list honours', async () => {
    expect((await current('meta', { locale: 'nb' })).map((meta) => meta.slug)).toEqual(['om'])
    expect((await live('summary', { locale: 'en', sort: 'slug' })).map((s) => s.meta.slug)).toEqual(
      ['a', 'c'],
    )
    const page = await current('meta', { sort: 'slug', limit: 2, offset: 1 })
    expect(page.map((meta) => meta.slug)).toEqual(['b', 'c'])
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

  it('carries the authored metadata of each version, not its contract or provenance', async () => {
    const published = await live('summary', { sort: 'slug' })
    expect(published.map((s) => [s.meta.slug, s.metadata])).toEqual([
      ['a', { sharing: { title: 'Share A' } }],
      ['c', { sharing: { title: 'Share C1' } }],
      ['om', { sharing: { title: 'Share Om' } }],
    ])
    for (const summary of published) {
      for (const absent of ['contract', 'defaults', 'body'])
        expect(summary).not.toHaveProperty(absent)
    }
  })
})
