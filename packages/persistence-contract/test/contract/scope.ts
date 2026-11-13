import { describe, expect, it } from 'vitest'
import { ALL_CURRENT, ALL_LIVE, type ContractQueries } from './fixture.js'

/** Which documents a query reads: their state, status, collections and locale */
export function scopeCases({ run, ids }: ContractQueries): void {
  describe('state and status', () => {
    it('current reads the current version of every document that is not deleted', async () => {
      expect(await ids({ state: 'current', projection: 'meta' })).toEqual(ALL_CURRENT)
    })

    it('published reads the live version of each document that has one', async () => {
      expect(await ids({ state: 'published', projection: 'meta' })).toEqual(ALL_LIVE)
      const { items } = await run({ state: 'published', projection: 'full' })
      const charlie = items.find((item) => item.meta.slug === 'charlie')
      expect(charlie?.fields.title).toBe('Charlie live')
      expect(charlie?.body).toBe('Charlie live body.')
      expect(charlie?.meta.version).toBe(1)
    })

    it('status filters the current version by its publication state', async () => {
      const status = (value: 'draft' | 'published' | 'archived') =>
        ids({ state: 'current', projection: 'meta', status: value })
      expect(await status('draft')).toEqual(['pages/bravo/en', 'pages/fifty/en', 'posts/p2/en'])
      expect(await status('published')).toEqual(ALL_LIVE)
      expect(await status('archived')).toEqual(['pages/delta/en'])
    })

    it('never returns a deleted document', async () => {
      for (const state of ['current', 'published'] as const) {
        const found = await ids({
          state,
          projection: 'meta',
          match: { text: 'echo', in: ['slug'] },
        })
        expect(found).toEqual([])
      }
      expect(await ids({ state: 'current', projection: 'meta' })).not.toContain('pages/echo/en')
    })
  })

  describe('scope', () => {
    it('reads one collection, several, or every collection', async () => {
      const posts = ['posts/p1/en', 'posts/p2/en', 'posts/p3/en']
      expect(await ids({ state: 'current', projection: 'meta', collections: ['posts'] })).toEqual(
        posts,
      )
      expect(
        await ids({ state: 'current', projection: 'meta', collections: ['pages', 'posts'] }),
      ).toEqual(ALL_CURRENT)
      expect(await ids({ state: 'current', projection: 'meta' })).toEqual(ALL_CURRENT)
      expect(await ids({ state: 'published', projection: 'meta', collections: ['posts'] })).toEqual(
        ['posts/p1/en', 'posts/p3/en'],
      )
    })

    it('reads nothing from an empty list of collections', async () => {
      for (const state of ['current', 'published'] as const) {
        for (const projection of ['meta', 'summary', 'full'] as const) {
          const page = await run({ state, projection, collections: [] })
          expect(page).toEqual({ items: [], hasMore: false })
        }
      }
      const matched = await run({
        state: 'current',
        projection: 'summary',
        collections: [],
        match: { text: 'a', in: ['slug', 'fields', 'body'] },
        limit: 5,
      })
      expect(matched).toEqual({ items: [], hasMore: false })
    })

    it('reads one locale, or every locale', async () => {
      expect(await ids({ state: 'current', projection: 'meta', locale: 'nb' })).toEqual([
        'pages/alpha-nb/nb',
      ])
      expect(await ids({ state: 'published', projection: 'meta', locale: 'nb' })).toEqual([
        'pages/alpha-nb/nb',
      ])
      expect(await ids({ state: 'current', projection: 'meta', collections: ['pages'] })).toEqual(
        ALL_CURRENT.filter((id) => id.startsWith('pages/')),
      )
    })
  })
}
