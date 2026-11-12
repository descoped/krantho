import type { SqliteMigration } from '../migration-runner.js'

/**
 * V002: Auth tables — users and refresh tokens.
 *
 * Users store identity, roles, and OIDC provider linkage.
 * Refresh tokens are stored as SHA-256 hashes with expiry.
 */
export const v002AuthTables: SqliteMigration = {
  version: 2,
  name: 'auth_tables',
  apply: (db) => {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        roles TEXT NOT NULL DEFAULT '["viewer"]',
        oidc_subject TEXT,
        oidc_issuer TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec('CREATE UNIQUE INDEX idx_users_oidc ON users(oidc_issuer, oidc_subject)')

    db.exec(`
      CREATE TABLE refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec('CREATE INDEX idx_refresh_user ON refresh_tokens(user_id)')
    db.exec('CREATE INDEX idx_refresh_expires ON refresh_tokens(expires_at)')
  },
}
