import type {
  IWebhookDeliveryAdapter,
  NewWebhookDelivery,
  StoredWebhookDelivery,
  WebhookDeliveryRecord,
} from '@krantho/persistence'
import { MAX_WEBHOOK_ATTEMPTS } from '@krantho/persistence'

interface DeliveryRow {
  id: number
  webhook_url: string
  event: string
  payload: string
  status: number | null
  attempts: number
  next_retry_at: string | null
  created_at: string
  delivered_at: string | null
}

/** A delivery is failed when it was never delivered and has used every attempt */
const FAILED = `delivered_at IS NULL AND attempts >= ${MAX_WEBHOOK_ATTEMPTS}`

function toRecord(row: DeliveryRow): WebhookDeliveryRecord {
  return {
    id: row.id,
    url: row.webhook_url,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  }
}

/** SQLite implementation of webhook delivery log */
export class SqliteWebhookDeliveryAdapter implements IWebhookDeliveryAdapter {
  private readonly db: import('better-sqlite3').Database

  constructor(db: import('better-sqlite3').Database) {
    this.db = db
  }

  async listDeliveries(options: {
    limit: number
    offset: number
    status?: 'pending' | 'delivered' | 'failed' | undefined
  }): Promise<{ deliveries: WebhookDeliveryRecord[]; total: number }> {
    let where = '1=1'

    if (options.status === 'pending') {
      where = `delivered_at IS NULL AND attempts < ${MAX_WEBHOOK_ATTEMPTS}`
    } else if (options.status === 'delivered') {
      where = 'delivered_at IS NOT NULL'
    } else if (options.status === 'failed') {
      where = FAILED
    }

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM webhook_deliveries WHERE ${where}`)
      .get() as { count: number }

    const rows = this.db
      .prepare(
        `SELECT * FROM webhook_deliveries WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(options.limit, options.offset) as DeliveryRow[]

    return { deliveries: rows.map(toRecord), total: countRow.count }
  }

  async getDelivery(id: number): Promise<StoredWebhookDelivery | null> {
    const row = this.row(id)
    return row ? { ...toRecord(row), payload: row.payload } : null
  }

  async requeueDelivery(id: number, dueAt: Date): Promise<WebhookDeliveryRecord | null> {
    const result = this.db
      .prepare(
        `UPDATE webhook_deliveries SET attempts = ?, next_retry_at = ? WHERE id = ? AND ${FAILED}`,
      )
      .run(MAX_WEBHOOK_ATTEMPTS - 1, dueAt.toISOString(), id)
    if (result.changes === 0) return null
    const row = this.row(id)
    return row ? toRecord(row) : null
  }

  async logDelivery(delivery: NewWebhookDelivery): Promise<number> {
    const row = this.db
      .prepare(
        `INSERT INTO webhook_deliveries (webhook_url, event, payload, attempts, next_retry_at)
         VALUES (?, ?, ?, 1, ?) RETURNING id`,
      )
      .get(delivery.url, delivery.event, delivery.payload, delivery.retryAt.toISOString()) as {
      id: number
    }
    return row.id
  }

  async markDelivered(id: number, status: number): Promise<void> {
    this.db
      .prepare(
        "UPDATE webhook_deliveries SET status = ?, delivered_at = datetime('now') WHERE id = ?",
      )
      .run(status, id)
  }

  async markFailed(id: number, status: number, nextRetryAt: Date): Promise<void> {
    this.db
      .prepare(
        'UPDATE webhook_deliveries SET status = ?, attempts = attempts + 1, next_retry_at = ? WHERE id = ?',
      )
      .run(status, nextRetryAt.toISOString(), id)
  }

  async claimDueDeliveries(options: {
    urls: readonly string[]
    now: Date
    leaseUntil: Date
    limit: number
  }): Promise<StoredWebhookDelivery[]> {
    if (options.urls.length === 0) return []
    // next_retry_at holds ISO timestamps, which order as text; one statement claims the rows
    const rows = this.db
      .prepare(
        `UPDATE webhook_deliveries SET next_retry_at = ?
         WHERE id IN (
           SELECT id FROM webhook_deliveries
           WHERE delivered_at IS NULL AND attempts < ? AND (next_retry_at IS NULL OR next_retry_at <= ?)
             AND webhook_url IN (${options.urls.map(() => '?').join(', ')})
           ORDER BY created_at, id LIMIT ?
         )
         RETURNING *`,
      )
      .all(
        options.leaseUntil.toISOString(),
        MAX_WEBHOOK_ATTEMPTS,
        options.now.toISOString(),
        ...options.urls,
        options.limit,
      ) as DeliveryRow[]
    return rows
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
      .map((row) => ({ ...toRecord(row), payload: row.payload }))
  }

  private row(id: number): DeliveryRow | undefined {
    return this.db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(id) as
      | DeliveryRow
      | undefined
  }
}
