import { describe, expect, it } from 'vitest'
import { changePublication, deleteDocument } from '../src/document-actions.js'
import { bulkDelete } from '../src/handlers/bulk-delete.js'
import { listLocks, releaseLock } from '../src/handlers/content-lock.js'
import { restoreVersion } from '../src/handlers/restore-version.js'
import { saveDocument } from '../src/save-document.js'
import type { ApiRequest } from '../src/types.js'
import { admin, editor, viewer } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

const target = { collection: 'pages', slug: 'about', locale: 'en' }
const inAnHour = (): string => new Date(Date.now() + 3_600_000).toISOString()

/** A document that admin is editing */
async function lockedByAdmin(): Promise<ReturnType<typeof testStores>> {
  const stores = testStores()
  await stores.adapter.seed({ ...target, fields: { title: 'About' } }, 'published')
  await stores.adapter.seed({ ...target, fields: { title: 'About us' } }, 'draft')
  await stores.locks.acquireLock('pages', 'about', 'en', 'admin:ada.admin@example.com', inAnHour())
  return stores
}

function documentRequest(method: string, extra: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method,
    path: '/api/content/pages/about',
    params: { collection: 'pages', slug: 'about' },
    query: {},
    ...extra,
  }
}

describe('edit locks', () => {
  it('refuses a save, publish, delete and restore with 423 while someone else holds the lock', async () => {
    const stores = await lockedByAdmin()
    const ctx = testContext(editor, stores)

    const save = await saveDocument(ctx, {
      ...target,
      fields: { title: 'Mine' },
      body: '',
      isNew: false,
      changedBy: 'editor:eddie.editor@example.com',
    })
    const publish = await changePublication(ctx, target, 'publish', 'x')
    const otherAdmin = testContext(
      { ...admin, id: 'user-other', email: 'other.admin@example.com' },
      stores,
    )
    const remove = await deleteDocument(otherAdmin, target, 'x')
    const restore = await restoreVersion(
      documentRequest('POST', { params: { collection: 'pages', slug: 'about', version: '1' } }),
      otherAdmin,
    )

    expect(save.ok ? 200 : save.response.status).toBe(423)
    expect(publish.status).toBe(423)
    expect(publish.body).toMatchObject({ lockedBy: 'admin:ada.admin@example.com' })
    expect(JSON.stringify((publish.body as { error: string }).error)).not.toContain('ada')
    expect(remove.status).toBe(423)
    expect(restore.status).toBe(423)
    expect((await stores.adapter.getContent('pages', 'about', 'en'))?.meta.version).toBe(2)
  })

  it('leaves a document someone else is editing out of a bulk delete', async () => {
    const stores = await lockedByAdmin()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'free', fields: { title: 'Free' } },
      'draft',
    )
    const otherAdmin = testContext(
      { ...admin, id: 'user-other', email: 'other.admin@example.com' },
      stores,
    )

    const res = await bulkDelete(
      {
        method: 'DELETE',
        path: '/api/content/pages/bulk',
        params: { collection: 'pages' },
        query: {},
        body: { slugs: ['about', 'free'] },
      },
      otherAdmin,
    )

    expect(res.body).toMatchObject({
      deleted: 1,
      results: [
        { slug: 'about', deleted: false, error: 'pages/about is being edited by another user' },
        { slug: 'free', deleted: true },
      ],
    })
    expect(await stores.adapter.getContent('pages', 'about', 'en')).not.toBeNull()
  })

  it('lets the holder write, and anyone once the lock has expired', async () => {
    const stores = await lockedByAdmin()
    expect(
      (await changePublication(testContext(admin, stores), target, 'publish', 'x')).status,
    ).toBe(200)

    await stores.locks.acquireLock(
      'pages',
      'about',
      'en',
      'admin:ada.admin@example.com',
      new Date(Date.now() - 1000).toISOString(),
    )
    expect(
      (await changePublication(testContext(editor, stores), target, 'publish', 'x')).status,
    ).toBe(200)
  })

  it("releases only the caller's own lock, or anyone's for an admin", async () => {
    const stores = await lockedByAdmin()

    const byEditor = await releaseLock(documentRequest('DELETE'), testContext(editor, stores))
    expect(byEditor.status).toBe(403)
    expect(await stores.locks.getLock('pages', 'about', 'en')).not.toBeNull()

    await stores.locks.acquireLock(
      'pages',
      'about',
      'en',
      'editor:eddie.editor@example.com',
      inAnHour(),
    )
    const own = await releaseLock(documentRequest('DELETE'), testContext(editor, stores))
    expect(own.status).toBe(200)
    expect(await stores.locks.getLock('pages', 'about', 'en')).toBeNull()

    await stores.locks.acquireLock(
      'pages',
      'about',
      'en',
      'editor:eddie.editor@example.com',
      inAnHour(),
    )
    const byAdmin = await releaseLock(documentRequest('DELETE'), testContext(admin, stores))
    expect(byAdmin.status).toBe(200)
  })

  it('lists the locks currently held to a viewer', async () => {
    const stores = await lockedByAdmin()
    const listRequest: ApiRequest = { method: 'GET', path: '/api/locks', params: {}, query: {} }

    const res = await listLocks(listRequest, testContext(viewer, stores))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      locks: [
        {
          collection: 'pages',
          slug: 'about',
          locale: 'en',
          lockedBy: 'admin:ada.admin@example.com',
        },
      ],
    })
    expect((await listLocks(listRequest, testContext(undefined, stores))).status).toBe(401)
  })
})
