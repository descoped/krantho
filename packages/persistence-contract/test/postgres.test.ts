import { randomUUID } from 'node:crypto'
import type { ContentQuery } from '@krantho/persistence'
import { PostgresAdapter } from '@krantho/persistence-postgres'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CONTRACT_SEED, type ContractSeed, queryContract, seedAdapter } from './query.contract.js'

/** The URL of the container the global setup started */
function containerUrl(): string {
  const url = process.env.KRANTHO_TEST_POSTGRES_URL
  if (!url) {
    throw new Error(
      'KRANTHO_TEST_POSTGRES_URL not set: the global setup did not run. Check vitest.config.ts.',
    )
  }
  return url
}

/** A database of its own on the container, so no suite sees another's rows */
async function openDatabase(): Promise<{ sql: Sql; drop(): Promise<void> }> {
  const name = `contract_${randomUUID().replaceAll('-', '')}`
  const admin = postgres(containerUrl(), { max: 1 })
  await admin.unsafe(`CREATE DATABASE ${name}`)
  const url = new URL(containerUrl())
  url.pathname = `/${name}`
  const sql = postgres(url.toString(), { max: 4 })
  return {
    sql,
    drop: async () => {
      await sql.end({ timeout: 5 })
      await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`)
      await admin.end({ timeout: 5 })
    },
  }
}

/** A migrated adapter over a database of its own, seeded with `seed` */
async function openAdapter(seed: ContractSeed) {
  const database = await openDatabase()
  const adapter = await PostgresAdapter.create(database.sql, { defaultLocale: 'en' })
  await seedAdapter(adapter, seed)
  return { adapter, sql: database.sql, close: database.drop }
}

queryContract('postgres', async (seed) => openAdapter(seed), { history: true })

/** The select list of a statement, without the snippet expression that only reads the text */
function selectedColumns(statement: string): string {
  const select = statement.slice('SELECT '.length, statement.indexOf(' FROM content WHERE'))
  return select.replace(/, CASE .* END AS snippet$/s, '')
}

describe('postgres query statements', () => {
  let fixture: Awaited<ReturnType<typeof openAdapter>>

  beforeAll(async () => {
    fixture = await openAdapter(CONTRACT_SEED)
  })

  afterAll(async () => {
    await fixture.close()
  })

  /** The statements, with their parameters, a query sent to the database */
  async function statementsOf(spec: ContentQuery): Promise<Array<[string, unknown[]]>> {
    const unsafe = fixture.sql.unsafe.bind(fixture.sql)
    const calls: Array<[string, unknown[]]> = []
    const spy = vi.spyOn(fixture.sql, 'unsafe').mockImplementation(((
      statement: string,
      params?: never,
    ) => {
      calls.push([statement, (params ?? []) as unknown[]])
      return unsafe(statement, params)
    }) as typeof fixture.sql.unsafe)
    try {
      await fixture.adapter.query(spec)
      return calls
    } finally {
      spy.mockRestore()
    }
  }

  const specs: Array<[string, ContentQuery]> = [
    ['current meta', { state: 'current', projection: 'meta' }],
    ['current summary', { state: 'current', projection: 'summary', sort: 'rank:desc', limit: 3 }],
    ['current full', { state: 'current', projection: 'full', collections: ['pages'] }],
    ['published summary', { state: 'published', projection: 'summary', locale: 'en' }],
    ['no collections', { state: 'published', projection: 'meta', collections: [] }],
    [
      'matched body and fields',
      {
        state: 'current',
        projection: 'summary',
        match: { text: 'river', in: ['slug', 'fields', 'body'] },
        limit: 5,
        offset: 1,
      },
    ],
    [
      'matched published meta',
      { state: 'published', projection: 'meta', match: { text: 'a', in: ['body'] } },
    ],
    ['matched slug', { state: 'current', projection: 'meta', match: { text: 'a', in: ['slug'] } }],
  ]

  it.each(specs)('runs one statement for %s', async (_name, spec) => {
    expect(await statementsOf(spec)).toHaveLength(1)
  })

  const withoutBody: Array<[string, ContentQuery]> = [
    ['meta', { state: 'current', projection: 'meta' }],
    ['published meta', { state: 'published', projection: 'meta' }],
    ['summary', { state: 'current', projection: 'summary' }],
    ['published summary', { state: 'published', projection: 'summary' }],
    [
      'matched meta',
      { state: 'current', projection: 'meta', match: { text: 'river', in: ['body', 'fields'] } },
    ],
    [
      'matched summary',
      {
        state: 'published',
        projection: 'summary',
        match: { text: 'river', in: ['slug', 'body', 'fields'] },
      },
    ],
  ]

  it.each(withoutBody)(
    'selects no body, html, sections or whole row for %s',
    async (_name, spec) => {
      const [call] = await statementsOf(spec)
      expect(call).toBeDefined()
      const columns = selectedColumns(call?.[0] ?? '')
      expect(columns).not.toMatch(/\b(body|html|sections)\b/)
      expect(columns).not.toContain('*')
      // a summary reads the metadata group of `authored`, never the whole column
      expect(columns.replace("authored->'metadata' AS metadata", '')).not.toMatch(/\bauthored\b/)
    },
  )

  it('returns no body, html or sections in the items of a matched summary', async () => {
    const { items } = await fixture.adapter.query({
      state: 'current',
      projection: 'summary',
      match: { text: 'river', in: ['body'] },
    })
    expect(items).toHaveLength(1)
    for (const item of items) {
      for (const column of ['body', 'html', 'sections']) expect(item).not.toHaveProperty(column)
    }
  })

  it('binds the match text, collections and locale as parameters, never into the statement', async () => {
    const hostile = "x'; DROP TABLE content; --"
    const spec: ContentQuery = {
      state: 'current',
      projection: 'meta',
      locale: hostile,
      collections: [hostile],
      match: { text: hostile, in: ['slug', 'fields', 'body'] },
    }
    const [call] = await statementsOf(spec)
    expect(call?.[0]).not.toContain('DROP')
    expect(call?.[1]).toContain(hostile)
    expect(await fixture.adapter.query(spec)).toEqual({ items: [], hasMore: false })
  })

  it('references every parameter it binds', async () => {
    for (const [, spec] of specs) {
      const [call] = await statementsOf(spec)
      const [statement, params] = call ?? ['', []]
      for (let index = 1; index <= params.length; index++) {
        expect(statement).toContain(`$${index}`)
      }
    }
  })
})
