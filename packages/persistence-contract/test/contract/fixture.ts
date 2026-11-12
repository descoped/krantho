import type { ContentQuery, DocumentMeta, QueryPage, QueryProjection } from '@krantho/persistence'
import { afterAll, beforeAll } from 'vitest'
import type { ContractFactory, ContractFixture, ContractSeed } from './seed.js'

/** Reads against one seeded adapter */
export interface ContractQueries {
  run<P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>>
  /** The `collection/slug/locale` of each item of the page, in order */
  ids(spec: ContentQuery): Promise<string[]>
}

/** `collection/slug/locale` of an item, whatever its projection */
export function idOf(item: DocumentMeta | { meta: DocumentMeta }): string {
  const meta = 'meta' in item ? item.meta : item
  return `${meta.collection}/${meta.slug}/${meta.locale}`
}

/** Seed an adapter before the suite it is called in, and close it after */
export function useSeed(factory: ContractFactory, seed: ContractSeed): ContractQueries {
  let fixture: ContractFixture | undefined
  beforeAll(async () => {
    fixture = await factory(seed)
  })
  afterAll(async () => {
    await fixture?.close()
  })
  const adapter = () => {
    if (!fixture) throw new Error('The adapter is not seeded yet')
    return fixture.adapter
  }
  return {
    run: (spec) => adapter().query(spec),
    ids: async (spec) => (await adapter().query(spec)).items.map(idOf),
  }
}

/** The current, not deleted documents of the main seed, in the default order */
export const ALL_CURRENT = [
  'pages/alpha/en',
  'pages/alpha-nb/nb',
  'pages/bravo/en',
  'pages/charlie/en',
  'pages/delta/en',
  'pages/fifty/en',
  'posts/p1/en',
  'posts/p2/en',
  'posts/p3/en',
]

/** The live documents of the main seed, in the default order */
export const ALL_LIVE = [
  'pages/alpha/en',
  'pages/alpha-nb/nb',
  'pages/charlie/en',
  'posts/p1/en',
  'posts/p3/en',
]
