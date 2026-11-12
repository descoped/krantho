import { describe, expect, it } from 'vitest'
import { type ContractQueries, idOf } from './fixture.js'

/** What each projection carries of a document */
export function projectionCases({ run }: ContractQueries): void {
  describe('projections', () => {
    it('meta carries the meta and nothing of the content', async () => {
      const { items } = await run({ state: 'current', projection: 'meta' })
      expect(items).toHaveLength(9)
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual([
          'changedBy',
          'collection',
          'createdAt',
          'liveVersion',
          'locale',
          'slug',
          'source',
          'status',
          'version',
        ])
      }
      const alpha = items.find((item) => idOf(item) === 'pages/alpha/en')
      expect(alpha).toMatchObject({ status: 'published', version: 1, liveVersion: 1 })
    })

    it('summary carries the meta, the fields and the metadata, and no content', async () => {
      const { items } = await run({ state: 'current', projection: 'summary' })
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(['fields', 'meta', 'metadata'])
      }
      const alpha = items.find((item) => idOf(item) === 'pages/alpha/en')
      expect(alpha?.fields).toEqual({ title: 'Alpha', rank: 3, kind: 'x' })
    })

    it('full carries the whole document', async () => {
      const { items } = await run({ state: 'current', projection: 'full' })
      const alpha = items.find((item) => idOf(item) === 'pages/alpha/en')
      expect(alpha?.body).toBe('Alpha body mentions Ørret in a river.\n\nSecond   paragraph.')
      expect(alpha?.fields).toEqual({ title: 'Alpha', rank: 3, kind: 'x' })
      expect(typeof alpha?.html).toBe('string')
      expect(typeof alpha?.sections).toBe('object')
      expect(alpha?.meta).toMatchObject({ collection: 'pages', slug: 'alpha', locale: 'en' })
      expect(items.every((item) => !('snippet' in item))).toBe(true)
    })
  })
}
