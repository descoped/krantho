import type { ContentQuery } from '@krantho/persistence'
import { SQLiteAdapter } from '@krantho/persistence-sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CONTRACT_SEED, queryContract, seedAdapter } from './query.contract.js'

queryContract(
  'sqlite',
  async (seed) => {
    const adapter = new SQLiteAdapter(':memory:', { defaultLocale: 'en' })
    await seedAdapter(adapter, seed)
    return { adapter, close: () => adapter.close() }
  },
  { history: true },
)

/** The columns a statement selects, without the snippet expression that only reads the text */
function selectedColumns(sql: string): string {
  const select = sql.slice('SELECT '.length, sql.indexOf(' FROM content WHERE'))
  return select.replace(/, CASE .* END AS snippet$/s, '')
}

describe('sqlite query statements', () => {
  let adapter: SQLiteAdapter

  beforeAll(async () => {
    adapter = new SQLiteAdapter(':memory:', { defaultLocale: 'en' })
    await seedAdapter(adapter, CONTRACT_SEED)
  })

  afterAll(() => {
    adapter.close()
  })

  /** The statements a query prepared */
  async function statementsOf(spec: ContentQuery): Promise<string[]> {
    const prepare = vi.spyOn(adapter.database, 'prepare')
    try {
      await adapter.query(spec)
      return prepare.mock.calls.map(([sql]) => sql)
    } finally {
      prepare.mockRestore()
    }
  }

  const specs: Array<[string, ContentQuery]> = [
    ['current meta', { state: 'current', projection: 'meta' }],
    ['current summary', { state: 'current', projection: 'summary', sort: 'rank:desc', limit: 3 }],
    ['current full', { state: 'current', projection: 'full', collections: ['pages'] }],
    ['published summary', { state: 'published', projection: 'summary', locale: 'en' }],
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
      const [sql] = await statementsOf(spec)
      expect(sql).toBeDefined()
      const columns = selectedColumns(sql ?? '')
      expect(columns).not.toMatch(/\b(body|html|sections)\b/)
      expect(columns).not.toContain('*')
      // a summary reads the metadata group of `authored`, never the whole column
      expect(columns.replace("json_extract(authored, '$.metadata') AS metadata", '')).not.toMatch(
        /\bauthored\b/,
      )
    },
  )

  it('returns no body, html or sections in the items of a matched summary', async () => {
    const { items } = await adapter.query({
      state: 'current',
      projection: 'summary',
      match: { text: 'river', in: ['body'] },
    })
    expect(items).toHaveLength(1)
    for (const item of items) {
      for (const column of ['body', 'html', 'sections']) expect(item).not.toHaveProperty(column)
    }
  })

  it('binds the match text and locale as parameters, never into the statement', async () => {
    const hostile = "x'; DROP TABLE content; --"
    const [sql] = await statementsOf({
      state: 'current',
      projection: 'meta',
      locale: hostile,
      collections: [hostile],
      match: { text: hostile, in: ['slug', 'fields', 'body'] },
    })
    expect(sql).not.toContain('DROP')
    expect(await adapter.query({ state: 'current', projection: 'meta', locale: hostile })).toEqual({
      items: [],
      hasMore: false,
    })
  })
})
