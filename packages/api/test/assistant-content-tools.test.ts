import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyPendingAction } from '../src/assistant/pending-action.js'
import { toolsForUser } from '../src/assistant/tool-registry.js'
import { questionSlug } from '../src/assistant/tools/faq-fit.js'
import { admin, editor } from './assistant/auth.js'
import { JWT_SECRET, testContext, testStores } from './assistant/fixtures.js'
import { fakeCompletion, newRequest, runTool } from './assistant/run-tool.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

type Stores = ReturnType<typeof testStores>

function pendingAction(
  outcome: { activity: { pending?: { token: string } | undefined } },
  userId: string,
) {
  const token = outcome.activity.pending?.token ?? ''
  const verified = verifyPendingAction(token, userId, JWT_SECRET)
  if (!verified.ok) throw new Error(verified.error)
  return verified.action
}

async function seedPage(stores: Stores, slug: string, fields: Record<string, unknown>, body = '') {
  return stores.adapter.seed(
    { collection: 'pages', slug, fields: { title: slug, ...fields }, body },
    'draft',
  )
}

describe('SEO tools', () => {
  it('writes only the description field for a missing meta description, as a draft', async () => {
    const stores = testStores()
    await seedPage(
      stores,
      'about',
      {},
      'We build furniture by hand in a small workshop by the sea.',
    )
    await fakeCompletion(stores.settings, {
      description: 'Handmade furniture from a seaside workshop.',
    })

    const request = newRequest()
    const spent: number[] = []
    request.spend = (usage) => spent.push(usage.inputTokens + usage.outputTokens)
    const outcome = await runTool(
      'seo_fill_meta_description',
      { collection: 'pages', slug: 'about' },
      testContext(admin, stores),
      request,
    )

    expect(outcome.result).toMatchObject({ ok: true, field: 'description' })
    // Generated from the document's text: it returns to the model framed as untrusted
    expect(String(outcome.result['description'])).toMatch(
      /^<untrusted-content id="[0-9a-f]+" source="pages\/about">\nHandmade furniture from a seaside workshop\.\n<\/untrusted-content/,
    )
    // The tool's own model call counts toward the request's token budget
    expect(spent).toHaveLength(1)
    const doc = await stores.adapter.getContent('pages', 'about', 'en')
    expect(doc?.fields).toEqual({
      title: 'about',
      description: 'Handmade furniture from a seaside workshop.',
    })
    expect(doc?.meta.changedBy).toBe('admin:ada.admin@example.com via assistant')
    expect(stores.seo.configs.size).toBe(0)
  })

  it('skips a document that has a description, without calling the model', async () => {
    const stores = testStores()
    await seedPage(
      stores,
      'about',
      { description: 'Already here.' },
      'Body text that is long enough to describe.',
    )
    const fetchMock = await fakeCompletion(stores.settings, { description: 'unused' })

    const outcome = await runTool(
      'seo_fill_meta_description',
      { collection: 'pages', slug: 'about' },
      testContext(admin, stores),
    )

    expect(outcome.result).toMatchObject({ ok: true, skipped: true })
    expect(String(outcome.result['reason'])).toContain('Already has description')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('always proposes generated Schema.org properties', async () => {
    const stores = testStores()
    await stores.seo.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Product', properties: {} }] },
    })
    await seedPage(stores, 'widget', {}, 'The widget is a sturdy oak stool made by Acme in Bergen.')
    await fakeCompletion(stores.settings, {
      brand: { value: 'Acme', evidence: 'made by Acme in Bergen' },
    })

    const outcome = await runTool(
      'seo_fill_archetype_properties',
      { collection: 'pages', slug: 'widget' },
      testContext(admin, stores),
    )

    expect(outcome.activity.status).toBe('pending')
    expect(pendingAction(outcome, admin.id)).toEqual({
      kind: 'save_seo_properties',
      baseVersion: 1,
      locale: 'en',
      configId: 'doc:pages/widget',
      schemaTypes: ['Product'],
      add: { brand: 'Acme' },
    })
    expect(stores.seo.configs.has('doc:pages/widget')).toBe(false)
  })

  it('returns findings from seo_validate', async () => {
    const stores = testStores()
    await seedPage(stores, 'about', {})
    const outcome = await runTool(
      'seo_validate',
      { collection: 'pages', slug: 'about' },
      testContext(editor, stores),
    )
    expect(outcome.activity.findings).toContainEqual(
      expect.objectContaining({ check: 'meta-description', severity: 'error' }),
    )
  })
})

describe('AEO tools', () => {
  it('saves an answer summary into the collection summary field', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'articles', slug: 'guide', fields: { title: 'Guide' } },
      'draft',
    )
    const summary = 'A guide explaining how to care for oak furniture with oil twice a year.'
    const outcome = await runTool(
      'answer_summary',
      { collection: 'articles', slug: 'guide', basedOnVersion: 1, summary },
      testContext(editor, stores),
    )
    expect(outcome.result).toMatchObject({ ok: true, field: 'answer-summary' })
    expect(
      (await stores.adapter.getContent('articles', 'guide', 'en'))?.fields['answer-summary'],
    ).toBe(summary)
  })

  it('shows the summary to the user when the collection has no summary field', async () => {
    const stores = testStores()
    await seedPage(stores, 'about', {})
    const outcome = await runTool(
      'answer_summary',
      {
        collection: 'pages',
        slug: 'about',
        basedOnVersion: 1,
        summary: 'A summary of twenty or more characters.',
      },
      testContext(editor, stores),
    )
    expect(outcome.result).toMatchObject({ ok: true, proposed: true })
    expect(outcome.activity).toMatchObject({
      status: 'proposed',
      proposal: { items: [{ label: 'Summary' }] },
    })
    expect(await stores.adapter.listVersions('pages', 'about', 'en')).toHaveLength(1)
  })

  it('proposes one FAQ draft per entry with unique slugs', async () => {
    const stores = testStores()
    await seedPage(stores, 'about', {})
    await stores.adapter.seed(
      { collection: 'faq', slug: 'what-do-you-make', fields: { question: 'q', answer: 'a' } },
      'draft',
    )
    const entries = [
      { question: 'What do you make?', answer: 'Furniture.' },
      { question: 'What do you make?!', answer: 'Stools.' },
    ]
    const outcome = await runTool(
      'faq_from_document',
      { sourceCollection: 'pages', sourceSlug: 'about', targetCollection: 'faq', entries },
      testContext(editor, stores),
    )

    expect(outcome.activity.status).toBe('pending')
    const action = pendingAction(outcome, editor.id)
    expect(action.kind).toBe('save_documents')
    if (action.kind !== 'save_documents') return
    expect(action.documents.map((doc) => doc.slug)).toEqual([
      'what-do-you-make-2',
      'what-do-you-make-3',
    ])
    expect(action.documents[0]).toMatchObject({
      baseVersion: 0,
      baseHash: '',
      fields: {
        question: 'What do you make?',
        answer: 'Furniture.',
        title: 'What do you make?',
      },
    })
    expect(await stores.adapter.getContent('faq', 'what-do-you-make-2', 'en')).toBeNull()
  })

  it('lists the entries for the user when the collection does not fit', async () => {
    const stores = testStores()
    await seedPage(stores, 'about', {})
    const outcome = await runTool(
      'faq_from_document',
      {
        sourceCollection: 'pages',
        sourceSlug: 'about',
        targetCollection: 'notes',
        entries: [{ question: 'Q?', answer: 'A.' }],
      },
      testContext(editor, stores),
    )
    expect(outcome.result).toMatchObject({ ok: true, proposed: true })
    expect(String(outcome.result['reason'])).toContain('no question field')
    expect(outcome.activity.proposal?.items).toEqual([{ label: 'Q?', text: 'A.' }])
  })

  it('makes slugs from questions', () => {
    expect(questionSlug('Hvordan får jeg time?')).toBe('hvordan-far-jeg-time')
    expect(questionSlug('???')).toBe('question')
    expect(questionSlug('a'.repeat(100)).length).toBe(60)
  })

  it('proposes a regenerated llms.txt and is not offered to an editor', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'About' } },
      'published',
    )
    const outcome = await runTool(
      'regenerate_llms_txt',
      { summary: 'We make furniture.' },
      testContext(admin, stores),
    )

    expect(outcome.activity.status).toBe('pending')
    const action = pendingAction(outcome, admin.id)
    expect(action).toMatchObject({ kind: 'save_llms_txt' })
    if (action.kind === 'save_llms_txt') expect(action.text).toContain('> We make furniture.')
    expect(toolsForUser(testContext(editor, stores)).map((tool) => tool.name)).not.toContain(
      'regenerate_llms_txt',
    )

    const unchanged = await runTool('regenerate_llms_txt', {}, testContext(admin, stores))
    expect(unchanged.result).toEqual({ ok: true, unchanged: true })
  })
})

describe('publish and delete proposals', () => {
  it('proposes publishing with each base version and what goes live', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'Draft' } },
      'draft',
    )
    const outcome = await runTool(
      'publish_documents',
      { documents: [{ collection: 'pages', slug: 'about' }] },
      testContext(editor, stores),
    )

    expect(outcome.activity.changes?.[0]).toMatchObject({
      status: { before: 'draft', after: 'published' },
    })
    expect(await stores.adapter.getPublished('pages', 'about', 'en')).toBeNull()
  })

  it('proposes publishing the changes of a live page, which stays published', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'Old' } },
      'published',
    )
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', fields: { title: 'New' } },
      'draft',
    )
    const outcome = await runTool(
      'publish_documents',
      { documents: [{ collection: 'pages', slug: 'about' }] },
      testContext(editor, stores),
    )

    const action = pendingAction(outcome, editor.id)
    expect(action).toMatchObject({
      kind: 'publish',
      documents: [{ collection: 'pages', slug: 'about', locale: 'en', baseVersion: 2 }],
    })
    expect(outcome.activity.changes?.[0]).toMatchObject({
      fields: [{ name: 'title', before: 'Old', after: 'New' }],
    })
    expect(outcome.activity.changes?.[0]?.status).toBeUndefined()
    expect((await stores.adapter.getPublished('pages', 'about', 'en'))?.meta.version).toBe(1)
  })

  it('leaves referenced documents out of a delete proposal', async () => {
    const stores = testStores()
    await stores.adapter.saveRuntimeSchema('notes', {
      collection: 'notes',
      fields: [{ name: 'page', type: 'reference', refCollection: 'pages', required: false }],
      updatedAt: '2026-01-01',
    })
    await seedPage(stores, 'linked', {})
    await seedPage(stores, 'free', {})
    await stores.adapter.seed(
      { collection: 'notes', slug: 'n1', fields: { title: 'n', category: 'c', page: 'linked' } },
      'draft',
    )

    const outcome = await runTool(
      'delete_documents',
      {
        documents: [
          { collection: 'pages', slug: 'linked' },
          { collection: 'pages', slug: 'free' },
        ],
      },
      testContext(admin, stores),
    )

    const action = pendingAction(outcome, admin.id)
    expect(action).toMatchObject({ kind: 'delete', documents: [{ slug: 'free', baseVersion: 1 }] })
    expect(outcome.activity.pending?.destructive).toBe(true)
    expect(String((outcome.result['leftOut'] as string[])[0])).toContain('referenced by notes/n1')
  })
})
