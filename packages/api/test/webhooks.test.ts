import {
  openDatabase,
  runMigrations,
  SqliteWebhookDeliveryAdapter,
  sqliteMigrations,
} from '@krantho/persistence-sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebhookConfig } from '../src/types.js'
import { fireWebhooks, processWebhookRetries } from '../src/webhooks.js'

describe('the first send and the retry sweep', () => {
  const hook: WebhookConfig = { url: 'https://hooks.example.test/publish', events: ['publish'] }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('never sends a delivery again while its first send is in flight', async () => {
    const db = openDatabase(':memory:')
    runMigrations(db, sqliteMigrations)
    const sent: string[] = []
    let answer: (res: Response) => void = () => undefined
    vi.stubGlobal('fetch', (url: string) => {
      sent.push(url)
      return new Promise<Response>((resolve) => {
        answer = resolve
      })
    })

    const deliveries = new SqliteWebhookDeliveryAdapter(db)

    fireWebhooks([hook], 'publish', 'pages', 'home', deliveries)
    await processWebhookRetries([hook], deliveries)

    expect(sent).toEqual([hook.url])
    answer(new Response(null, { status: 200 }))
    // The first send records its outcome before the database closes
    await vi.waitFor(() => {
      const row = db.prepare('SELECT delivered_at FROM webhook_deliveries').get() as {
        delivered_at: string | null
      }
      expect(row.delivered_at).not.toBeNull()
    })
    db.close()
  })

  it('retries a configured hook although many deliveries to a removed hook are due', async () => {
    const db = openDatabase(':memory:')
    runMigrations(db, sqliteMigrations)
    const due = new Date(Date.now() - 1000).toISOString()
    const insert = db.prepare(
      `INSERT INTO webhook_deliveries (webhook_url, event, payload, status, attempts, next_retry_at)
       VALUES (?, 'publish', '{}', 503, 1, ?)`,
    )
    for (let i = 0; i < 25; i++) insert.run('https://removed.example.test/hook', due)
    insert.run(hook.url, due)
    const sent: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      sent.push(url)
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    await processWebhookRetries([hook], new SqliteWebhookDeliveryAdapter(db))

    expect(sent).toEqual([hook.url])
    db.close()
  })

  it('logs a failed first send for a retry after the first retry delay', async () => {
    const db = openDatabase(':memory:')
    runMigrations(db, sqliteMigrations)
    const deliveries = new SqliteWebhookDeliveryAdapter(db)
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 503 })))

    const before = Date.now()
    fireWebhooks([hook], 'publish', 'pages', 'home', deliveries)

    await vi.waitFor(async () => {
      const { deliveries: logged } = await deliveries.listDeliveries({ limit: 10, offset: 0 })
      expect(logged[0]).toMatchObject({ status: 503, attempts: 2 })
    })
    const [delivery] = (await deliveries.listDeliveries({ limit: 10, offset: 0 })).deliveries
    const retryAt = Date.parse(delivery?.nextRetryAt ?? '')
    expect(retryAt).toBeGreaterThanOrEqual(before + 30_000)
    expect(retryAt).toBeLessThan(before + 40_000)
    db.close()
  })

  it('backs a failed retry off by the attempts the delivery has made', async () => {
    const db = openDatabase(':memory:')
    runMigrations(db, sqliteMigrations)
    const deliveries = new SqliteWebhookDeliveryAdapter(db)
    const id = await deliveries.logDelivery({
      url: hook.url,
      event: 'publish',
      payload: '{}',
      retryAt: new Date(0),
    })
    await deliveries.markFailed(id, 503, new Date(0))
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 503 })))

    const before = Date.now()
    await processWebhookRetries([hook], deliveries)

    const stored = await deliveries.getDelivery(id)
    expect(stored).toMatchObject({ status: 503, attempts: 3 })
    const retryAt = Date.parse(stored?.nextRetryAt ?? '')
    expect(retryAt).toBeGreaterThanOrEqual(before + 120_000)
    expect(retryAt).toBeLessThan(before + 130_000)
    db.close()
  })

  it('gives every send a timeout', () => {
    const signals: unknown[] = []
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      signals.push(init.signal)
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    fireWebhooks([hook], 'publish', 'pages', 'home')

    expect(signals).toHaveLength(1)
    expect(signals[0]).toBeInstanceOf(AbortSignal)
  })
})
