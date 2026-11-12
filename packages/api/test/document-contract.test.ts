import { repositoryDocument } from '@krantho/persistence'
import {
  defineCollection,
  defineConfig,
  defineDocumentArchetype,
  defineMetadataArchetype,
  documentChecksum,
} from '@krantho/schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createApiHandlers } from '../src/create-api-handlers.js'
import { changePublication } from '../src/document-actions.js'
import { applyDocumentDefaults } from '../src/handlers/apply-metadata-defaults.js'
import { exportContent } from '../src/handlers/export-content.js'
import { importContent } from '../src/handlers/import-content.js'
import { restoreVersion } from '../src/handlers/restore-version.js'
import { deleteRuntimeMetadata, saveRuntimeMetadata } from '../src/handlers/runtime-metadata.js'
import { saveDocument } from '../src/save-document.js'
import { admin } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

function setup(required = false) {
  const stores = testStores()
  const ctx = testContext(admin, stores)
  const collection = defineCollection({
    name: 'pages',
    source: 'database',
    archetype: defineDocumentArchetype({
      id: 'website/page',
      label: 'Page',
      fields: z.object({ title: z.string() }),
      metadata: {
        editorial: {
          required,
          archetype: defineMetadataArchetype({
            id: 'website/editorial',
            label: 'Editorial',
            schema: z.object({
              byline: z.string(),
              contact: z.object({ email: z.email() }).optional(),
            }),
          }),
        },
      },
    }),
  })
  ctx.contentConfig = defineConfig({ collections: { pages: collection } })
  return { ctx, stores }
}
const input = {
  collection: 'pages',
  slug: 'about',
  locale: 'en',
  fields: { title: 'About' },
  body: 'Body',
  changedBy: 'admin:author',
  metadata: { editorial: { byline: 'Author' } },
}

describe('complete document contracts', () => {
  it('versions metadata with content, preserves the live revision and keeps the archived contract', async () => {
    const { ctx, stores } = setup()
    expect((await saveDocument(ctx, { ...input, isNew: true })).ok).toBe(true)
    const first = await stores.adapter.getContent('pages', 'about', 'en')
    expect(first?.contract?.id).toBe('website/page')
    expect((await changePublication(ctx, input, 'publish', 'admin:publisher')).status).toBe(200)
    expect(
      (
        await saveDocument(ctx, {
          ...input,
          isNew: false,
          expectedVersion: 2,
          metadata: { editorial: { byline: 'New author' } },
        })
      ).ok,
    ).toBe(true)
    expect((await stores.adapter.getContent('pages', 'about', 'en'))?.metadata.editorial).toEqual({
      byline: 'New author',
    })
    expect((await stores.adapter.getPublished('pages', 'about', 'en'))?.metadata.editorial).toEqual(
      { byline: 'Author' },
    )
    expect((await stores.adapter.getVersion('pages', 'about', 1, 'en'))?.contract).toEqual(
      first?.contract,
    )
  })

  it('rejects nested unknown values and missing required groups without writing', async () => {
    const { ctx, stores } = setup(true)
    const invalid = await saveDocument(ctx, {
      ...input,
      isNew: true,
      metadata: {
        editorial: { byline: 'Author', contact: { email: 'a@example.test', extra: true } },
      },
    })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.response).toMatchObject({ status: 422 })
    expect(await stores.adapter.getContent('pages', 'about', 'en')).toBeNull()
    const missing = await saveDocument(ctx, { ...input, isNew: true, metadata: {} })
    expect(missing.ok).toBe(false)
    if (!missing.ok)
      expect(missing.response.body).toMatchObject({ details: [{ field: 'metadata.editorial' }] })
  })

  it('refuses metadata that is not an object of groups before any hook sees it', async () => {
    const { ctx, stores } = setup(true)
    for (const metadata of [[], 'editorial', { editorial: 'Author' }, { editorial: [] }]) {
      const saved = await saveDocument(ctx, { ...input, isNew: true, metadata })
      expect(saved.ok).toBe(false)
      if (!saved.ok)
        expect(saved.response).toMatchObject({
          status: 422,
          body: { error: 'Metadata must be an object of named groups' },
        })
    }
    expect(await stores.adapter.getContent('pages', 'about', 'en')).toBeNull()
  })

  it('refuses incompatible historic restore and preserves all current and historic values', async () => {
    const { ctx, stores } = setup()
    await saveDocument(ctx, { ...input, isNew: true })
    await stores.adapter.saveRuntimeSchema('pages', {
      collection: 'pages',
      updatedAt: new Date().toISOString(),
      fields: [{ name: 'summary', type: 'string', required: true }],
    })
    const response = await restoreVersion(
      {
        method: 'POST',
        path: '',
        params: { collection: 'pages', slug: 'about', version: '1' },
        query: { locale: 'en' },
        body: {},
      },
      ctx,
    )
    expect(response.status).toBe(422)
    expect((await stores.adapter.getContent('pages', 'about', 'en'))?.meta.version).toBe(1)
    expect((await stores.adapter.getVersion('pages', 'about', 1, 'en'))?.metadata).toEqual(
      input.metadata,
    )
  })
  it('previews defaults without writing, pins applied values and refuses a changed source', async () => {
    const { ctx, stores } = setup()
    await saveDocument(ctx, { ...input, slug: 'shared', isNew: true })
    await saveDocument(ctx, { ...input, isNew: true, metadata: {} })
    const request = {
      method: 'POST',
      path: '',
      params: { collection: 'pages', slug: 'about' },
      query: {},
      body: { sourceCollection: 'pages', sourceSlug: 'shared', locale: 'en', apply: false },
    }
    const preview = await applyDocumentDefaults(request, ctx)
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({ metadata: input.metadata, sourceVersion: 1, version: 1 })
    expect((await stores.adapter.getContent('pages', 'about', 'en'))?.meta.version).toBe(1)
    const applied = await applyDocumentDefaults(
      { ...request, body: { ...request.body, apply: true, sourceVersion: 1, _version: 1 } },
      ctx,
    )
    expect(applied.status).toBe(200)
    const saved = await stores.adapter.getContent('pages', 'about', 'en')
    expect(saved?.defaults).toMatchObject([
      { collection: 'pages', slug: 'shared', locale: 'en', version: 1 },
    ])
    expect(saved?.metadata).toEqual(input.metadata)
    await saveDocument(ctx, {
      ...input,
      slug: 'shared',
      isNew: false,
      expectedVersion: 1,
      metadata: { editorial: { byline: 'Another author' } },
    })
    const stale = await applyDocumentDefaults(
      { ...request, body: { ...request.body, apply: true, sourceVersion: 1, _version: 2 } },
      ctx,
    )
    expect(stale.status).toBe(409)
    expect((await stores.adapter.getContent('pages', 'about', 'en'))?.meta.version).toBe(2)
    expect((await stores.adapter.getVersion('pages', 'about', 1, 'en'))?.metadata).toEqual({})
  })

  it('keeps code groups immutable and archives runtime definitions with revisions', async () => {
    const { ctx, stores } = setup()
    const req = {
      method: 'PUT',
      path: '',
      params: { collection: 'pages' },
      query: {},
      body: {
        slot: 'review',
        id: 'website/review',
        label: 'Review',
        required: false,
        schema: {
          type: 'object',
          properties: { approved: { type: 'boolean' } },
          required: ['approved'],
        },
      },
    }
    expect(
      (await saveRuntimeMetadata({ ...req, body: { ...req.body, slot: 'editorial' } }, ctx)).status,
    ).toBe(409)
    expect((await saveRuntimeMetadata(req, ctx)).status).toBe(200)
    expect(
      (
        await saveDocument(ctx, {
          ...input,
          isNew: true,
          metadata: { ...input.metadata, review: { approved: false } },
        })
      ).ok,
    ).toBe(true)
    expect(
      (
        await deleteRuntimeMetadata(
          { ...req, params: { collection: 'pages', slot: 'review' } },
          ctx,
        )
      ).status,
    ).toBe(200)
    expect(
      (await stores.adapter.getVersion('pages', 'about', 1, 'en'))?.contract?.metadata.review
        ?.schema,
    ).toMatchObject({ properties: { approved: { type: 'boolean' } } })
    const incompatible = await saveDocument(ctx, {
      ...input,
      isNew: false,
      expectedVersion: 1,
      metadata: { ...input.metadata, review: { approved: false } },
    })
    expect(incompatible.ok).toBe(false)
    if (!incompatible.ok) expect(incompatible.response.status).toBe(422)
  })
  it('exports the chosen revision and imports unchanged authored values without another snapshot', async () => {
    const { ctx, stores } = setup()
    await saveDocument(ctx, { ...input, isNew: true })
    await changePublication(ctx, input, 'publish', 'publisher')
    await saveDocument(ctx, {
      ...input,
      isNew: false,
      expectedVersion: 2,
      metadata: { editorial: { byline: 'Draft author' } },
    })
    const req = {
      method: 'GET',
      path: '',
      params: { collection: 'pages' },
      query: { state: 'published' },
      body: {},
    }
    const exported = await exportContent(req, ctx)
    expect(exported.body).toMatchObject({
      items: [{ metadata: input.metadata, identity: { locale: 'en' } }],
    })
    const current = await stores.adapter.getContent('pages', 'about', 'en')
    if (!current) throw new Error('Expected saved document')
    const unchanged = await importContent(
      {
        ...req,
        method: 'POST',
        query: {},
        body: { items: [repositoryDocument(current, documentChecksum(current))] },
      },
      ctx,
    )
    expect(unchanged.body).toMatchObject({ imported: 0, results: [{ unchanged: true }] })
    expect((await stores.adapter.getContent('pages', 'about', 'en'))?.meta.version).toBe(3)
  })

  it('keeps drafts out of an anonymous export: the published state is public, the current state needs an editor', async () => {
    const { ctx, stores } = setup()
    await saveDocument(ctx, { ...input, isNew: true })
    const anonymous = testContext(
      { id: 'anonymous', email: 'anonymous', name: 'Anonymous', roles: ['viewer'], mode: 'token' },
      stores,
    )
    const request = (state: string) => ({
      method: 'GET',
      path: '',
      params: { collection: 'pages' },
      query: { state },
      headers: {},
      body: {},
    })

    expect((await exportContent(request('current'), anonymous)).status).toBe(403)
    expect((await exportContent(request('current'), testContext(undefined, stores))).status).toBe(
      401,
    )
    expect((await exportContent(request('published'), anonymous)).status).toBe(200)
    expect((await exportContent(request('current'), ctx)).status).toBe(200)
  })

  it('rejects malformed transfers and conflicting database edits without overwriting either revision', async () => {
    const { ctx, stores } = setup()
    await saveDocument(ctx, { ...input, isNew: true })
    const first = await stores.adapter.getContent('pages', 'about', 'en')
    if (!first) throw new Error('Expected saved document')
    const portable = repositoryDocument(first, documentChecksum(first))
    await saveDocument(ctx, {
      ...input,
      isNew: false,
      expectedVersion: 1,
      metadata: { editorial: { byline: 'Database author' } },
    })
    const req = {
      method: 'POST',
      path: '',
      params: { collection: 'pages' },
      query: {},
      body: { items: [{ ...portable, fields: { title: 'Repository title' } }] },
    }
    expect((await importContent(req, ctx)).body).toMatchObject({
      imported: 0,
      results: [{ status: 409 }],
    })
    expect(
      (await importContent({ ...req, body: { items: [{ ...portable, fields: null }] } }, ctx)).body,
    ).toMatchObject({ imported: 0, results: [{ status: 422 }] })
    expect(
      (await stores.adapter.getContent('pages', 'about', 'en'))?.metadata.editorial?.byline,
    ).toBe('Database author')
    expect((await stores.adapter.getVersion('pages', 'about', 1, 'en'))?.metadata).toEqual(
      input.metadata,
    )
  })
})

it('repository edits honor hooks and foreign locks while leaving publication unchanged', async () => {
  const { ctx, stores } = setup()
  await saveDocument(ctx, { ...input, isNew: true })
  const api = createApiHandlers({
    contentConfig: ctx.contentConfig,
    config: ctx.config,
    adapter: ctx.adapter,
    engine: ctx.engine,
    lockAdapter: stores.locks,
    hooks: { beforeSave: async (value) => ({ ...value, fields: { title: 'Hooked title' } }) },
  })
  const edit = { ...input, isNew: false, expectedVersion: 1 }
  await stores.locks.acquireLock(
    'pages',
    'about',
    'en',
    'editor:someone',
    new Date(Date.now() + 60000).toISOString(),
  )
  const blocked = await api.saveRepositoryDocument(edit)
  expect(blocked).toMatchObject({ ok: false, response: { status: 423 } })
  expect((await stores.adapter.getContent('pages', 'about', 'en'))?.meta.version).toBe(1)
  await stores.locks.releaseLock('pages', 'about', 'en')
  expect((await api.saveRepositoryDocument(edit)).ok).toBe(true)
  const saved = await stores.adapter.getContent('pages', 'about', 'en')
  expect(saved?.fields.title).toBe('Hooked title')
  expect(saved?.meta.changedBy).toBe('filesystem')
  expect(saved?.meta.liveVersion).toBeNull()
})

it('applies shared defaults only to the metadata group the author selected', async () => {
  const { ctx, stores } = setup()
  await stores.adapter.saveRuntimeSchema('pages', {
    collection: 'pages',
    updatedAt: new Date().toISOString(),
    fields: [],
    metadata: [
      {
        slot: 'review',
        id: 'test/review',
        label: 'Review',
        required: false,
        schema: {
          type: 'object',
          properties: { date: { type: 'string' } },
          additionalProperties: false,
        },
      },
    ],
  })
  await saveDocument(ctx, {
    ...input,
    slug: 'shared',
    isNew: true,
    metadata: { ...input.metadata, review: { date: '2026-10-08' } },
  })
  await saveDocument(ctx, { ...input, isNew: true, metadata: {} })
  const result = await applyDocumentDefaults(
    {
      method: 'POST',
      path: '',
      params: { collection: 'pages', slug: 'about' },
      query: {},
      body: {
        sourceCollection: 'pages',
        sourceSlug: 'shared',
        locale: 'en',
        slots: ['editorial'],
        apply: true,
        sourceVersion: 1,
        _version: 1,
      },
    },
    ctx,
  )
  expect(result.status).toBe(200)
  const saved = await stores.adapter.getContent('pages', 'about', 'en')
  expect(saved?.metadata).toEqual(input.metadata)
  expect(saved?.metadata.review).toBeUndefined()
  expect(saved?.defaults[0]?.paths).toEqual(['/metadata/editorial/byline'])
})
