import type { ISeoConfigAdapter, SeoConfig, SeoConfigScope } from '@krantho/persistence'
import { escapeSqlLikePattern } from '@krantho/persistence'
import type { SeoConfigData } from '@krantho/seo-shared'
import type { Database } from 'better-sqlite3'

/** SQLite implementation of ISeoConfigAdapter */
export class SqliteSeoConfigAdapter implements ISeoConfigAdapter {
  constructor(private readonly db: Database) {}

  async getConfig(id: string): Promise<SeoConfig | null> {
    const row = this.db.prepare('SELECT * FROM seo_config WHERE id = ?').get(id) as
      | SeoConfigRow
      | undefined

    return row ? toSeoConfig(row) : null
  }

  async saveConfig(config: Omit<SeoConfig, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (config.scope === 'document' || config.id.startsWith('doc:')) {
      throw new Error('Document SEO belongs in versioned document metadata')
    }
    this.db
      .prepare(
        `INSERT INTO seo_config (id, scope, config, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           scope = excluded.scope,
           config = excluded.config,
           updated_at = datetime('now')`,
      )
      .run(config.id, config.scope, JSON.stringify(config.config))
  }

  async deleteConfig(id: string): Promise<void> {
    this.db.prepare('DELETE FROM seo_config WHERE id = ?').run(id)
  }

  async listConfigs(scope?: SeoConfigScope): Promise<SeoConfig[]> {
    const rows = scope
      ? (this.db
          .prepare('SELECT * FROM seo_config WHERE scope = ? ORDER BY id')
          .all(scope) as SeoConfigRow[])
      : (this.db.prepare('SELECT * FROM seo_config ORDER BY id').all() as SeoConfigRow[])

    return rows.map(toSeoConfig)
  }

  async listConfigsByPrefix(prefix: string): Promise<SeoConfig[]> {
    const escaped = escapeSqlLikePattern(prefix)
    const rows = this.db
      .prepare("SELECT * FROM seo_config WHERE id LIKE ? ESCAPE '\\' ORDER BY id")
      .all(`${escaped}%`) as SeoConfigRow[]
    return rows.map(toSeoConfig)
  }

  async deleteAllConfigs(): Promise<number> {
    const result = this.db.prepare('DELETE FROM seo_config').run()
    return result.changes
  }
}

interface SeoConfigRow {
  id: string
  scope: string
  config: string
  created_at: string
  updated_at: string
}

function toSeoConfig(row: SeoConfigRow): SeoConfig {
  return {
    id: row.id,
    scope: row.scope as SeoConfigScope,
    config: JSON.parse(row.config) as SeoConfigData,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
