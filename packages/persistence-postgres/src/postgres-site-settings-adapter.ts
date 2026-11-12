import type { ISiteSettingsAdapter } from '@krantho/persistence'
import type { Sql } from 'postgres'

/** Postgres implementation of runtime site settings */
export class PostgresSiteSettingsAdapter implements ISiteSettingsAdapter {
  constructor(private readonly sql: Sql) {}

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.sql<{ value: string }[]>`
      SELECT value FROM site_settings WHERE key = ${key}`
    return rows[0]?.value ?? null
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.sql`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()`
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const rows = await this.sql<{ key: string; value: string }[]>`
      SELECT key, value FROM site_settings`
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }
}
