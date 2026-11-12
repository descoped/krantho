import type { ContentLock, ILockAdapter } from '@krantho/persistence'

interface LockRow {
  collection: string
  slug: string
  locale: string
  locked_by: string
  locked_at: string
  expires_at: string
}

/** SQLite implementation of advisory content locking */
export class SqliteLockAdapter implements ILockAdapter {
  private readonly db: import('better-sqlite3').Database

  constructor(db: import('better-sqlite3').Database) {
    this.db = db
  }

  async getLock(collection: string, slug: string, locale: string): Promise<ContentLock | null> {
    const row = this.db
      .prepare('SELECT * FROM content_locks WHERE collection = ? AND slug = ? AND locale = ?')
      .get(collection, slug, locale) as LockRow | undefined

    if (!row) return null

    // Clean up expired locks
    if (new Date(row.expires_at) <= new Date()) {
      this.db
        .prepare('DELETE FROM content_locks WHERE collection = ? AND slug = ? AND locale = ?')
        .run(collection, slug, locale)
      return null
    }

    return {
      collection: row.collection,
      slug: row.slug,
      locale: row.locale,
      lockedBy: row.locked_by,
      lockedAt: row.locked_at,
      expiresAt: row.expires_at,
    }
  }

  async acquireLock(
    collection: string,
    slug: string,
    locale: string,
    lockedBy: string,
    expiresAt: string,
  ): Promise<void> {
    const now = new Date().toISOString()
    // Atomic upsert — avoids race condition between SELECT + INSERT
    this.db
      .prepare(
        `INSERT INTO content_locks (collection, slug, locale, locked_by, locked_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(collection, slug, locale) DO UPDATE SET
           locked_by = excluded.locked_by,
           locked_at = excluded.locked_at,
           expires_at = excluded.expires_at`,
      )
      .run(collection, slug, locale, lockedBy, now, expiresAt)
  }

  async releaseLock(collection: string, slug: string, locale: string): Promise<void> {
    this.db
      .prepare('DELETE FROM content_locks WHERE collection = ? AND slug = ? AND locale = ?')
      .run(collection, slug, locale)
  }

  async listLocks(): Promise<ContentLock[]> {
    // Expiry times are ISO 8601 UTC strings, so they compare as text
    const now = new Date().toISOString()
    this.db.prepare('DELETE FROM content_locks WHERE expires_at <= ?').run(now)
    const rows = this.db
      .prepare('SELECT * FROM content_locks ORDER BY collection, slug, locale')
      .all() as LockRow[]
    return rows.map((row) => ({
      collection: row.collection,
      slug: row.slug,
      locale: row.locale,
      lockedBy: row.locked_by,
      lockedAt: row.locked_at,
      expiresAt: row.expires_at,
    }))
  }
}
