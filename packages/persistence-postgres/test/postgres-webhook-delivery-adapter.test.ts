import { MAX_WEBHOOK_ATTEMPTS } from '@krantho/persistence'
import type { Sql } from 'postgres'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../src/migration-runner.js'
import { postgresMigrations } from '../src/migrations/index.js'
import { PostgresWebhookDeliveryAdapter } from '../src/postgres-webhook-delivery-adapter.js'

const URL = 'https://hook.example.test'
const OTHER = 'https://other.example.test'
const PAYLOAD = '{"slug":"home","event":"publish"}'

describe('PostgresWebhookDeliveryAdapter (integration)', () => {
  let sql: Sql
  let deliveries: PostgresWebhookDeliveryAdapter

  beforeAll(async () => {
    const connectionUri = process.env.KRANTHO_TEST_POSTGRES_URL
    if (!connectionUri) {
      throw new Error('KRANTHO_TEST_POSTGRES_URL not set — globalSetup did not run.')
    }
    sql = postgres(connectionUri, { max: 4, onnotice: () => {} })
    await runMigrations(sql, postgresMigrations)
    deliveries = new PostgresWebhookDeliveryAdapter(sql)
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  beforeEach(async () => {
    await sql`TRUNCATE TABLE webhook_deliveries RESTART IDENTITY`
  })

  const log = (url = URL, retryAt = new Date('2030-01-01T00:00:00.000Z')): Promise<number> =>
    deliveries.logDelivery({ url, event: 'publish', payload: PAYLOAD, retryAt })

  it('logs a first send with one attempt made, due when asked, and no outcome', async () => {
    const retryAt = new Date('2030-01-01T00:00:00.000Z')
    const id = await log(URL, retryAt)
    const stored = await deliveries.getDelivery(id)
    expect(stored).toMatchObject({
      id,
      url: URL,
      event: 'publish',
      status: null,
      attempts: 1,
      nextRetryAt: retryAt.toISOString(),
      deliveredAt: null,
    })
    // The payload is stored as JSON and read back as the JSON it carried
    expect(JSON.parse(stored?.payload ?? '')).toEqual(JSON.parse(PAYLOAD))
    expect(await deliveries.getDelivery(id + 1)).toBeNull()
  })

  it('marks a delivery delivered with its status, so it lists as delivered', async () => {
    const id = await log()
    await deliveries.markDelivered(id, 204)
    const stored = await deliveries.getDelivery(id)
    expect(stored).toMatchObject({ status: 204, attempts: 1 })
    expect(stored?.deliveredAt).toMatch(/Z$/)
    const { total } = await deliveries.listDeliveries({ limit: 10, offset: 0, status: 'delivered' })
    expect(total).toBe(1)
  })

  it('marks a failed attempt: the status, one more attempt, the next retry time', async () => {
    const id = await log()
    const nextRetryAt = new Date('2031-02-03T04:05:06.000Z')
    await deliveries.markFailed(id, 503, nextRetryAt)
    expect(await deliveries.getDelivery(id)).toMatchObject({
      status: 503,
      attempts: 2,
      nextRetryAt: nextRetryAt.toISOString(),
      deliveredAt: null,
    })
  })

  it('re-queues a failed delivery with one attempt left, and leaves the others alone', async () => {
    const failed = await log()
    await sql`UPDATE webhook_deliveries SET attempts = ${MAX_WEBHOOK_ATTEMPTS} WHERE id = ${failed}`
    const pending = await log()
    const dueAt = new Date('2030-01-01T00:00:00.000Z')

    const requeued = await deliveries.requeueDelivery(failed, dueAt)

    expect(requeued).toMatchObject({ id: failed, attempts: MAX_WEBHOOK_ATTEMPTS - 1 })
    expect(requeued?.nextRetryAt).toBe(dueAt.toISOString())
    expect(requeued).not.toHaveProperty('payload')
    expect(await deliveries.requeueDelivery(pending, dueAt)).toBeNull()
    expect(await deliveries.requeueDelivery(999, dueAt)).toBeNull()
  })

  it('claims the due deliveries oldest first, for the given URLs only, up to the limit, and holds them', async () => {
    const now = new Date('2030-06-01T00:00:00.000Z')
    const due = new Date('2030-05-01T00:00:00.000Z')
    const first = await log(URL, due)
    const second = await log(URL, due)
    await log(OTHER, due)
    await log(URL, new Date('2030-07-01T00:00:00.000Z'))
    const delivered = await log(URL, due)
    await deliveries.markDelivered(delivered, 200)
    const spent = await log(URL, due)
    await sql`UPDATE webhook_deliveries SET attempts = ${MAX_WEBHOOK_ATTEMPTS} WHERE id = ${spent}`
    await sql`UPDATE webhook_deliveries SET next_retry_at = NULL WHERE id = ${first}`

    const leaseUntil = new Date(now.getTime() + 30_000)
    const claim = (urls: string[], at: Date, limit: number) =>
      deliveries.claimDueDeliveries({ urls, now: at, leaseUntil, limit })

    const oldest = await claim([URL], now, 1)
    expect(oldest.map((delivery) => delivery.id)).toEqual([first])
    expect(oldest[0]).toMatchObject({ url: URL, attempts: 1 })
    expect(JSON.parse(oldest[0]?.payload ?? '')).toEqual(JSON.parse(PAYLOAD))
    // A claimed delivery is not claimed again until its lease ends
    expect((await claim([URL, OTHER], now, 10)).map((delivery) => delivery.url)).toEqual([
      URL,
      OTHER,
    ])
    expect(await claim([URL, OTHER], now, 10)).toEqual([])
    const afterLease = new Date(leaseUntil.getTime() + 1000)
    expect(await claim([URL, OTHER], afterLease, 10)).toHaveLength(3)
    expect(await claim([], afterLease, 10)).toEqual([])
  })

  it('claims each due delivery once when sweeps run at the same time', async () => {
    const now = new Date('2030-06-01T00:00:00.000Z')
    const due = new Date('2030-05-01T00:00:00.000Z')
    for (let i = 0; i < 6; i++) await log(URL, due)
    const leaseUntil = new Date(now.getTime() + 30_000)
    const sweep = () => deliveries.claimDueDeliveries({ urls: [URL], now, leaseUntil, limit: 10 })

    const [a, b] = await Promise.all([sweep(), sweep()])

    const ids = [...a, ...b].map((delivery) => delivery.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(6)
  })
})
