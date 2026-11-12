import { MAX_WEBHOOK_ATTEMPTS } from '@krantho/persistence'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../src/migration-runner.js'
import { sqliteMigrations } from '../src/migrations/index.js'
import { SqliteWebhookDeliveryAdapter } from '../src/webhook-delivery-adapter.js'

let db: Database.Database
let deliveries: SqliteWebhookDeliveryAdapter

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, sqliteMigrations)
  deliveries = new SqliteWebhookDeliveryAdapter(db)
})

afterEach(() => {
  db.close()
})

function seed(attempts: number, delivered = false): number {
  const row = db
    .prepare(
      `INSERT INTO webhook_deliveries (webhook_url, event, payload, status, attempts, delivered_at)
       VALUES ('https://hook.example.test', 'publish', '{"slug":"home"}', 503, ?, ?) RETURNING id`,
    )
    .get(attempts, delivered ? '2026-10-03 10:00:00' : null) as { id: number }
  return row.id
}

describe('SqliteWebhookDeliveryAdapter', () => {
  it('reads one delivery with the payload it sends', async () => {
    const id = seed(2)
    expect(await deliveries.getDelivery(id)).toMatchObject({
      id,
      url: 'https://hook.example.test',
      event: 'publish',
      payload: '{"slug":"home"}',
      attempts: 2,
      deliveredAt: null,
    })
    expect(await deliveries.getDelivery(id + 1)).toBeNull()
  })

  it('re-queues a failed delivery with one attempt left, due when asked, so it lists as pending', async () => {
    const id = seed(MAX_WEBHOOK_ATTEMPTS)
    const dueAt = new Date('2030-01-01T00:00:00.000Z')
    const requeued = await deliveries.requeueDelivery(id, dueAt)
    expect(requeued).toMatchObject({ id, attempts: MAX_WEBHOOK_ATTEMPTS - 1, deliveredAt: null })
    expect(requeued?.nextRetryAt).toBe(dueAt.toISOString())
    expect(requeued).not.toHaveProperty('payload')
    const pending = await deliveries.listDeliveries({ limit: 10, offset: 0, status: 'pending' })
    expect(pending.deliveries.map((delivery) => delivery.id)).toEqual([id])
  })

  it('leaves a delivered or pending delivery alone, and knows no unknown id', async () => {
    const delivered = seed(1, true)
    const pending = seed(2)
    expect(await deliveries.requeueDelivery(delivered, new Date())).toBeNull()
    expect(await deliveries.requeueDelivery(pending, new Date())).toBeNull()
    expect(await deliveries.requeueDelivery(999, new Date())).toBeNull()
    expect((await deliveries.getDelivery(pending))?.attempts).toBe(2)
  })

  describe('the write side and the sweep', () => {
    const URL = 'https://hook.example.test'
    const OTHER = 'https://other.example.test'
    const log = (url = URL, retryAt = new Date('2030-01-01T00:00:00.000Z')): Promise<number> =>
      deliveries.logDelivery({ url, event: 'publish', payload: '{"slug":"home"}', retryAt })

    it('logs a first send with one attempt made, due when asked, and no outcome', async () => {
      const retryAt = new Date('2030-01-01T00:00:00.000Z')
      const id = await log(URL, retryAt)
      expect(await deliveries.getDelivery(id)).toMatchObject({
        id,
        url: URL,
        event: 'publish',
        payload: '{"slug":"home"}',
        status: null,
        attempts: 1,
        nextRetryAt: retryAt.toISOString(),
        deliveredAt: null,
      })
    })

    it('marks a delivery delivered with its status, so it lists as delivered', async () => {
      const id = await log()
      await deliveries.markDelivered(id, 204)
      const stored = await deliveries.getDelivery(id)
      expect(stored).toMatchObject({ status: 204, attempts: 1 })
      expect(stored?.deliveredAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      const { total } = await deliveries.listDeliveries({
        limit: 10,
        offset: 0,
        status: 'delivered',
      })
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
      db.prepare('UPDATE webhook_deliveries SET attempts = ? WHERE id = ?').run(
        MAX_WEBHOOK_ATTEMPTS,
        spent,
      )
      db.prepare('UPDATE webhook_deliveries SET next_retry_at = NULL WHERE id = ?').run(first)

      const leaseUntil = new Date(now.getTime() + 30_000)
      const claim = (at: Date, limit: number) =>
        deliveries.claimDueDeliveries({ urls: [URL], now: at, leaseUntil, limit })

      const oldest = await claim(now, 1)
      expect(oldest.map((delivery) => delivery.id)).toEqual([first])
      expect(oldest[0]).toMatchObject({ url: URL, payload: '{"slug":"home"}', attempts: 1 })
      // A claimed delivery is not claimed again until its lease ends
      expect((await claim(now, 10)).map((delivery) => delivery.id)).toEqual([second])
      expect(await claim(now, 10)).toEqual([])
      const afterLease = new Date(leaseUntil.getTime() + 1000)
      expect((await claim(afterLease, 10)).map((delivery) => delivery.id)).toEqual([first, second])
      expect(
        await deliveries.claimDueDeliveries({ urls: [], now: afterLease, leaseUntil, limit: 10 }),
      ).toEqual([])
    })
  })
})
