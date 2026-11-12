import { randomUUID } from 'node:crypto'
import type { Sql } from 'postgres'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgresContentMigrationAdapter } from '../src/content-migration.js'
import { runMigrations } from '../src/migration-runner.js'
import { postgresMigrations } from '../src/migrations/index.js'
import { PostgresSeoConfigAdapter } from '../src/postgres-seo-config-adapter.js'

/**
 * The adapters that keep a JSON document in a JSONB column, against a real
 * Postgres (the globalSetup testcontainer): what is saved is read back as the
 * same object, and Postgres holds it as an object, not as a JSON string.
 */
let admin: Sql
let db: Sql
const database = `krantho_json_${randomUUID().replaceAll('-', '')}`

beforeAll(async () => {
  const connectionUri = process.env['KRANTHO_TEST_POSTGRES_URL']
  if (!connectionUri) {
    throw new Error('KRANTHO_TEST_POSTGRES_URL not set — globalSetup did not run.')
  }
  admin = postgres(connectionUri, { max: 1 })
  await admin.unsafe(`CREATE DATABASE ${database}`)
  const url = new URL(connectionUri)
  url.pathname = `/${database}`
  db = postgres(url.toString(), { max: 4, onnotice: () => {} })
  await runMigrations(db, postgresMigrations)
})

afterAll(async () => {
  await db?.end({ timeout: 5 })
  await admin?.unsafe(`DROP DATABASE IF EXISTS ${database}`)
  await admin?.end({ timeout: 5 })
})

beforeEach(async () => {
  await db`TRUNCATE TABLE seo_config, content_manifest`
})

describe('PostgresSeoConfigAdapter', () => {
  const config = {
    entities: [{ '@type': 'Article', role: 'primary', properties: { headline: 'About' } }],
    fieldMappings: { 'Article.date': 'datePublished' },
  }

  it('reads a saved configuration back as the object it saved', async () => {
    const adapter = new PostgresSeoConfigAdapter(db)
    await adapter.saveConfig({ id: 'collection:docs', scope: 'collection', config })

    expect((await adapter.getConfig('collection:docs'))?.config).toEqual(config)
    expect((await adapter.listConfigs('collection'))[0]?.config).toEqual(config)
    const [row] = await db`SELECT jsonb_typeof(config) AS type FROM seo_config`
    expect(row?.['type']).toBe('object')
  })

  it('replaces a configuration on a second save', async () => {
    const adapter = new PostgresSeoConfigAdapter(db)
    await adapter.saveConfig({ id: 'site', scope: 'site', config })
    const next = { entities: [{ '@type': 'Organization', properties: { name: 'Krantho' } }] }
    await adapter.saveConfig({ id: 'site', scope: 'site', config: next })

    expect((await adapter.getConfig('site'))?.config).toEqual(next)
  })
})

describe('PostgresContentMigrationAdapter', () => {
  it("reads a saved manifest's file checksums back as an object", async () => {
    const adapter = new PostgresContentMigrationAdapter(db)
    const fileChecksums = { 'docs/install.md': 'abc', 'releases/v0-8-0.md': 'def' }
    await adapter.saveContentManifest({
      id: 0,
      repoVersion: 1790879439,
      repoCommit: null,
      importedAt: '2026-10-01T18:00:00.000Z',
      fileChecksums,
    })

    const saved = await adapter.getContentManifest()
    expect(saved?.fileChecksums).toEqual(fileChecksums)
    expect(await adapter.getContentManifestVersion()).toBe(1790879439)
    const [row] = await db`SELECT jsonb_typeof(file_checksums) AS type FROM content_manifest`
    expect(row?.['type']).toBe('object')
  })
})
