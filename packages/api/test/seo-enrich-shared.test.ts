import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seoEnrich, seoEnrichStatus } from '../src/handlers/seo-enrich.js'
import { type EnrichJob, jobStore, runEnrichment } from '../src/handlers/seo-enrich-runner.js'
import type { ApiContext, ApiRequest } from '../src/types.js'
import { admin } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'
import { fakeCompletion } from './assistant/run-tool.js'

/**
 * Enrichment on a serverless host: consecutive requests may reach different instances, and the
 * function that runs a job may be frozen or ended. The job is saved where every instance reads
 * it, and a job that lost its runner goes on from its pending items.
 */

const DESCRIPTION =
  'A page about the widget, a sturdy oak stool made by Acme in Bergen, with the care it needs and how to order one.'

const request = (query: Record<string, string> = {}, body: unknown = {}): ApiRequest => ({
  method: 'POST',
  path: '',
  params: {},
  query,
  headers: {},
  body,
})

/** The context of one instance: its own waitUntil, the stores shared with every other instance */
function instance(stores: ReturnType<typeof testStores>): {
  ctx: ApiContext
  settled: () => Promise<unknown>
} {
  const running: Promise<unknown>[] = []
  const ctx = {
    ...testContext(admin, stores),
    waitUntil: (work: Promise<unknown>) => {
      running.push(work)
    },
  }
  return { ctx, settled: () => Promise.all(running) }
}

async function seedPages(stores: ReturnType<typeof testStores>, slugs: string[]): Promise<void> {
  for (const slug of slugs) {
    await stores.adapter.seed(
      { collection: 'pages', slug, fields: { title: slug }, body: 'Body text. '.repeat(40) },
      'published',
    )
  }
}

/** A running job another instance saved, `ago` milliseconds after it last saved its progress */
async function saveJob(
  stores: ReturnType<typeof testStores>,
  ago: number,
  items: EnrichJob['items'],
): Promise<void> {
  const job: EnrichJob = {
    id: 'enrich-1',
    status: 'running',
    type: 'meta-descriptions',
    force: false,
    items,
    startedAt: Date.now() - ago,
    updatedAt: Date.now() - ago,
    usage: { inputTokens: 0, outputTokens: 0, model: null },
  }
  await stores.settings.setSetting('seo.enrich.job', JSON.stringify(job))
}

beforeEach(() => {
  jobStore.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('enrichment jobs across instances', () => {
  it('answers for a job from an instance that never saw it', async () => {
    const stores = testStores()
    await seedPages(stores, ['a', 'b'])
    await fakeCompletion(stores.settings, { description: DESCRIPTION })
    const first = instance(stores)

    const started = await seoEnrich(
      request({}, { scope: 'collection', collection: 'pages' }),
      first.ctx,
    )
    await first.settled()
    expect(started.status).toBe(202)

    // Another instance: nothing in its memory, the same database
    jobStore.clear()
    const status = await seoEnrichStatus(
      request({ jobId: (started.body as { jobId: string }).jobId }),
      instance(stores).ctx,
    )

    expect(status.status).toBe(200)
    expect(status.body).toMatchObject({ status: 'complete', progress: { total: 2 } })
  })

  it('answers 404 when no instance has the job', async () => {
    const status = await seoEnrichStatus(request({ jobId: 'enrich-0' }), instance(testStores()).ctx)
    expect(status.status).toBe(404)
  })

  it('goes on from the pending items when the runner is lost, without running finished items again', async () => {
    const stores = testStores()
    await seedPages(stores, ['a', 'b'])
    const fetchMock = await fakeCompletion(stores.settings, { description: DESCRIPTION })
    await saveJob(stores, 5 * 60_000, [
      { collection: 'pages', slug: 'a', status: 'complete', result: 'Wrote 112 characters' },
      { collection: 'pages', slug: 'b', status: 'pending' },
    ])
    const second = instance(stores)

    const status = await seoEnrichStatus(request({ jobId: 'enrich-1' }), second.ctx)
    await second.settled()

    expect(status.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(
      (await stores.settings.getSetting('seo.enrich.job')) ?? '{}',
    ) as EnrichJob
    expect(saved.status).toBe('complete')
    expect(saved.items.map((item) => item.slug)).toEqual(['a', 'b'])
    expect(saved.items[0]?.result).toBe('Wrote 112 characters')
    expect(saved.summary?.generated).toBe(2)
  })

  it('leaves a job alone while its runner keeps saving', async () => {
    const stores = testStores()
    await seedPages(stores, ['a'])
    const fetchMock = await fakeCompletion(stores.settings, { description: DESCRIPTION })
    await saveJob(stores, 1_000, [{ collection: 'pages', slug: 'a', status: 'generating' }])
    const other = instance(stores)

    const status = await seoEnrichStatus(request({ jobId: 'enrich-1' }), other.ctx)
    await other.settled()

    expect(status.body).toMatchObject({ status: 'running' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a second job while one runs on another instance, and takes one once it lost its runner', async () => {
    const stores = testStores()
    await seedPages(stores, ['a'])
    await fakeCompletion(stores.settings, { description: DESCRIPTION })
    const items: EnrichJob['items'] = [{ collection: 'pages', slug: 'a', status: 'pending' }]

    await saveJob(stores, 1_000, items)
    const refused = await seoEnrich(request({}, { scope: 'all' }), instance(stores).ctx)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ jobId: 'enrich-1' })

    await saveJob(stores, 5 * 60_000, items)
    const lateInstance = instance(stores)
    const accepted = await seoEnrich(request({}, { scope: 'all' }), lateInstance.ctx)
    await lateInstance.settled()
    expect(accepted.status).toBe(202)
  })

  it('takes over a job its own instance lost, from the pending items', async () => {
    const stores = testStores()
    await seedPages(stores, ['a', 'b'])
    const fetchMock = await fakeCompletion(stores.settings, { description: DESCRIPTION })
    const lost: EnrichJob = {
      id: 'enrich-1',
      status: 'running',
      type: 'meta-descriptions',
      force: false,
      items: [
        { collection: 'pages', slug: 'a', status: 'complete' },
        { collection: 'pages', slug: 'b', status: 'pending' },
      ],
      startedAt: 0,
      updatedAt: Date.now() - 5 * 60_000,
      usage: { inputTokens: 0, outputTokens: 0, model: null },
    }
    jobStore.set(lost)
    const same = instance(stores)

    await seoEnrichStatus(request({ jobId: 'enrich-1' }), same.ctx)
    await same.settled()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(jobStore.get()?.status).toBe('complete')
  })

  it('stops a run that finds another run has taken its job over', async () => {
    const stores = testStores()
    await seedPages(stores, ['a', 'b', 'c'])
    const { ctx } = instance(stores)
    const job: EnrichJob = {
      id: 'enrich-1',
      status: 'running',
      type: 'meta-descriptions',
      force: false,
      items: ['a', 'b', 'c'].map((slug) => ({
        collection: 'pages',
        slug,
        status: 'pending' as const,
      })),
      startedAt: 0,
      updatedAt: Date.now(),
      usage: { inputTokens: 0, outputTokens: 0, model: null },
    }
    let calls = 0
    const llm = {
      supportsJsonSchema: true,
      async complete() {
        calls++
        // Another instance takes the job over while the first item is generated
        const stored = JSON.parse((await stores.settings.getSetting('seo.enrich.job')) ?? '{}')
        await stores.settings.setSetting(
          'seo.enrich.job',
          JSON.stringify({ ...stored, runner: 'other-run' }),
        )
        return {
          text: JSON.stringify({ description: DESCRIPTION }),
          usage: { inputTokens: 1, outputTokens: 1 },
          model: 'fake',
          finishReason: 'end_turn',
        }
      },
    }

    await runEnrichment(job, llm, ctx, 'meta-descriptions', false)

    expect(calls).toBe(1)
    expect(job.status).toBe('running')
    expect(job.items.map((item) => item.status)).toEqual(['complete', 'pending', 'pending'])
  })

  it('does not take a malformed saved job for a job', async () => {
    const stores = testStores()
    await stores.settings.setSetting('seo.enrich.job', JSON.stringify({ id: 'x', items: [] }))
    const status = await seoEnrichStatus(request({ jobId: 'x' }), instance(stores).ctx)
    expect(status.status).toBe(404)
  })
})
