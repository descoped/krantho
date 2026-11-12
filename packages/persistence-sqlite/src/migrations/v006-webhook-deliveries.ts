import type { SqliteMigration } from '../migration-runner.js'

/**
 * V006: Webhook delivery log with retry support.
 */
export const v006WebhookDeliveries: SqliteMigration = {
  version: 6,
  name: 'webhook_deliveries',
  apply: (db) => {
    db.exec(`
      CREATE TABLE webhook_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_url TEXT NOT NULL,
        event TEXT NOT NULL,
        payload TEXT NOT NULL,
        status INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        delivered_at TEXT
      )
    `)
    db.exec(
      'CREATE INDEX idx_webhook_pending ON webhook_deliveries(next_retry_at) WHERE delivered_at IS NULL AND attempts < 5',
    )
  },
}
