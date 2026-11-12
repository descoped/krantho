import type { PostgresMigration } from '../migration-runner.js'

/**
 * V006: Webhook delivery log with retry support.
 */
export const v006WebhookDeliveries: PostgresMigration = {
  version: 6,
  name: 'webhook_deliveries',
  apply: async (sql) => {
    await sql.unsafe(`
      CREATE TABLE webhook_deliveries (
        id SERIAL PRIMARY KEY,
        webhook_url TEXT NOT NULL,
        event TEXT NOT NULL,
        payload JSONB NOT NULL,
        status INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_retry_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMPTZ
      )
    `)
    await sql.unsafe(
      'CREATE INDEX idx_webhook_pending ON webhook_deliveries(next_retry_at) WHERE delivered_at IS NULL AND attempts < 5',
    )
  },
}
