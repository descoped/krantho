import type {
  IWebhookDeliveryAdapter,
  NewWebhookDelivery,
  StoredWebhookDelivery,
  WebhookDeliveryRecord,
} from '@krantho/persistence'
import { MAX_WEBHOOK_ATTEMPTS } from '@krantho/persistence'
import type { Sql } from 'postgres'

interface DeliveryRow {
  id: number
  webhook_url: string
  event: string
  payload: string
  status: number | null
  attempts: number
  next_retry_at: Date | null
  created_at: Date
  delivered_at: Date | null
}

/** A delivery is failed when it was never delivered and has used every attempt */
const FAILED = `delivered_at IS NULL AND attempts >= ${MAX_WEBHOOK_ATTEMPTS}`

/** The columns of a delivery; the payload is JSONB, read back as the JSON text */
const COLUMNS =
  'id, webhook_url, event, payload::text AS payload, status, attempts, next_retry_at, created_at, delivered_at'

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString()
}

function toRecord(row: DeliveryRow): WebhookDeliveryRecord {
  return {
    id: row.id,
    url: row.webhook_url,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    nextRetryAt: iso(row.next_retry_at),
    createdAt: row.created_at.toISOString(),
    deliveredAt: iso(row.delivered_at),
  }
}

/** Postgres implementation of webhook delivery log */
export class PostgresWebhookDeliveryAdapter implements IWebhookDeliveryAdapter {
  constructor(private readonly sql: Sql) {}

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
      where = `delivered_at IS NULL AND attempts >= ${MAX_WEBHOOK_ATTEMPTS}`
    }

    const countRows = (await this.sql.unsafe(
      `SELECT COUNT(*) as count FROM webhook_deliveries WHERE ${where}`,
    )) as Array<{ count: string }>
    const total = parseInt(countRows[0]?.count ?? '0', 10)

    const rows = (await this.sql.unsafe(
      `SELECT ${COLUMNS} FROM webhook_deliveries WHERE ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [options.limit, options.offset],
    )) as DeliveryRow[]

    return { deliveries: rows.map(toRecord), total }
  }

  async getDelivery(id: number): Promise<StoredWebhookDelivery | null> {
    const rows = (await this.sql.unsafe(`SELECT ${COLUMNS} FROM webhook_deliveries WHERE id = $1`, [
      id,
    ])) as DeliveryRow[]
    const row = rows[0]
    return row ? { ...toRecord(row), payload: row.payload } : null
  }

  async requeueDelivery(id: number, dueAt: Date): Promise<WebhookDeliveryRecord | null> {
    const rows = (await this.sql.unsafe(
      `UPDATE webhook_deliveries SET attempts = $1, next_retry_at = $2::timestamptz
       WHERE id = $3 AND ${FAILED} RETURNING ${COLUMNS}`,
      [MAX_WEBHOOK_ATTEMPTS - 1, dueAt.toISOString(), id],
    )) as DeliveryRow[]
    const row = rows[0]
    return row ? toRecord(row) : null
  }

  async logDelivery(delivery: NewWebhookDelivery): Promise<number> {
    // The payload binds as text and is cast, so the driver does not encode it a second time
    const rows = await this.sql<Array<{ id: number }>>`
      INSERT INTO webhook_deliveries (webhook_url, event, payload, attempts, next_retry_at)
      VALUES (${delivery.url}, ${delivery.event}, ${delivery.payload}::text::jsonb, 1,
              ${delivery.retryAt.toISOString()}::timestamptz)
      RETURNING id`
    const row = rows[0]
    if (!row) throw new Error('Logging a webhook delivery returned no id')
    return row.id
  }

  async markDelivered(id: number, status: number): Promise<void> {
    await this.sql`
      UPDATE webhook_deliveries SET status = ${status}, delivered_at = NOW() WHERE id = ${id}`
  }

  async markFailed(id: number, status: number, nextRetryAt: Date): Promise<void> {
    await this.sql`
      UPDATE webhook_deliveries
      SET status = ${status}, attempts = attempts + 1,
          next_retry_at = ${nextRetryAt.toISOString()}::timestamptz
      WHERE id = ${id}`
  }

  async claimDueDeliveries(options: {
    urls: readonly string[]
    now: Date
    leaseUntil: Date
    limit: number
  }): Promise<StoredWebhookDelivery[]> {
    if (options.urls.length === 0) return []
    // SKIP LOCKED: rows another instance is claiming at this moment are left to it
    const rows = await this.sql<DeliveryRow[]>`
      UPDATE webhook_deliveries SET next_retry_at = ${options.leaseUntil.toISOString()}::timestamptz
      WHERE id IN (
        SELECT id FROM webhook_deliveries
        WHERE delivered_at IS NULL AND attempts < ${MAX_WEBHOOK_ATTEMPTS}
          AND (next_retry_at IS NULL OR next_retry_at <= ${options.now.toISOString()}::timestamptz)
          AND webhook_url IN ${this.sql(options.urls)}
        ORDER BY created_at, id LIMIT ${options.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING ${this.sql.unsafe(COLUMNS)}`
    return [...rows]
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id - b.id)
      .map((row) => ({ ...toRecord(row), payload: row.payload }))
  }
}
