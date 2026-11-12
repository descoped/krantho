import { randomUUID } from 'node:crypto'
import type { Sql } from 'postgres'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../src/migration-runner.js'
import { postgresMigrations } from '../src/migrations/index.js'
import { PostgresAdapter } from '../src/postgres-adapter.js'

/**
 * Concurrent cold starts. Serverless platforms boot several instances against
 * one database at once; each runs migrations on its own connection pool. Every
 * test here gets a database of its own, so the ledger starts empty.
 */
describe('migrations under concurrent cold starts', () => {
  let admin: Sql
  const clients: Sql[] = []
  const databases: string[] = []

  beforeAll(() => {
    const connectionUri = process.env['KRANTHO_TEST_POSTGRES_URL']
    if (!connectionUri) {
      throw new Error('KRANTHO_TEST_POSTGRES_URL not set — globalSetup did not run.')
    }
    admin = postgres(connectionUri, { max: 1 })
  })

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })))
    for (const name of databases) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`)
    }
    await admin?.end({ timeout: 5 })
  })

  /** Create an empty database and return a client factory for it */
  async function freshDatabase(): Promise<() => Sql> {
    const name = `krantho_race_${randomUUID().replaceAll('-', '')}`
    await admin.unsafe(`CREATE DATABASE ${name}`)
    databases.push(name)
    const url = new URL(process.env['KRANTHO_TEST_POSTGRES_URL'] as string)
    url.pathname = `/${name}`
    return () => {
      const client = postgres(url.toString(), { max: 2, onnotice: () => {} })
      clients.push(client)
      return client
    }
  }

  it('two runners racing on a fresh database both succeed and apply each migration once', async () => {
    const connect = await freshDatabase()
    const first = connect()
    const second = connect()

    const results = await Promise.all([
      runMigrations(first, postgresMigrations),
      runMigrations(second, postgresMigrations),
    ])

    const latest = postgresMigrations.length
    expect(results.map((r) => r.currentVersion)).toEqual([latest, latest])
    const appliedVersions = results.flatMap((r) => r.applied.map((m) => m.version))
    expect(appliedVersions.sort((a, b) => a - b)).toEqual(postgresMigrations.map((m) => m.version))

    const ledger = await first<{ version: number }[]>`
      SELECT version FROM schema_migrations ORDER BY version`
    expect(ledger.map((row) => row.version)).toEqual(postgresMigrations.map((m) => m.version))
  })

  it('adapters racing on a fresh database both initialize', async () => {
    const connect = await freshDatabase()
    const adapters = await Promise.all([
      PostgresAdapter.create(connect(), { defaultLocale: 'en' }),
      PostgresAdapter.create(connect(), { defaultLocale: 'en' }),
    ])
    expect(await Promise.all(adapters.map((adapter) => adapter.listSlugs()))).toEqual([[], []])
  })

  it('shares one initialization across concurrent calls on one adapter', async () => {
    const connect = await freshDatabase()
    const adapter = new PostgresAdapter(connect(), { defaultLocale: 'en' })
    const results = await Promise.all([
      adapter.listSlugs(),
      adapter.exists('home'),
      adapter.getContent('pages', 'home'),
    ])
    expect(results).toEqual([[], false, null])
  })
})
