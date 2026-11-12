import { randomUUID } from 'node:crypto'
import type {
  CreateUserData,
  IAuthAdapter,
  RefreshTokenRecord,
  Role,
  UpdateUserData,
  UserPermission,
  UserRecord,
} from '@krantho/persistence'
import type Database from 'better-sqlite3'

/** SQLite implementation of the auth adapter */
export class SqliteAuthAdapter implements IAuthAdapter {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  // --- Users ---

  async createUser(data: CreateUserData): Promise<UserRecord> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const roles = JSON.stringify(data.roles)

    this.db
      .prepare(
        `INSERT INTO users (id, email, name, roles, oidc_subject, oidc_issuer, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.email,
        data.name,
        roles,
        data.oidcSubject ?? null,
        data.oidcIssuer ?? null,
        now,
        now,
      )

    return {
      id,
      email: data.email,
      name: data.name,
      roles: data.roles,
      oidcSubject: data.oidcSubject ?? null,
      oidcIssuer: data.oidcIssuer ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | SqliteUserRow
      | undefined
    return row ? rowToUser(row) : null
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | SqliteUserRow
      | undefined
    return row ? rowToUser(row) : null
  }

  async getUserByOidc(issuer: string, subject: string): Promise<UserRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM users WHERE oidc_issuer = ? AND oidc_subject = ?')
      .get(issuer, subject) as SqliteUserRow | undefined
    return row ? rowToUser(row) : null
  }

  async listUsers(): Promise<UserRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM users ORDER BY created_at DESC')
      .all() as SqliteUserRow[]
    return rows.map(rowToUser)
  }

  async updateUser(id: string, data: UpdateUserData): Promise<UserRecord | null> {
    const existing = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | SqliteUserRow
      | undefined
    if (!existing) return null

    const now = new Date().toISOString()
    const updates: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (data.email !== undefined) {
      updates.push('email = ?')
      params.push(data.email)
    }
    if (data.name !== undefined) {
      updates.push('name = ?')
      params.push(data.name)
    }
    if (data.roles !== undefined) {
      updates.push('roles = ?')
      params.push(JSON.stringify(data.roles))
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?')
      params.push(data.isActive ? 1 : 0)
    }
    if (data.oidcSubject !== undefined) {
      updates.push('oidc_subject = ?')
      params.push(data.oidcSubject)
    }
    if (data.oidcIssuer !== undefined) {
      updates.push('oidc_issuer = ?')
      params.push(data.oidcIssuer)
    }

    params.push(id)
    this.db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    return this.getUser(id)
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(id)
    return result.changes > 0
  }

  // --- Refresh Tokens ---

  async createRefreshToken(userId: string, tokenHash: string, expiresAt: string): Promise<string> {
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(id, userId, tokenHash, expiresAt)
    return id
  }

  async getRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
      .get(tokenHash) as SqliteRefreshRow | undefined

    if (!row) return null
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }
  }

  async deleteRefreshToken(id: string): Promise<void> {
    this.db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(id)
  }

  async deleteUserRefreshTokens(userId: string): Promise<void> {
    this.db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId)
  }

  async deleteExpiredRefreshTokens(): Promise<number> {
    const result = this.db
      .prepare('DELETE FROM refresh_tokens WHERE expires_at < ?')
      .run(new Date().toISOString())
    return result.changes
  }

  // --- Per-Collection Permissions ---

  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    const rows = this.db
      .prepare('SELECT user_id, collection, role FROM user_permissions WHERE user_id = ?')
      .all(userId) as Array<{ user_id: string; collection: string; role: string }>

    return rows.map((r) => ({
      userId: r.user_id,
      collection: r.collection,
      role: r.role as Role,
    }))
  }

  async setUserPermission(userId: string, collection: string, role: Role): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO user_permissions (user_id, collection, role) VALUES (?, ?, ?)
         ON CONFLICT (user_id, collection) DO UPDATE SET role = excluded.role`,
      )
      .run(userId, collection, role)
  }

  async deleteUserPermission(userId: string, collection: string): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM user_permissions WHERE user_id = ? AND collection = ?')
      .run(userId, collection)
    return result.changes > 0
  }
}

// --- Internal types ---

interface SqliteUserRow {
  id: string
  email: string | null
  name: string | null
  roles: string
  oidc_subject: string | null
  oidc_issuer: string | null
  is_active: number
  created_at: string
  updated_at: string
}

interface SqliteRefreshRow {
  id: string
  user_id: string
  token_hash: string
  expires_at: string
  created_at: string
}

function rowToUser(row: SqliteUserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roles: JSON.parse(row.roles) as Role[],
    oidcSubject: row.oidc_subject,
    oidcIssuer: row.oidc_issuer,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
