import { describe, expect, it } from 'vitest'
import { type ContractQueries, idOf, useSeed } from './fixture.js'
import { type ContractFactory, SNIPPET_SEED } from './seed.js'

/** The snippet of a match: its source, its whitespace, and the window it is cut in */
export function snippetCases({ run }: ContractQueries, factory: ContractFactory): void {
  describe('snippet', () => {
    it('is the matched body with whitespace collapsed, and absent without a body or fields match', async () => {
      const { items } = await run({
        state: 'current',
        projection: 'summary',
        match: { text: 'river', in: ['body'] },
      })
      expect(items).toHaveLength(1)
      expect(items[0]?.snippet).toBe('Alpha body mentions Ørret in a river. Second paragraph.')

      const bySlug = await run({
        state: 'current',
        projection: 'summary',
        match: { text: 'alpha', in: ['slug'] },
      })
      expect(bySlug.items.every((item) => !('snippet' in item))).toBe(true)
    })

    it('is taken from the fields when only they match', async () => {
      const { items } = await run({
        state: 'current',
        projection: 'summary',
        match: { text: 'post three', in: ['fields', 'body'] },
      })
      expect(items).toHaveLength(1)
      expect(items[0]?.snippet).toContain('Post three')
    })

    it('prefers the body when both match', async () => {
      const { items } = await run({
        state: 'current',
        projection: 'summary',
        match: { text: 'alpha', in: ['fields', 'body'] },
      })
      const en = items.find((item) => idOf(item) === 'pages/alpha/en')
      expect(en?.snippet).toBe('Alpha body mentions Ørret in a river. Second paragraph.')
    })
  })

  describe('snippet window', () => {
    const windows = useSeed(factory, SNIPPET_SEED)
    const snippetOf = async (needle: string) => {
      const { items } = await windows.run({
        state: 'current',
        projection: 'meta',
        match: { text: needle, in: ['body'] },
      })
      expect(items).toHaveLength(1)
      return items[0]?.snippet
    }

    it('starts 80 characters before the match and holds 200, in the original case', async () => {
      const snippet = await snippetOf('deepmark')
      expect(snippet).toBe(`${'a'.repeat(80)}DEEPMARK${'b'.repeat(112)}`)
      expect(snippet).toHaveLength(200)
    })

    it('starts at the beginning of the text when the match is within its first 80 characters', async () => {
      const near = await snippetOf('startmark')
      expect(near).toBe(`${'a'.repeat(10)}STARTMARK${'b'.repeat(181)}`)
      expect(near).toHaveLength(200)
      // a match exactly 80 characters in still has the whole text before it
      const edge = await snippetOf('edgemark')
      expect(edge).toBe(`${'a'.repeat(80)}EDGEMARK${'b'.repeat(112)}`)
      expect(edge).toHaveLength(200)
    })
  })
}
