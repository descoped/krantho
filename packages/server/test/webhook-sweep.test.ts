import type { WebhookConfig } from '@krantho/api'
import type { IWebhookDeliveryAdapter } from '@krantho/persistence'
import {
  openDatabase,
  runMigrations,
  SqliteWebhookDeliveryAdapter,
  sqliteMigrations,
} from '@krantho/persistence-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebhookSweep, WEBHOOK_SWEEP_INTERVAL_MS } from '../src/webhook-sweep.js'

const HOOK: WebhookConfig = { url: 'https://hooks.example.test/publish', events: ['publish'] }
const PAYLOAD = JSON.stringify({ event: 'publish', collection: 'pages', slug: 'home' })

let db: ReturnType<typeof openDatabase>
let deliveries: SqliteWebhookDeliveryAdapter
let now: number
let sent: string[]
let work: Promise<unknown>[]
let answer: () => Promise<Response>

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db, sqliteMigrations)
  deliveries = new SqliteWebhookDeliveryAdapter(db)
  now = 1_000_000
  sent = []
  work = []
  answer = async () => new Response(null, { status: 200 })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      sent.push(url)
      return answer()
    }),
  )
})

afterEach(() => {
  db.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A failed-once delivery, due again `dueInMs` from now (negative: already due) */
function seed(dueInMs: number, url = HOOK.url): number {
  const dueAt = new Date(Date.now() + dueInMs).toISOString()
  const row = db
    .prepare(
      `INSERT INTO webhook_deliveries (webhook_url, event, payload, status, attempts, next_retry_at)
       VALUES (?, 'publish', ?, 503, 1, ?) RETURNING id`,
    )
    .get(url, PAYLOAD, dueAt) as { id: number }
  return row.id
}

function deliveredAt(id: number): unknown {
  const row = db.prepare('SELECT delivered_at FROM webhook_deliveries WHERE id = ?').get(id) as {
    delivered_at: string | null
  }
  return row.delivered_at
}

function sweep(): () => void {
  return createWebhookSweep({
    webhooks: [HOOK],
    deliveries,
    waitUntil: (job) => {
      work.push(job)
    },
    now: () => now,
  })
}

describe('createWebhookSweep', () => {
  it('retries a delivery that is due and marks it delivered', async () => {
    const id = seed(-1000)
    sweep()()
    await Promise.all(work)

    expect(sent).toEqual([HOOK.url])
    expect(deliveredAt(id)).not.toBeNull()
  })

  it('leaves a delivery that is held until later', async () => {
    const id = seed(60 * 60 * 1000)
    sweep()()
    await Promise.all(work)

    expect(sent).toEqual([])
    expect(deliveredAt(id)).toBeNull()
  })

  it('runs at most once per interval', async () => {
    answer = async () => new Response(null, { status: 500 })
    const run = sweep()
    const id = seed(-1000)

    run()
    await Promise.all(work)
    expect(sent).toHaveLength(1)

    db.prepare('UPDATE webhook_deliveries SET next_retry_at = ? WHERE id = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      id,
    )
    now += WEBHOOK_SWEEP_INTERVAL_MS - 1
    run()
    await Promise.all(work)
    expect(work).toHaveLength(1)
    expect(sent).toHaveLength(1)

    now += 1
    run()
    await Promise.all(work)
    expect(work).toHaveLength(2)
    expect(sent).toHaveLength(2)
  })

  it('does not start a sweep while one is still running', async () => {
    let finish: (res: Response) => void = () => {}
    answer = () => new Promise<Response>((resolve) => (finish = resolve))
    const run = sweep()
    seed(-1000)

    run()
    now += WEBHOOK_SWEEP_INTERVAL_MS * 2
    run()
    expect(work).toHaveLength(1)

    // The sweep reads the due deliveries after the caller's own work, then sends
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    finish(new Response(null, { status: 200 }))
    await Promise.all(work)
    now += WEBHOOK_SWEEP_INTERVAL_MS
    run()
    expect(work).toHaveLength(2)
  })

  it('logs a failing sweep and never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = createWebhookSweep({
      webhooks: [HOOK],
      deliveries: {
        claimDueDeliveries: () => Promise.reject(new Error('database is locked')),
      } as unknown as IWebhookDeliveryAdapter,
      waitUntil: (job) => {
        work.push(job)
      },
      now: () => now,
    })

    expect(() => broken()).not.toThrow()
    await expect(Promise.all(work)).resolves.toBeDefined()
    expect(warn).toHaveBeenCalledWith('[webhook] Retry sweep failed:', expect.any(Error))
  })

  it('runs without a waitUntil', async () => {
    const id = seed(-1000)
    createWebhookSweep({ webhooks: [HOOK], deliveries, now: () => now })()
    await vi.waitFor(() => expect(deliveredAt(id)).not.toBeNull())
  })
})
