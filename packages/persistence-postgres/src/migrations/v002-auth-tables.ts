import type { PostgresMigration } from '../migration-runner.js'

/**
 * V002: Auth tables — users and refresh tokens.
 *
 * Postgres uses UUID defaults, TEXT[] for roles, BOOLEAN, TIMESTAMPTZ.
 */
export const v002AuthTables: PostgresMigration = {
  version: 2,
  name: 'auth_tables',
  apply: async (sql) => {
    await sql.unsafe(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        name TEXT,
        roles TEXT[] NOT NULL DEFAULT '{viewer}',
        oidc_subject TEXT,
        oidc_issuer TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(oidc_issuer, oidc_subject)
      )
    `)

    await sql.unsafe(`
      CREATE TABLE refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await sql.unsafe('CREATE INDEX idx_refresh_user ON refresh_tokens(user_id)')
    await sql.unsafe('CREATE INDEX idx_refresh_expires ON refresh_tokens(expires_at)')
  },
}
