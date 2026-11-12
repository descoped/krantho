import { describe, expect, it } from 'vitest'
import { createApiHandlers } from '../src/create-api-handlers.js'
import { changePublication, deleteDocument } from '../src/document-actions.js'
import { listCollection } from '../src/handlers/list-collection.js'
import { admin, editor } from './assistant/auth.js'
import {
  contentConfig,
  testConfig,
  testContext,
  testEngine,
  testStores,
} from './assistant/fixtures.js'

async function seedShared(stores: ReturnType<typeof testStores>): Promise<void> {
  const { adapter } = stores
  await adapter.seed(
    { collection: 'pages', slug: 'intro', locale: 'en', fields: { title: 'Intro EN' } },
    'draft',
  )
  await adapter.seed(
    { collection: 'pages', slug: 'intro', locale: 'nb', fields: { title: 'Intro NB' } },
    'draft',
  )
  await adapter.seed(
    { collection: 'articles', slug: 'intro', locale: 'nb', fields: { title: 'Article' } },
    'draft',
  )
}

const multilingual = testConfig({ site: { supportedLocales: ['en', 'nb'], defaultLocale: 'en' } })

describe('changePublication', () => {
  it('publishes exactly the collection, slug and locale asked for', async () => {
    const stores = testStores()
    await seedShared(stores)
    const ctx = testContext(editor, stores, multilingual)

    const response = await changePublication(
      ctx,
      { collection: 'pages', slug: 'intro', locale: 'nb' },
      'publish',
      'editor:x via assistant',
    )

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: 'published', version: 2, liveVersion: 2 })
    const published = await stores.adapter.getPublished('pages', 'intro', 'nb')
    expect(published?.fields['title']).toBe('Intro NB')
    expect(published?.fields['status']).toBeUndefined()
    expect(await stores.adapter.getPublished('pages', 'intro', 'en')).toBeNull()
    expect(await stores.adapter.getPublished('articles', 'intro', 'nb')).toBeNull()
  })

  it('takes a document offline when it is unpublished or archived', async () => {
    const stores = testStores()
    await seedShared(stores)
    const ctx = testContext(editor, stores, multilingual)
    const target = { collection: 'pages', slug: 'intro', locale: 'en' }
    await changePublication(ctx, target, 'publish', 'x')

    const unpublished = await changePublication(ctx, target, 'unpublish', 'x')
    expect(unpublished.body).toMatchObject({ status: 'draft', liveVersion: null })
    expect(await stores.adapter.getPublished('pages', 'intro', 'en')).toBeNull()

    const archived = await changePublication(ctx, target, 'archive', 'x')
    expect(archived.body).toMatchObject({ status: 'archived', liveVersion: null })
    const current = await stores.adapter.getContent('pages', 'intro', 'en')
    expect(current?.meta.status).toBe('archived')
    const archivedList = await listCollection(
      {
        method: 'GET',
        path: '/api/content/pages',
        params: { collection: 'pages' },
        query: { status: 'archived', locale: 'en' },
      },
      ctx,
    )
    const { items } = archivedList.body as { items: Array<{ meta: { slug: string } }> }
    expect(items.map((item) => item.meta.slug)).toEqual(['intro'])
  })

  it('answers 404 for a document that does not exist in that locale', async () => {
    const stores = testStores()
    await seedShared(stores)
    const response = await changePublication(
      testContext(editor, stores, multilingual),
      { collection: 'articles', slug: 'intro', locale: 'en' },
      'publish',
      'x',
    )
    expect(response.status).toBe(404)
  })
})

describe('deleteDocument', () => {
  it('deletes a document in a locale other than en and records who did it', async () => {
    const stores = testStores()
    await seedShared(stores)
    const ctx = testContext(admin, stores, multilingual)

    const response = await deleteDocument(
      ctx,
      { collection: 'pages', slug: 'intro', locale: 'nb' },
      'admin:a via assistant',
    )

    expect(response.status).toBe(200)
    expect(await stores.adapter.getContent('pages', 'intro', 'nb')).toBeNull()
    expect(await stores.adapter.getContent('pages', 'intro', 'en')).not.toBeNull()
    const versions = await stores.adapter.listVersions('pages', 'intro', 'nb')
    expect(versions[0]).toMatchObject({ status: 'deleted', changedBy: 'admin:a via assistant' })
  })

  it('lets an editor publish but not delete', async () => {
    const stores = testStores()
    await seedShared(stores)
    const ctx = testContext(editor, stores, multilingual)
    const response = await deleteDocument(
      ctx,
      { collection: 'pages', slug: 'intro', locale: 'nb' },
      'x',
    )
    expect(response.status).toBe(403)
  })
})

describe('DELETE /api/content/:collection/:slug', () => {
  it('still deletes without a locale, in the site default locale', async () => {
    const stores = testStores()
    await seedShared(stores)
    const config = testConfig({ auth: { mode: 'none' } })
    const api = createApiHandlers({
      contentConfig,
      config,
      adapter: stores.adapter,
      engine: testEngine(),
    })

    const response = await api.handle({
      method: 'DELETE',
      path: '/api/content/pages/intro',
      params: {},
      query: {},
    })

    expect(response.status).toBe(200)
    expect(await stores.adapter.getContent('pages', 'intro', 'en')).toBeNull()
    expect(await stores.adapter.getContent('pages', 'intro', 'nb')).not.toBeNull()
    const versions = await stores.adapter.listVersions('pages', 'intro', 'en')
    expect(versions[0]?.changedBy).toBeNull()
  })
})

describe('DELETE /api/content/:collection/bulk', () => {
  function bulkApi(stores: ReturnType<typeof testStores>, defaultLocale: string) {
    const config = testConfig({
      auth: { mode: 'none' },
      site: { supportedLocales: ['en', 'nb'], defaultLocale },
    })
    return createApiHandlers({
      contentConfig,
      config,
      adapter: stores.adapter,
      lockAdapter: stores.locks,
      engine: testEngine(),
    })
  }

  function bulkDelete(body: Record<string, unknown>) {
    return { method: 'DELETE', path: '/api/content/pages/bulk', params: {}, query: {}, body }
  }

  it('deletes each slug in the locale the body names', async () => {
    const stores = testStores()
    await seedShared(stores)
    const response = await bulkApi(stores, 'en').handle(
      bulkDelete({ slugs: ['intro'], locale: 'nb' }),
    )

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ deleted: 1, results: [{ slug: 'intro', deleted: true }] })
    expect(await stores.adapter.getContent('pages', 'intro', 'nb')).toBeNull()
    expect(await stores.adapter.getContent('pages', 'intro', 'en')).not.toBeNull()
  })

  it("defaults to the site's default locale, never to en", async () => {
    const stores = testStores()
    await seedShared(stores)
    const response = await bulkApi(stores, 'nb').handle(bulkDelete({ slugs: ['intro'] }))

    expect(response.status).toBe(200)
    expect(await stores.adapter.getContent('pages', 'intro', 'nb')).toBeNull()
    expect(await stores.adapter.getContent('pages', 'intro', 'en')).not.toBeNull()
  })

  it('leaves a document alone while someone else holds its lock in that locale', async () => {
    const stores = testStores()
    await seedShared(stores)
    const expires = new Date(Date.now() + 60_000).toISOString()
    await stores.locks.acquireLock('pages', 'intro', 'nb', 'editor:other@example.com', expires)
    const response = await bulkApi(stores, 'en').handle(
      bulkDelete({ slugs: ['intro'], locale: 'nb' }),
    )

    expect(response.body).toMatchObject({
      deleted: 0,
      results: [{ slug: 'intro', deleted: false }],
    })
    expect(await stores.adapter.getContent('pages', 'intro', 'nb')).not.toBeNull()
  })
})
