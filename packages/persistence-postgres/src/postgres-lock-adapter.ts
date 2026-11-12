import type { ContentLock, ILockAdapter } from '@krantho/persistence'
import type { Sql } from 'postgres'

interface LockRow {
  collection: string
  slug: string
  locale: string
  locked_by: string
  locked_at: Date
  expires_at: Date
}

/** Postgres implementation of advisory content locking */
export class PostgresLockAdapter implements ILockAdapter {
  constructor(private readonly sql: Sql) {}

  async getLock(collection: string, slug: string, locale: string): Promise<ContentLock | null> {
    const rows = await this.sql<LockRow[]>`
      SELECT * FROM content_locks
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${locale}`

    const row = rows[0]
    if (!row) return null

    // Clean up expired locks
    const expiresAt =
      row.expires_at instanceof Date ? row.expires_at : new Date(String(row.expires_at))
    if (expiresAt <= new Date()) {
      await this.sql`
        DELETE FROM content_locks
        WHERE collection = ${collection} AND slug = ${slug} AND locale = ${locale}`
      return null
    }

    const lockedAt = row.locked_at instanceof Date ? row.locked_at : new Date(String(row.locked_at))
    return {
      collection: row.collection,
      slug: row.slug,
      locale: row.locale,
      lockedBy: row.locked_by,
      lockedAt: lockedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
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
    await this.sql`
      INSERT INTO content_locks (collection, slug, locale, locked_by, locked_at, expires_at)
      VALUES (${collection}, ${slug}, ${locale}, ${lockedBy}, ${now}, ${expiresAt})
      ON CONFLICT (collection, slug, locale) DO UPDATE SET
        locked_by = EXCLUDED.locked_by,
        locked_at = EXCLUDED.locked_at,
        expires_at = EXCLUDED.expires_at`
  }

  async releaseLock(collection: string, slug: string, locale: string): Promise<void> {
    await this.sql`
      DELETE FROM content_locks
      WHERE collection = ${collection} AND slug = ${slug} AND locale = ${locale}`
  }

  async listLocks(): Promise<ContentLock[]> {
    await this.sql`DELETE FROM content_locks WHERE expires_at <= now()`
    const rows = await this.sql<LockRow[]>`
      SELECT * FROM content_locks ORDER BY collection, slug, locale`
    const iso = (value: Date): string =>
      (value instanceof Date ? value : new Date(String(value))).toISOString()
    return rows.map((row) => ({
      collection: row.collection,
      slug: row.slug,
      locale: row.locale,
      lockedBy: row.locked_by,
      lockedAt: iso(row.locked_at),
      expiresAt: iso(row.expires_at),
    }))
  }
}
