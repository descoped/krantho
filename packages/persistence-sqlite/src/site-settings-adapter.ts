import type { ISiteSettingsAdapter } from '@krantho/persistence'

/** SQLite implementation of runtime site settings */
export class SqliteSiteSettingsAdapter implements ISiteSettingsAdapter {
  private readonly db: import('better-sqlite3').Database

  constructor(db: import('better-sqlite3').Database) {
    this.db = db
  }

  async getSetting(key: string): Promise<string | null> {
    const row = this.db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  async setSetting(key: string, value: string): Promise<void> {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, now)
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const rows = this.db.prepare('SELECT key, value FROM site_settings').all() as Array<{
      key: string
      value: string
    }>
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }
}
