import type { LLMAdapter, LLMOptions } from '@krantho/ai'
import { resolveConfig } from '@krantho/config'
import type { ContentChange } from '@krantho/core'
import type { IPersistenceAdapter } from '@krantho/persistence'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seoEnrich, seoEnrichStatus } from '../src/handlers/seo-enrich.js'
import {
  buildArchetypePrompt,
  isGrounded,
  proposeArchetypeProperties,
} from '../src/handlers/seo-enrich-archetype.js'
import { buildMetaPrompt, enrichMetaDescription } from '../src/handlers/seo-enrich-meta.js'
import type { EnrichJob } from '../src/handlers/seo-enrich-runner.js'
import { jobStore, runEnrichment } from '../src/handlers/seo-enrich-runner.js'
import type { ApiContext } from '../src/types.js'
import { admin } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

/** An LLM that answers with a fixed description and records the options it was called with */
function fakeLlm(description: string): LLMAdapter & { calls: LLMOptions[] } {
  const calls: LLMOptions[] = []
  return {
    calls,
    supportsJsonSchema: true,
    async complete(_prompt, options) {
      calls.push(options ?? {})
      return {
        text: JSON.stringify({ description }),
        usage: { inputTokens: 120, outputTokens: 30 },
        model: 'fake',
        finishReason: 'end_turn',
      }
    },
  }
}

function pendingItem(): EnrichJob['items'][number] {
  return { collection: 'pages', slug: 'home', status: 'pending' }
}

const content = { fields: { title: 'Home' }, body: 'x'.repeat(5000) }
const adapter = { writeContent: async () => {} } as unknown as IPersistenceAdapter

describe('SEO enrichment limits', () => {
  it('defaults to the values the handlers used before they were configurable', () => {
    const config = resolveConfig({ site }, {}, { cwd: '/srv/site' })
    expect(config.seo.enrichment).toEqual({
      meta: { minChars: 120, maxChars: 155, contentCap: 2000, maxTokens: 1024 },
      archetype: { contentCap: 3000, maxTokens: 2048 },
      title: { maxChars: 70 },
    })
  })

  it('caps the meta prompt and states the configured length bounds', () => {
    const limits = { minChars: 50, maxChars: 80, contentCap: 100, maxTokens: 512 }
    const prompt = buildMetaPrompt('Example', 'en', 'y'.repeat(500), limits)
    expect(prompt).toContain('Between 50 and 80 characters')
    expect(prompt).toContain('y'.repeat(100))
    expect(prompt).not.toContain('y'.repeat(101))
  })

  it('caps the archetype prompt at the configured content length', () => {
    const prompt = buildArchetypePrompt(
      'Example',
      'en',
      'Article',
      ['headline'],
      {},
      'z'.repeat(500),
      40,
    )
    expect(prompt).toContain('z'.repeat(40))
    expect(prompt).not.toContain('z'.repeat(41))
  })

  it('asks for a quote that states each property, and for nothing the content does not say', () => {
    const prompt = buildArchetypePrompt('Example', 'en', 'Article', ['headline'], {}, 'Body', 100)
    expect(prompt).toContain('"evidence"')
    expect(prompt).toContain('Never infer')
  })

  it('writes only the properties whose quote is in the content and whose numbers are too', async () => {
    const generated = {
      brand: { value: 'Acme', evidence: 'made by **Acme** in Bergen' },
      telephone: { value: '+47 22 33 44 55', evidence: 'made by Acme in Bergen' },
      category: { value: 'Furniture', evidence: 'a famous furniture maker' },
      keywords: { value: '', evidence: '' },
      slogan: 'Sturdy stools',
    }
    const stores = testStores()
    const stored = await stores.adapter.seed(
      {
        collection: 'pages',
        slug: 'widget',
        fields: { title: 'Widget' },
        body: 'The widget is a sturdy oak stool made by Acme in Bergen.',
      },
      'draft',
    )
    await stores.seo.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Product', properties: {} }] },
    })
    const llm: LLMAdapter = {
      supportsJsonSchema: true,
      async complete() {
        return {
          text: JSON.stringify(generated),
          usage: { inputTokens: 0, outputTokens: 0 },
          model: 'fake',
          finishReason: 'end_turn',
        }
      },
    }
    const proposal = await proposeArchetypeProperties(
      { collection: 'pages', slug: 'widget' },
      stored,
      llm,
      stores.seo,
      site,
      { contentCap: 3000, maxTokens: 2048 },
      false,
      () =>
        ['brand', 'telephone', 'category', 'keywords', 'slogan'].map((property) => ({
          property,
          source: 'llm',
        })),
    )

    expect('skip' in proposal ? {} : proposal.add).toEqual({ brand: 'Acme' })
  })

  it('judges a quote by its words, not by case, punctuation or markdown', () => {
    const sources = '## Contact\n\nCall **us** on 22 33 44 55, Monday–Friday.'
    expect(
      isGrounded({ value: 'Call us on 22 33 44 55', evidence: 'call us on 22 33 44 55' }, sources),
    ).toBe(true)
    expect(
      isGrounded({ value: 'Call us on 22 33 44 99', evidence: 'call us on 22 33 44 55' }, sources),
    ).toBe(false)
    expect(isGrounded({ value: 'Open all night', evidence: 'open all night' }, sources)).toBe(false)
    expect(isGrounded({ value: 'Call us', evidence: '' }, sources)).toBe(false)
    expect(isGrounded('Call us', sources)).toBe(false)
  })

  it('matches whole words: a short quote or number does not hide inside a longer word', () => {
    const sources = 'The party started in 2025 and 55 people came.'
    expect(isGrounded({ value: 'Art party', evidence: 'art' }, sources)).toBe(false)
    expect(
      isGrounded({ value: '5 years of parties', evidence: 'the party started' }, sources),
    ).toBe(false)
    expect(isGrounded({ value: '55 people', evidence: '55 people came' }, sources)).toBe(true)
  })

  it('needs the value’s own words in the content, not only a quote beside it', () => {
    const sources = 'The widget is a sturdy oak stool made by Acme in Bergen.'
    const quote = 'made by Acme in Bergen'
    expect(isGrounded({ value: 'Furniture', evidence: quote }, sources)).toBe(false)
    expect(isGrounded({ value: 'A sturdy oak stool from Bergen', evidence: quote }, sources)).toBe(
      true,
    )
    expect(isGrounded({ value: 'Acme', evidence: 'Acme' }, sources)).toBe(true)
    expect(isGrounded({ value: 'Acme', evidence: 'the' }, sources)).toBe(false)
  })

  it('truncates to the configured maximum and sends the configured token budget', async () => {
    const limits = { minChars: 20, maxChars: 40, contentCap: 2000, maxTokens: 300 }
    const llm = fakeLlm('A description that runs well past the configured forty character limit')
    const item = pendingItem()

    const stores = testStores()
    const stored = await stores.adapter.seed(
      { collection: 'pages', slug: 'home', fields: content.fields, body: content.body },
      'draft',
    )
    const outcome = await enrichMetaDescription(
      item,
      stored,
      llm,
      testContext(admin, stores),
      null,
      site,
      limits,
      false,
    )

    expect(outcome).toBe('generated')
    expect(llm.calls[0]?.maxTokens).toBe(300)
    const written = item.result?.split(': ')[1] ?? ''
    expect(written.length).toBeLessThanOrEqual(40)
  })
})

describe('SEO enrichment job', () => {
  it('announces a draft document save, without changing live SEO or announcing skipped items', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      {
        collection: 'pages',
        slug: 'home',
        fields: { title: 'Home' },
        body: 'Body text. '.repeat(40),
      },
      'published',
    )
    const ctx = testContext(admin, stores)
    const changes: ContentChange[] = []
    ctx.changeListeners = [
      async (change) => {
        changes.push(change)
      },
    ]
    const job: EnrichJob = {
      id: 'job',
      status: 'running',
      type: 'meta-descriptions',
      items: [pendingItem(), { collection: 'pages', slug: 'missing', status: 'pending' }],
      startedAt: 0,
      updatedAt: 0,
      force: false,
      usage: { inputTokens: 0, outputTokens: 0, model: null },
    }
    await runEnrichment(
      job,
      fakeLlm('A description of the home page that is long enough to pass the checks.'),
      ctx,
      'meta-descriptions',
      false,
    )
    expect(job.summary).toEqual({ generated: 1, skipped: 1, errors: 0 })
    expect(changes).toEqual([
      { kind: 'document', collection: 'pages', slug: 'home', locale: 'en', live: false },
    ])
    expect(
      (await stores.adapter.getPublished('pages', 'home', 'en'))?.fields['description'],
    ).toBeUndefined()
  })

  it('totals the tokens and names the model, and the status endpoint reports them', async () => {
    const stores = testStores()
    for (const slug of ['home', 'about']) {
      await stores.adapter.seed(
        { collection: 'pages', slug, fields: { title: slug }, body: 'Body text. '.repeat(40) },
        'published',
      )
    }
    const job: EnrichJob = {
      id: 'job',
      status: 'running',
      type: 'meta-descriptions',
      items: [
        pendingItem(),
        { collection: 'pages', slug: 'about', status: 'pending' },
        { collection: 'pages', slug: 'missing', status: 'pending' },
      ],
      startedAt: 0,
      updatedAt: 0,
      force: false,
      usage: { inputTokens: 0, outputTokens: 0, model: null },
    }
    const ctx = testContext(admin, stores)
    await runEnrichment(
      job,
      fakeLlm('A description of the page that is long enough to pass the checks.'),
      ctx,
      'meta-descriptions',
      false,
    )
    expect(job.usage).toEqual({ inputTokens: 240, outputTokens: 60, model: 'fake' })

    jobStore.set(job)
    const status = await seoEnrichStatus({ query: { jobId: 'job' } } as never, ctx)
    expect((status.body as { usage: unknown }).usage).toEqual(job.usage)
  })

  it('completes with zero totals when the provider reports no usage', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      {
        collection: 'pages',
        slug: 'home',
        fields: { title: 'Home' },
        body: 'Body text. '.repeat(40),
      },
      'published',
    )
    const quiet: LLMAdapter = {
      supportsJsonSchema: true,
      async complete() {
        return {
          text: JSON.stringify({
            description: 'A description of the home page that is long enough to pass the checks.',
          }),
          usage: { inputTokens: 0, outputTokens: 0 },
          model: '',
          finishReason: 'end_turn',
        }
      },
    }
    const job: EnrichJob = {
      id: 'job',
      status: 'running',
      type: 'meta-descriptions',
      items: [pendingItem()],
      startedAt: 0,
      updatedAt: 0,
      force: false,
      usage: { inputTokens: 0, outputTokens: 0, model: null },
    }
    await runEnrichment(job, quiet, testContext(admin, stores), 'meta-descriptions', false)
    expect(job.status).toBe('complete')
    expect(job.summary).toEqual({ generated: 1, skipped: 0, errors: 0 })
    expect(job.usage).toEqual({ inputTokens: 0, outputTokens: 0, model: null })
  })

  it('leaves a document someone else is editing alone before calling the model', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      {
        collection: 'pages',
        slug: 'home',
        fields: { title: 'Home' },
        body: 'Body text. '.repeat(40),
      },
      'published',
    )
    await stores.locks.acquireLock(
      'pages',
      'home',
      'en',
      'another-user',
      new Date(Date.now() + 60_000).toISOString(),
    )
    const ctx = testContext(admin, stores)
    const job: EnrichJob = {
      id: 'job',
      status: 'running',
      type: 'meta-descriptions',
      items: [pendingItem()],
      startedAt: 0,
      updatedAt: 0,
      force: false,
      usage: { inputTokens: 0, outputTokens: 0, model: null },
    }
    const llm = fakeLlm('Description')
    await runEnrichment(job, llm, ctx, 'meta-descriptions', false)
    expect(job.items[0]).toMatchObject({
      status: 'skipped',
      result: 'Being edited by another user',
    })
    expect(llm.calls).toHaveLength(0)
    expect((await stores.adapter.getContent('pages', 'home', 'en'))?.meta.version).toBe(1)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hands the job that outlives the request to waitUntil', async () => {
    // The provider is never reached: every model call fails, and the job settles
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    const running: Promise<unknown>[] = []
    const ctx = {
      config: resolveConfig({ site }, {}, { cwd: '/srv/site' }),
      auth: { id: 'u', email: 'a@example.com', name: 'Admin', roles: ['admin'], mode: 'none' },
      contentConfig: { collections: new Map([['pages', {}]]) },
      adapter: {
        query: async () => ({
          items: [{ collection: 'pages', slug: 'home', locale: 'en' }],
          hasMore: false,
        }),
        getContent: async () => ({
          meta: {},
          fields: { title: 'Home' },
          body: 'Body. '.repeat(80),
        }),
        writeContent: async () => {},
      },
      siteSettingsAdapter: {
        getSetting: async (key: string) => (key === 'llm.provider' ? 'ollama' : null),
      },
      waitUntil: (work: Promise<unknown>) => {
        running.push(work)
      },
    } as unknown as ApiContext

    const response = await seoEnrich(
      { method: 'POST', path: '', params: {}, query: {}, headers: {}, body: {} },
      ctx,
    )

    expect(response.status).toBe(202)
    expect(running).toHaveLength(1)
    await running[0]
    expect(jobStore.get()?.status).not.toBe('running')
  })
})
