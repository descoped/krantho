import type {
  CreateUserData,
  IAuthAdapter,
  RefreshTokenRecord,
  Role,
  UpdateUserData,
  UserPermission,
  UserRecord,
} from '@krantho/persistence'
import type { Sql } from 'postgres'

/** Postgres implementation of the auth adapter */
export class PostgresAuthAdapter implements IAuthAdapter {
  private readonly sql: Sql

  constructor(sql: Sql) {
    this.sql = sql
  }

  // --- Users ---

  async createUser(data: CreateUserData): Promise<UserRecord> {
    // postgres.js handles JS arrays natively in tagged templates — no manual
    // string-join needed. The driver serialises string[] to a Postgres text[].
    const rows = await this.sql<Array<PostgresUserRow>>`
      INSERT INTO users (email, name, roles, oidc_subject, oidc_issuer)
      VALUES (${data.email}, ${data.name}, ${data.roles}::text[], ${data.oidcSubject ?? null}, ${data.oidcIssuer ?? null})
      RETURNING *`

    const row = rows[0]
    if (!row) throw new Error('INSERT RETURNING produced no row')
    return rowToUser(row)
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const rows = await this.sql<PostgresUserRow[]>`SELECT * FROM users WHERE id = ${id}::uuid`
    return rows[0] ? rowToUser(rows[0]) : null
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.sql<PostgresUserRow[]>`SELECT * FROM users WHERE email = ${email}`
    return rows[0] ? rowToUser(rows[0]) : null
  }

  async getUserByOidc(issuer: string, subject: string): Promise<UserRecord | null> {
    const rows = await this.sql<PostgresUserRow[]>`
      SELECT * FROM users WHERE oidc_issuer = ${issuer} AND oidc_subject = ${subject}`
    return rows[0] ? rowToUser(rows[0]) : null
  }

  async listUsers(): Promise<UserRecord[]> {
    const rows = await this.sql<PostgresUserRow[]>`SELECT * FROM users ORDER BY created_at DESC`
    return rows.map(rowToUser)
  }

  async updateUser(id: string, data: UpdateUserData): Promise<UserRecord | null> {
    const sets: string[] = ['updated_at = NOW()']
    const params: unknown[] = []
    let idx = 1

    if (data.email !== undefined) {
      sets.push(`email = $${idx}`)
      params.push(data.email)
      idx++
    }
    if (data.name !== undefined) {
      sets.push(`name = $${idx}`)
      params.push(data.name)
      idx++
    }
    if (data.roles !== undefined) {
      sets.push(`roles = $${idx}::text[]`)
      // sql.unsafe receives raw params — use Postgres array literal syntax
      // because there's no tagged-template array serialisation in unsafe mode.
      // Roles are code-controlled enum values, not user input.
      params.push(`{${data.roles.join(',')}}`)
      idx++
    }
    if (data.isActive !== undefined) {
      sets.push(`is_active = $${idx}`)
      params.push(data.isActive)
      idx++
    }
    if (data.oidcSubject !== undefined) {
      sets.push(`oidc_subject = $${idx}`)
      params.push(data.oidcSubject)
      idx++
    }
    if (data.oidcIssuer !== undefined) {
      sets.push(`oidc_issuer = $${idx}`)
      params.push(data.oidcIssuer)
      idx++
    }

    params.push(id)
    const query = `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}::uuid RETURNING *`
    // sql.unsafe is intentional: the dynamic column set requires it, but column
    // names are code-controlled (never from user input), so this is safe.
    const rows = (await this.sql.unsafe(
      query,
      params as (string | number | boolean | null)[],
    )) as PostgresUserRow[]

    return rows[0] ? rowToUser(rows[0]) : null
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM users WHERE id = ${id}::uuid`
    return affectedCount(result) > 0
  }

  // --- Refresh Tokens ---

  async createRefreshToken(userId: string, tokenHash: string, expiresAt: string): Promise<string> {
    const rows = await this.sql<Array<{ id: string }>>`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (${userId}::uuid, ${tokenHash}, ${expiresAt}::timestamptz)
      RETURNING id`
    const row = rows[0]
    if (!row) throw new Error('INSERT RETURNING produced no row')
    return row.id
  }

  async getRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const rows = await this.sql<PostgresRefreshRow[]>`
      SELECT * FROM refresh_tokens WHERE token_hash = ${tokenHash}`

    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt:
        row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }
  }

  async deleteRefreshToken(id: string): Promise<void> {
    await this.sql`DELETE FROM refresh_tokens WHERE id = ${id}::uuid`
  }

  async deleteUserRefreshTokens(userId: string): Promise<void> {
    await this.sql`DELETE FROM refresh_tokens WHERE user_id = ${userId}::uuid`
  }

  async deleteExpiredRefreshTokens(): Promise<number> {
    const result = await this.sql`DELETE FROM refresh_tokens WHERE expires_at < NOW()`
    return affectedCount(result)
  }

  // --- Per-Collection Permissions ---

  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    const rows = await this.sql<Array<{ user_id: string; collection: string; role: string }>>`
      SELECT user_id, collection, role FROM user_permissions WHERE user_id = ${userId}::uuid`

    return rows.map((r) => ({
      userId: r.user_id,
      collection: r.collection,
      role: r.role as Role,
    }))
  }

  async setUserPermission(userId: string, collection: string, role: Role): Promise<void> {
    await this.sql`
      INSERT INTO user_permissions (user_id, collection, role)
      VALUES (${userId}::uuid, ${collection}, ${role})
      ON CONFLICT (user_id, collection) DO UPDATE SET role = ${role}`
  }

  async deleteUserPermission(userId: string, collection: string): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM user_permissions WHERE user_id = ${userId}::uuid AND collection = ${collection}`
    return affectedCount(result) > 0
  }
}

/** Extract affected row count from a postgres.js query result */
function affectedCount(result: unknown): number {
  return (result as { count: number }).count
}

// --- Internal types ---

interface PostgresUserRow {
  id: string
  email: string | null
  name: string | null
  roles: string[]
  oidc_subject: string | null
  oidc_issuer: string | null
  is_active: boolean
  created_at: Date
  updated_at: Date
}

interface PostgresRefreshRow {
  id: string
  user_id: string
  token_hash: string
  expires_at: Date
  created_at: Date
}

function rowToUser(row: PostgresUserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roles: row.roles as Role[],
    oidcSubject: row.oidc_subject,
    oidcIssuer: row.oidc_issuer,
    isActive: row.is_active,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  }
}
