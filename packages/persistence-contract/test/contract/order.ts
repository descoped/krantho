import { describe, expect, it } from 'vitest'
import { ALL_CURRENT, type ContractQueries, idOf, useSeed } from './fixture.js'
import { type ContractFactory, SORT_SEED } from './seed.js'

/** The order of a query and the pages it is read in */
export function orderCases({ run, ids }: ContractQueries, factory: ContractFactory): void {
  describe('order', () => {
    it('sorts by a direct column in both directions, ties broken by collection, slug, locale', async () => {
      const asc = await ids({ state: 'current', projection: 'meta', sort: 'slug' })
      expect(asc.slice(0, 2)).toEqual(['pages/alpha/en', 'pages/alpha-nb/nb'])
      expect(asc.at(-1)).toBe('posts/p3/en')
      const desc = await ids({ state: 'current', projection: 'meta', sort: 'slug:desc' })
      expect(desc).toEqual([
        'posts/p3/en',
        'posts/p2/en',
        'posts/p1/en',
        'pages/fifty/en',
        'pages/delta/en',
        'pages/charlie/en',
        'pages/bravo/en',
        'pages/alpha-nb/nb',
        'pages/alpha/en',
      ])
    })

    it('sorts by a field in both directions', async () => {
      const byRank = [
        'pages/bravo/en',
        'pages/charlie/en',
        'pages/alpha/en',
        'pages/delta/en',
        'pages/fifty/en',
        'pages/alpha-nb/nb',
        'posts/p1/en',
        'posts/p2/en',
        'posts/p3/en',
      ]
      expect(await ids({ state: 'current', projection: 'summary', sort: 'rank' })).toEqual(byRank)
      expect(await ids({ state: 'current', projection: 'summary', sort: 'rank:desc' })).toEqual(
        [...byRank].reverse(),
      )
    })

    it('breaks ties on a field by collection, slug, locale in either direction', async () => {
      const byKindDesc = await ids({ state: 'current', projection: 'summary', sort: 'kind:desc' })
      expect(byKindDesc).toEqual([
        'posts/p1/en',
        'posts/p2/en',
        'posts/p3/en',
        'pages/alpha/en',
        'pages/alpha-nb/nb',
        'pages/bravo/en',
        'pages/charlie/en',
        'pages/delta/en',
        'pages/fifty/en',
      ])
    })

    it('sorts the live version by its own fields', async () => {
      expect(await ids({ state: 'published', projection: 'summary', sort: 'rank:desc' })).toEqual([
        'posts/p3/en',
        'posts/p1/en',
        'pages/alpha-nb/nb',
        'pages/alpha/en',
        'pages/charlie/en',
      ])
    })
  })

  describe('order of mixed values', () => {
    const mixed = useSeed(factory, SORT_SEED)
    const byOrder = [
      'pages/none/en',
      'pages/one/en',
      'pages/two/en',
      'pages/ten/en',
      'pages/word/en',
    ]

    it('puts a missing value first, then numbers numerically, then text', async () => {
      expect(await mixed.ids({ state: 'current', projection: 'meta', sort: 'order' })).toEqual(
        byOrder,
      )
    })

    it('reverses that order when descending', async () => {
      expect(await mixed.ids({ state: 'current', projection: 'meta', sort: 'order:desc' })).toEqual(
        [...byOrder].reverse(),
      )
    })
  })

  describe('paging', () => {
    it('pages without gap or repeat and reports hasMore from one extra row', async () => {
      const page = (offset: number) =>
        run({ state: 'current', projection: 'meta', limit: 4, offset })
      const [first, second, third] = [await page(0), await page(4), await page(8)]
      expect([first.items.length, second.items.length, third.items.length]).toEqual([4, 4, 1])
      expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false])
      const seen = [...first.items, ...second.items, ...third.items].map(
        ({ collection, slug, locale }) => `${collection}/${slug}/${locale}`,
      )
      expect(seen).toEqual(ALL_CURRENT)
    })

    it('has no more when the limit equals the matches, and none when there is no limit', async () => {
      const exact = await run({ state: 'current', projection: 'meta', limit: 9 })
      expect(exact.items).toHaveLength(9)
      expect(exact.hasMore).toBe(false)
      const all = await run({ state: 'current', projection: 'meta' })
      expect(all.items).toHaveLength(9)
      expect(all.hasMore).toBe(false)
    })

    it('reads from an offset without a limit', async () => {
      const rest = await run({ state: 'current', projection: 'meta', offset: 7 })
      expect(rest.items.map(idOf)).toEqual(ALL_CURRENT.slice(7))
      expect(rest.hasMore).toBe(false)
    })

    it('pages a sorted query stably', async () => {
      const seen: string[] = []
      for (const offset of [0, 3, 6]) {
        const page = await ids({
          state: 'current',
          projection: 'meta',
          sort: 'kind:desc',
          limit: 3,
          offset,
        })
        seen.push(...page)
      }
      expect(seen).toEqual(await ids({ state: 'current', projection: 'meta', sort: 'kind:desc' }))
    })
  })
}
