import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../src/migration-runner.js'
import { sqliteMigrations } from '../src/migrations/index.js'

let db: Database.Database

const before13 = sqliteMigrations.filter((migration) => migration.version < 13)

function insertVersion(slug: string, locale: string, version: number, createdAt: string): void {
  db.prepare(
    `INSERT INTO content (id, collection, slug, locale, version, is_current, status, fields, body, created_at)
     VALUES (?, 'pages', ?, ?, ?, ?, 'published', '{}', '', ?)`,
  ).run(`${slug}-${locale}-${version}`, slug, locale, version, version === 2 ? 1 : 0, createdAt)
}

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, before13)
})

afterEach(() => {
  db.close()
})

describe('v013 content contracts on a database from before it', () => {
  it('adds authored metadata to existing rows, empty and without a contract', () => {
    insertVersion('about', 'en', 1, '2026-01-01T00:00:00Z')
    runMigrations(db, sqliteMigrations)
    const row = db.prepare('SELECT authored FROM content').get() as { authored: string }
    expect(JSON.parse(row.authored)).toEqual({
      metadata: {},
      contract: null,
      defaults: [],
      repositoryBasis: null,
    })
  })

  it("moves a document's SEO config into the metadata of every version and removes it", () => {
    insertVersion('about', 'en', 1, '2026-01-01T00:00:00Z')
    insertVersion('about', 'en', 2, '2026-01-02T00:00:00Z')
    insertVersion('team/lead', 'en', 1, '2026-01-01T00:00:00Z')
    const config = { entities: [{ '@type': 'AboutPage', properties: { name: 'About' } }] }
    db.prepare(`INSERT INTO seo_config (id, scope, config) VALUES (?, 'document', ?)`).run(
      'doc:pages/about',
      JSON.stringify(config),
    )
    db.prepare(`INSERT INTO seo_config (id, scope, config) VALUES (?, 'document', ?)`).run(
      'doc:pages/team/lead',
      JSON.stringify(config),
    )
    db.prepare(
      `INSERT INTO seo_config (id, scope, config) VALUES ('site', 'site', '{"entities":[]}')`,
    ).run()
    runMigrations(db, sqliteMigrations)

    const rows = db
      .prepare('SELECT slug, authored FROM content ORDER BY slug, version')
      .all() as Array<{
      slug: string
      authored: string
    }>
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(JSON.parse(row.authored).metadata.seo).toEqual(config)
    const left = db.prepare('SELECT id FROM seo_config').all()
    expect(left).toEqual([{ id: 'site' }])
  })

  it('unwraps a config stored as JSON text and leaves a config it cannot read in place', () => {
    insertVersion('about', 'en', 1, '2026-01-01T00:00:00Z')
    insertVersion('team', 'en', 1, '2026-01-01T00:00:00Z')
    const config = { entities: [{ '@type': 'AboutPage', properties: {} }] }
    const add = db.prepare(`INSERT INTO seo_config (id, scope, config) VALUES (?, 'document', ?)`)
    add.run('doc:pages/about', JSON.stringify(JSON.stringify(config)))
    add.run('doc:pages/team', 'not json')
    add.run('doc:pages/gone', 'null')
    runMigrations(db, sqliteMigrations)

    const authored = (slug: string) =>
      JSON.parse(
        (
          db.prepare('SELECT authored FROM content WHERE slug = ?').get(slug) as {
            authored: string
          }
        ).authored,
      )
    expect(authored('about').metadata.seo).toEqual(config)
    expect(authored('team').metadata).toEqual({})
    expect(db.prepare('SELECT id FROM seo_config ORDER BY id').all()).toEqual([
      { id: 'doc:pages/gone' },
      { id: 'doc:pages/team' },
    ])
  })

  it('gives an earlier conflict the locale of the document it names', () => {
    insertVersion('about', 'nb', 1, '2026-01-01T00:00:00Z')
    insertVersion('about', 'en', 1, '2026-01-03T00:00:00Z')
    db.prepare(
      `INSERT INTO content_migration_conflicts (migration_id, collection, slug, repo_checksum, db_checksum)
       VALUES (1, 'pages', 'about', 'a', 'b'), (1, 'pages', 'gone', 'a', 'b')`,
    ).run()
    runMigrations(db, sqliteMigrations)
    const rows = db
      .prepare('SELECT slug, locale FROM content_migration_conflicts ORDER BY slug')
      .all()
    expect(rows).toEqual([
      { slug: 'about', locale: 'nb' },
      { slug: 'gone', locale: '' },
    ])
  })
})
