import { describe, expect, it } from 'vitest'
import { type ContractQueries, useSeed } from './fixture.js'
import { type ContractFactory, TEXT_SEED } from './seed.js'

type Targets = Array<'slug' | 'fields' | 'body'>

/** The text match: its targets, its case folding, its literal characters */
export function matchCases({ run, ids }: ContractQueries, factory: ContractFactory): void {
  describe('match', () => {
    const match = (text: string, targets: Targets) =>
      ids({ state: 'current', projection: 'summary', match: { text, in: targets } })

    it('matches the slug, the fields and the body each on their own', async () => {
      expect(await match('ALPH', ['slug'])).toEqual(['pages/alpha/en', 'pages/alpha-nb/nb'])
      expect(await match('charlie live', ['fields'])).toEqual(['pages/charlie/en'])
      expect(await match('river', ['body'])).toEqual(['pages/alpha/en'])
      expect(await match('river', ['slug', 'fields'])).toEqual([])
    })

    it('matches when any target contains the text', async () => {
      expect(await match('post', ['slug', 'fields'])).toEqual([
        'posts/p1/en',
        'posts/p2/en',
        'posts/p3/en',
      ])
      expect(await match('alpha', ['slug', 'body'])).toEqual([
        'pages/alpha/en',
        'pages/alpha-nb/nb',
      ])
    })

    it('matches nothing when it looks nowhere', async () => {
      expect(await match('alpha', [])).toEqual([])
    })

    it('ignores case, in non-ASCII letters too', async () => {
      expect(await match('ørret', ['body'])).toEqual(['pages/alpha/en'])
      expect(await match('ØRRET', ['body'])).toEqual(['pages/alpha/en'])
      expect(await match('ørret', ['fields'])).toEqual(['pages/alpha-nb/nb'])
      expect(await match('æsj', ['fields'])).toEqual(['pages/alpha-nb/nb'])
    })

    it('matches LIKE wildcards literally', async () => {
      expect(await match('100%', ['body'])).toEqual(['pages/fifty/en'])
      expect(await match('%', ['body'])).toEqual(['pages/fifty/en'])
      expect(await match('b_dy', ['body'])).toEqual([])
    })

    it('matches the live version of a published query', async () => {
      const live = (text: string) =>
        ids({ state: 'published', projection: 'meta', match: { text, in: ['fields'] } })
      expect(await live('charlie live')).toEqual(['pages/charlie/en'])
      expect(await live('bravo')).toEqual([])
    })

    it('pages a match', async () => {
      const page = await run({
        state: 'current',
        projection: 'meta',
        match: { text: 'body', in: ['body'] },
        limit: 2,
      })
      expect(page.items).toHaveLength(2)
      expect(page.hasMore).toBe(true)
    })
  })

  describe('match on a backslash', () => {
    const text = useSeed(factory, TEXT_SEED)
    const body = (needle: string) =>
      text.ids({ state: 'current', projection: 'meta', match: { text: needle, in: ['body'] } })

    it('matches the backslash literally, never as an escape', async () => {
      expect(await body('\\')).toEqual(['pages/windows/en'])
      expect(await body('c:\\dir')).toEqual(['pages/windows/en'])
      expect(await body('\\file')).toEqual(['pages/windows/en'])
      expect(await body('dir')).toEqual(['pages/plain/en', 'pages/windows/en'])
    })

    it('matches a backslash followed by a wildcard character literally', async () => {
      expect(await body('\\%')).toEqual([])
      expect(await body('\\_')).toEqual([])
    })

    it('returns the snippet around a backslash', async () => {
      const { items } = await text.run({
        state: 'current',
        projection: 'meta',
        match: { text: 'c:\\dir', in: ['body'] },
      })
      expect(items.map((item) => item.snippet)).toEqual(['Open C:\\dir\\file now.'])
    })
  })
}
