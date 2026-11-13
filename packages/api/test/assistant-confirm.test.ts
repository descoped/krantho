import { describe, expect, it } from 'vitest'
import {
  type PendingAction,
  sha256Hex,
  signPendingAction,
} from '../src/assistant/pending-action.js'
import { LLMS_TXT_SETTING } from '../src/handlers/seo-llms-txt.js'
import type { AuthenticatedUser } from '../src/types.js'
import { admin, editor } from './assistant/auth.js'
import { asUser, JWT_SECRET, testApi, testContext, testStores } from './assistant/fixtures.js'
import { runTool } from './assistant/run-tool.js'

type Stores = ReturnType<typeof testStores>

function confirm(
  stores: Stores,
  user: AuthenticatedUser | undefined,
  body: unknown,
  contentType?: string,
) {
  return testApi(stores).handle(asUser(user, 'POST', '/api/assistant/confirm', body, contentType))
}

/** Propose publishing pages/about as `user` and return the token Studio receives */
async function proposePublish(stores: Stores, user: AuthenticatedUser = editor): Promise<string> {
  const outcome = await runTool(
    'publish_documents',
    { documents: [{ collection: 'pages', slug: 'about' }] },
    testContext(user, stores),
  )
  expect(JSON.stringify(outcome.result)).not.toContain(
    outcome.activity.pending?.token ?? 'no token',
  )
  return outcome.activity.pending?.token ?? ''
}

async function seedAbout(stores: Stores) {
  return stores.adapter.seed(
    { collection: 'pages', slug: 'about', fields: { title: 'About' } },
    'draft',
  )
}

function token(action: PendingAction, user: AuthenticatedUser, ttl = 600): string {
  return signPendingAction(action, user.id, JWT_SECRET, ttl).token
}

describe('POST /api/assistant/confirm', () => {
  it('rejects a missing, forged, foreign or expired token', async () => {
    const stores = testStores()
    await seedAbout(stores)
    const valid = await proposePublish(stores)

    expect((await confirm(stores, editor, {})).status).toBe(400)
    expect((await confirm(stores, editor, { token: `${valid}x` })).status).toBe(400)
    expect((await confirm(stores, admin, { token: valid })).status).toBe(403)
    const expired = token(
      {
        kind: 'publish',
        documents: [
          { collection: 'pages', slug: 'about', locale: 'en', baseVersion: 1, baseHash: '' },
        ],
      },
      editor,
      -1,
    )
    expect((await confirm(stores, editor, { token: expired })).status).toBe(410)
    expect(await stores.adapter.getPublished('pages', 'about', 'en')).toBeNull()
  })

  it('refuses a cross-site style text/plain request with 415', async () => {
    const stores = testStores()
    await seedAbout(stores)
    const response = await confirm(
      stores,
      editor,
      { token: await proposePublish(stores) },
      'text/plain',
    )
    expect(response.status).toBe(415)
  })

  it('publishes only on confirm, and a replay of the same token is refused', async () => {
    const stores = testStores()
    await seedAbout(stores)
    const publish = await proposePublish(stores)
    expect(await stores.adapter.getPublished('pages', 'about', 'en')).toBeNull()

    const response = await confirm(stores, editor, { token: publish })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      results: [
        {
          collection: 'pages',
          slug: 'about',
          status: 'done',
          message: 'Published pages/about (v2)',
          version: 2,
        },
      ],
    })
    const live = await stores.adapter.getPublished('pages', 'about', 'en')
    expect(live?.meta).toMatchObject({
      version: 2,
      changedBy: 'editor:eddie.editor@example.com via assistant',
    })

    expect((await confirm(stores, editor, { token: publish })).status).toBe(409)
  })

  it('refuses with 409 and writes nothing when the document changed since the proposal', async () => {
    const stores = testStores()
    await seedAbout(stores)
    const publish = await proposePublish(stores)
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'Edited meanwhile' } },
      'draft',
    )

    const response = await confirm(stores, editor, { token: publish })
    expect(response).toMatchObject({
      status: 409,
      body: {
        error: 'Changed since the proposal',
        conflicts: [{ collection: 'pages', slug: 'about', currentVersion: 2 }],
      },
    })
    expect(await stores.adapter.getPublished('pages', 'about', 'en')).toBeNull()
  })

  it('catches a status change at the same version by the hash', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'About' } },
      'published',
    )
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'About 2' } },
      'draft',
    )
    const publish = await proposePublish(stores)
    // An adapter that rewrites the row in place: same version, another status
    const rows = stores.adapter.history.get('pages/about@en') ?? []
    const row = rows[rows.length - 1]
    if (row) {
      row.status = 'archived'
      row.live = null
    }

    expect((await confirm(stores, editor, { token: publish })).status).toBe(409)
  })

  it('checks the role for the kind on the token the user presents now', async () => {
    const stores = testStores()
    await seedAbout(stores)
    const base = { collection: 'pages', slug: 'about', locale: 'en', baseVersion: 1, baseHash: '' }

    expect(
      (
        await confirm(stores, editor, {
          token: token({ kind: 'delete', documents: [base] }, editor),
        })
      ).status,
    ).toBe(403)
    const llms = token({ kind: 'save_llms_txt', beforeHash: '', text: '# x' }, editor)
    expect((await confirm(stores, editor, { token: llms })).status).toBe(403)

    const publish = await proposePublish(stores)
    const demoted: AuthenticatedUser = { ...editor, roles: ['viewer'] }
    expect((await confirm(stores, demoted, { token: publish })).status).toBe(403)
  })

  it('refuses a delete replayed after the document was re-created', async () => {
    const stores = testStores()
    await seedAbout(stores)
    const outcome = await runTool(
      'delete_documents',
      { documents: [{ collection: 'pages', slug: 'about' }] },
      testContext(admin, stores),
    )
    const del = outcome.activity.pending?.token ?? ''

    expect((await confirm(stores, admin, { token: del })).status).toBe(200)
    expect(await stores.adapter.getContent('pages', 'about', 'en')).toBeNull()
    await seedAbout(stores)
    expect((await confirm(stores, admin, { token: del })).status).toBe(409)
    expect(await stores.adapter.getContent('pages', 'about', 'en')).not.toBeNull()
  })

  it('answers 423 while someone else holds the lock', async () => {
    const stores = testStores()
    await seedAbout(stores)
    const publish = await proposePublish(stores)
    await stores.locks.acquireLock(
      'pages',
      'about',
      'en',
      'editor:author@example.com',
      new Date(Date.now() + 60_000).toISOString(),
    )

    const response = await confirm(stores, editor, { token: publish })
    expect(response.status).toBe(423)
    // Studio sends this error back to the model: it must not name the lock holder
    expect(JSON.stringify(response.body)).not.toContain('author@example.com')
  })

  it('saves proposed drafts', async () => {
    const stores = testStores()
    await seedAbout(stores)
    const outcome = await runTool(
      'update_draft',
      { collection: 'pages', slug: 'about', basedOnVersion: 1, fields: { title: 'About us' } },
      testContext(editor, stores),
    )
    const response = await confirm(stores, editor, { token: outcome.activity.pending?.token })

    expect(response.body).toMatchObject({
      ok: true,
      results: [{ status: 'done', message: 'Saved draft pages/about (v2)' }],
    })
    const doc = await stores.adapter.getContent('pages', 'about', 'en')
    expect(doc?.fields.title).toBe('About us')
    expect(doc?.meta.status).toBe('draft')
  })

  it('saves proposed SEO properties into a draft revision and refuses a replay', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      {
        collection: 'pages',
        slug: 'about',
        fields: { title: 'About' },
        metadata: {
          seo: { entities: [{ '@type': 'Product', properties: { name: 'Stool', sku: 'S-1' } }] },
        },
      },
      'published',
    )
    const action: PendingAction = {
      kind: 'save_seo_properties',
      configId: 'doc:pages/about',
      schemaTypes: ['Product'],
      add: { brand: 'Acme' },
      baseVersion: 1,
      locale: 'en',
    }
    const seoToken = token(action, admin)
    expect((await confirm(stores, admin, { token: seoToken })).status).toBe(200)
    const current = await stores.adapter.getContent('pages', 'about', 'en')
    expect(current?.meta).toMatchObject({ version: 2, liveVersion: 1 })
    expect(current?.metadata.seo).toEqual({
      entities: [{ '@type': 'Product', properties: { name: 'Stool', sku: 'S-1', brand: 'Acme' } }],
    })
    expect((await stores.adapter.getPublished('pages', 'about', 'en'))?.metadata.seo).toEqual({
      entities: [{ '@type': 'Product', properties: { name: 'Stool', sku: 'S-1' } }],
    })
    expect(await stores.seo.getConfig('doc:pages/about')).toBeNull()
    expect((await confirm(stores, admin, { token: seoToken })).status).toBe(409)
  })

  it('saves the llms.txt snapshot and refuses a replay', async () => {
    const stores = testStores()
    const llms = token(
      { kind: 'save_llms_txt', beforeHash: sha256Hex(''), text: '# Example\n' },
      admin,
    )
    const first = await confirm(stores, admin, { token: llms })
    expect(first.body).toEqual({
      ok: true,
      results: [{ status: 'done', message: 'Saved llms.txt' }],
    })
    expect(await stores.settings.getSetting(LLMS_TXT_SETTING)).toBe('# Example\n')
    expect((await confirm(stores, admin, { token: llms })).status).toBe(409)
  })
})
