import { describe, expect, it } from 'vitest'
import { useSeed } from './fixture.js'
import { type ContractFactory, HISTORY_SEED } from './seed.js'

/** What only an adapter that keeps versions holds: a draft ahead of the live version, one slug in two locales */
export function historyCases(factory: ContractFactory): void {
  describe('history', () => {
    const { run, ids } = useSeed(factory, HISTORY_SEED)

    it('current reads the newer draft, published the live version before it', async () => {
      const current = await run({ state: 'current', projection: 'summary', collections: ['pages'] })
      const draft = current.items.find((item) => item.meta.slug === 'live-draft')
      expect(draft?.fields.title).toBe('Newer')
      expect(draft?.meta).toMatchObject({ version: 2, liveVersion: 1, status: 'published' })

      const live = await run({ state: 'published', projection: 'full', collections: ['pages'] })
      const liveDraft = live.items.find((item) => item.meta.slug === 'live-draft')
      expect(liveDraft?.fields.title).toBe('Live')
      expect(liveDraft?.body).toBe('Live body.')
      expect(liveDraft?.meta.version).toBe(1)
    })

    it('matches the live version of a published query, not the draft ahead of it', async () => {
      const fields = (state: 'current' | 'published', text: string) =>
        ids({ state, projection: 'meta', match: { text, in: ['fields'] } })
      expect(await fields('published', 'newer')).toEqual([])
      expect(await fields('current', 'newer')).toEqual(['pages/live-draft/en'])
      expect(await fields('published', 'live')).toEqual(['pages/live-draft/en'])
      expect(await fields('current', 'live')).toEqual([])
    })

    it('sorts the live version by its own fields, not those of the draft ahead of it', async () => {
      const rank = (state: 'current' | 'published') =>
        ids({ state, projection: 'summary', sort: 'rank' })
      expect(await rank('current')).toEqual([
        'pages/live-draft/en',
        'pages/dual/en',
        'pages/dual/nb',
      ])
      expect(await rank('published')).toEqual([
        'pages/dual/en',
        'pages/dual/nb',
        'pages/live-draft/en',
      ])
    })

    it('reads one slug in two locales, ties broken by locale', async () => {
      expect(await ids({ state: 'current', projection: 'meta', sort: 'slug' })).toEqual([
        'pages/dual/en',
        'pages/dual/nb',
        'pages/live-draft/en',
      ])
      expect(await ids({ state: 'current', projection: 'meta', sort: 'slug:desc' })).toEqual([
        'pages/live-draft/en',
        'pages/dual/en',
        'pages/dual/nb',
      ])
      expect(await ids({ state: 'published', projection: 'meta', locale: 'nb' })).toEqual([
        'pages/dual/nb',
      ])
      const page = await run({ state: 'current', projection: 'meta', sort: 'slug', limit: 1 })
      expect(page.items.map((item) => item.locale)).toEqual(['en'])
      expect(page.hasMore).toBe(true)
    })
  })
}
