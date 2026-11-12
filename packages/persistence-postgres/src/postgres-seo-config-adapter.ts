import type { ISeoConfigAdapter, SeoConfig, SeoConfigScope } from '@krantho/persistence'
import { escapeSqlLikePattern } from '@krantho/persistence'
import type { SeoConfigData } from '@krantho/seo-shared'
import type { Sql } from 'postgres'

interface SeoConfigRow {
  id: string
  scope: string
  config: SeoConfigData
  created_at: Date
  updated_at: Date
}

function toSeoConfig(row: SeoConfigRow): SeoConfig {
  return {
    id: row.id,
    scope: row.scope as SeoConfigScope,
    config: row.config,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  }
}

/** Postgres implementation of ISeoConfigAdapter */
export class PostgresSeoConfigAdapter implements ISeoConfigAdapter {
  constructor(private readonly sql: Sql) {}

  async getConfig(id: string): Promise<SeoConfig | null> {
    const rows = await this.sql<SeoConfigRow[]>`
      SELECT * FROM seo_config WHERE id = ${id}`
    const row = rows[0]
    return row ? toSeoConfig(row) : null
  }

  async saveConfig(config: Omit<SeoConfig, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (config.scope === 'document' || config.id.startsWith('doc:')) {
      throw new Error('Document SEO belongs in versioned document metadata')
    }
    // Bind the object with sql.json: JSON.stringify plus a ::jsonb cast is
    // encoded again by the driver and stores the JSON text as a string
    await this.sql.unsafe(
      `INSERT INTO seo_config (id, scope, config, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         scope = EXCLUDED.scope,
         config = EXCLUDED.config,
         updated_at = NOW()`,
      [config.id, config.scope, this.sql.json(config.config as never)],
    )
  }

  async deleteConfig(id: string): Promise<void> {
    await this.sql`DELETE FROM seo_config WHERE id = ${id}`
  }

  async listConfigs(scope?: SeoConfigScope): Promise<SeoConfig[]> {
    const rows = scope
      ? await this.sql<SeoConfigRow[]>`
          SELECT * FROM seo_config WHERE scope = ${scope} ORDER BY id`
      : await this.sql<SeoConfigRow[]>`
          SELECT * FROM seo_config ORDER BY id`

    return rows.map(toSeoConfig)
  }

  async listConfigsByPrefix(prefix: string): Promise<SeoConfig[]> {
    const escaped = escapeSqlLikePattern(prefix)
    const pattern = `${escaped}%`
    const rows = await this.sql<SeoConfigRow[]>`
      SELECT * FROM seo_config WHERE id LIKE ${pattern} ESCAPE '\\' ORDER BY id`
    return rows.map(toSeoConfig)
  }

  async deleteAllConfigs(): Promise<number> {
    const result = await this.sql`DELETE FROM seo_config`
    return result.count
  }
}
