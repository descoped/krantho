import { randomUUID } from 'node:crypto'
import type { Sql } from 'postgres'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../src/migration-runner.js'
import { postgresMigrations } from '../src/migrations/index.js'

const before13 = postgresMigrations.filter((migration) => migration.version < 13)

describe('v013 content contracts on a database from before it', () => {
  let admin: Sql
  let sql: Sql
  const databases: string[] = []
  const clients: Sql[] = []

  beforeAll(() => {
    const url = process.env.KRANTHO_TEST_POSTGRES_URL
    if (!url) throw new Error('KRANTHO_TEST_POSTGRES_URL not set — globalSetup did not run.')
    admin = postgres(url, { max: 1 })
  })

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })))
    for (const name of databases) await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`)
    await admin?.end({ timeout: 5 })
  })

  beforeEach(async () => {
    const name = `krantho_v013_${randomUUID().replaceAll('-', '')}`
    await admin.unsafe(`CREATE DATABASE ${name}`)
    databases.push(name)
    const url = new URL(process.env.KRANTHO_TEST_POSTGRES_URL as string)
    url.pathname = `/${name}`
    sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
    clients.push(sql)
    await runMigrations(sql, before13)
  })

  async function insertVersion(slug: string, locale: string, version: number, at: string) {
    await sql.unsafe(
      `INSERT INTO content (id, collection, slug, locale, version, is_current, status, fields, body, created_at)
       VALUES ($1, 'pages', $2, $3, $4, $5, 'published', '{}'::jsonb, '', $6)`,
      [randomUUID(), slug, locale, version, version === 2, at],
    )
  }

  it('adds authored metadata to existing rows, empty and without a contract', async () => {
    await insertVersion('about', 'en', 1, '2026-01-01T00:00:00Z')
    await runMigrations(sql, postgresMigrations)
    const rows = await sql<{ authored: unknown }[]>`SELECT authored FROM content`
    expect(rows[0]?.authored).toEqual({
      metadata: {},
      contract: null,
      defaults: [],
      repositoryBasis: null,
    })
  })

  it("moves a document's SEO config into the metadata of every version and removes it", async () => {
    await insertVersion('about', 'en', 1, '2026-01-01T00:00:00Z')
    await insertVersion('about', 'en', 2, '2026-01-02T00:00:00Z')
    await insertVersion('team/lead', 'en', 1, '2026-01-01T00:00:00Z')
    const config = { entities: [{ '@type': 'AboutPage', properties: { name: 'About' } }] }
    await sql`INSERT INTO seo_config (id, scope, config) VALUES ('doc:pages/about', 'document', ${sql.json(config)})`
    // A config once stored as JSON text
    await sql`INSERT INTO seo_config (id, scope, config) VALUES ('doc:pages/team/lead', 'document', ${sql.json(JSON.stringify(config))})`
    await sql`INSERT INTO seo_config (id, scope, config) VALUES ('site', 'site', ${sql.json({ entities: [] })})`
    await runMigrations(sql, postgresMigrations)

    const rows = await sql<{ authored: { metadata: Record<string, unknown> } }[]>`
      SELECT authored FROM content ORDER BY slug, version`
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row.authored.metadata.seo).toEqual(config)
    expect(await sql`SELECT id FROM seo_config`).toEqual([{ id: 'site' }])
  })

  it('leaves a config it cannot read in place, and nothing aborts the migration', async () => {
    await insertVersion('team', 'en', 1, '2026-01-01T00:00:00Z')
    await sql`INSERT INTO seo_config (id, scope, config) VALUES ('doc:pages/team', 'document', ${sql.json('not json')})`
    await sql.unsafe(
      `INSERT INTO seo_config (id, scope, config) VALUES ('doc:pages/gone', 'document', 'null'::jsonb)`,
    )
    await runMigrations(sql, postgresMigrations)
    const rows = await sql<{ authored: { metadata: Record<string, unknown> } }[]>`
      SELECT authored FROM content WHERE slug = 'team'`
    expect(rows[0]?.authored.metadata).toEqual({})
    expect(await sql`SELECT id FROM seo_config ORDER BY id`).toEqual([
      { id: 'doc:pages/gone' },
      { id: 'doc:pages/team' },
    ])
  })

  it('gives an earlier conflict the locale of the document it names', async () => {
    await insertVersion('about', 'nb', 1, '2026-01-01T00:00:00Z')
    await insertVersion('about', 'en', 1, '2026-01-03T00:00:00Z')
    await sql.unsafe(
      `INSERT INTO content_migration_conflicts (migration_id, collection, slug, repo_checksum, db_checksum)
       VALUES (1, 'pages', 'about', 'a', 'b'), (1, 'pages', 'gone', 'a', 'b')`,
    )
    await runMigrations(sql, postgresMigrations)
    const rows = await sql`SELECT slug, locale FROM content_migration_conflicts ORDER BY slug`
    expect(rows).toEqual([
      { slug: 'about', locale: 'nb' },
      { slug: 'gone', locale: '' },
    ])
  })
})
