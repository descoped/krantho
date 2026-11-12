import { defineCollection, defineConfig } from '@krantho/schema'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { changePublication } from '../src/document-actions.js'
import { saveDocument } from '../src/save-document.js'
import { admin, editor, viewer } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

const base = {
  collection: 'pages',
  slug: 'about',
  fields: { title: 'About' },
  body: '# About',
  locale: 'en',
  changedBy: 'editor:eddie.editor@example.com via assistant',
}

describe('saveDocument', () => {
  it('saves a new document as a draft that visitors do not see', async () => {
    const stores = testStores()
    const ctx = testContext(editor, stores)

    const result = await saveDocument(ctx, { ...base, isNew: true })

    expect(result).toEqual({ ok: true, slug: 'about', version: 1, liveVersion: null })
    const doc = await stores.adapter.getContent('pages', 'about', 'en')
    expect(doc?.meta.status).toBe('draft')
    expect(doc?.fields['status']).toBeUndefined()
    expect(doc?.meta.changedBy).toBe(base.changedBy)
    expect(await stores.adapter.getPublished('pages', 'about', 'en')).toBeNull()
  })

  it('keeps the live version when a published document is saved', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'About' } },
      'published',
    )
    const ctx = testContext(editor, stores)
    const write = vi.spyOn(stores.adapter, 'writeContent')

    const result = await saveDocument(ctx, { ...base, fields: { title: 'About us' }, isNew: false })

    expect(result).toEqual({ ok: true, slug: 'about', version: 2, liveVersion: 1 })
    expect(write.mock.calls[0]?.[0].publication).toBeUndefined()
    const current = await stores.adapter.getContent('pages', 'about', 'en')
    expect(current?.meta).toMatchObject({ status: 'published', version: 2, liveVersion: 1 })
    expect(current?.fields['status']).toBeUndefined()
    const live = await stores.adapter.getPublished('pages', 'about', 'en')
    expect(live?.fields['title']).toBe('About')
  })

  it('merges a fields-only save into the current fields and keeps the body', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      {
        collection: 'pages',
        slug: 'about',
        fields: { title: 'About', description: 'Who we are.' },
        body: '# Body',
      },
      'draft',
    )
    const ctx = testContext(editor, stores)
    const fieldsOnly = { ...base, body: undefined, fields: { title: 'About us' }, isNew: false }

    const result = await saveDocument(ctx, fieldsOnly)

    expect(result.ok).toBe(true)
    const current = await stores.adapter.getContent('pages', 'about', 'en')
    expect(current?.fields).toMatchObject({ title: 'About us', description: 'Who we are.' })
    expect(current?.body).toBe('# Body')
  })

  it('saves an archived document without an editable publication field', async () => {
    const stores = testStores()
    const blog = defineCollection({
      name: 'blog',
      source: 'database',
      schema: z.object({ title: z.string() }),
    })
    const ctx = testContext(editor, stores)
    ctx.contentConfig = defineConfig({ collections: { blog } })
    await stores.adapter.seed(
      { collection: 'blog', slug: 'old', fields: { title: 'Old' } },
      'published',
    )
    const target = { collection: 'blog', slug: 'old', locale: 'en' }

    expect((await changePublication(ctx, target, 'archive', 'x')).status).toBe(200)
    const archived = await stores.adapter.getContent('blog', 'old', 'en')
    expect(archived?.meta.status).toBe('archived')
    expect(archived?.fields['status']).toBeUndefined()

    const saved = await saveDocument(ctx, {
      ...base,
      ...target,
      fields: { title: 'Older' },
      isNew: false,
    })
    expect(saved.ok).toBe(true)
    expect((await stores.adapter.getContent('blog', 'old', 'en'))?.meta.status).toBe('archived')
  })

  it('rejects a stale expected version with 409', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'About' } },
      'draft',
    )
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'About 2' } },
      'draft',
    )
    const ctx = testContext(editor, stores)

    const result = await saveDocument(ctx, {
      ...base,
      isNew: false,
      expectedVersion: 1,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(409)
      expect(result.response.body).toMatchObject({ currentVersion: 2, yourVersion: 1 })
    }
  })

  it('refuses a viewer with 403', async () => {
    const result = await saveDocument(testContext(viewer, testStores()), { ...base, isNew: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('runs the hooks and the webhook as the REST save does', async () => {
    const stores = testStores()
    const ctx = testContext(admin, stores)
    const beforeSave = vi.fn(async (hookCtx) => ({ ...hookCtx, body: `${hookCtx.body}\n\nHooked` }))
    const afterCreate = vi.fn(async () => {})
    const fireWebhook = vi.fn()
    const listener = vi.fn(async () => {})
    ctx.contentHooks = { beforeSave, afterCreate }
    ctx.fireWebhook = fireWebhook
    ctx.changeListeners = [listener]

    await saveDocument(ctx, { ...base, isNew: true })

    expect(beforeSave).toHaveBeenCalledOnce()
    expect(afterCreate).toHaveBeenCalledWith({ collection: 'pages', slug: 'about' })
    expect(fireWebhook).toHaveBeenCalledWith('create', 'pages', 'about')
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'document',
        collection: 'pages',
        slug: 'about',
        live: false,
      }),
    )
    expect((await stores.adapter.getContent('pages', 'about', 'en'))?.body).toBe(
      '# About\n\nHooked',
    )
  })

  it('answers 501 for a save without a body on an adapter that cannot read the document', async () => {
    const ctx = testContext(editor, testStores())
    ctx.adapter = {
      exists: async () => true,
      read: async () => '',
      getMetadata: async () => ({ size: 0, lastModified: new Date(0) }),
      listSlugs: async () => [],
      writeContent: async () => {},
    }
    const result = await saveDocument(ctx, { ...base, body: undefined, isNew: false })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(501)
  })

  it('answers 501 for a new document on an adapter without writeContent', async () => {
    const ctx = testContext(editor, testStores())
    ctx.adapter = {
      exists: async () => true,
      read: async () => '',
      getMetadata: async () => ({ size: 0, lastModified: new Date(0) }),
      listSlugs: async () => [],
    }
    const result = await saveDocument(ctx, { ...base, isNew: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(501)
  })
})
