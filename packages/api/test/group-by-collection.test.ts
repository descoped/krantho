import { describe, expect, it } from 'vitest'
import { groupByCollection } from '../src/group-by-collection.js'

interface Item {
  collection: string
  slug: string
}

const collectionOf = (item: Item): string => item.collection

describe('groupByCollection', () => {
  it('groups items in the order of the names, keeping each group in the order read', () => {
    const items: Item[] = [
      { collection: 'posts', slug: 'b' },
      { collection: 'pages', slug: 'a' },
      { collection: 'posts', slug: 'a' },
    ]
    const groups = groupByCollection(items, ['pages', 'posts'], collectionOf)
    expect([...groups.keys()]).toEqual(['pages', 'posts'])
    expect(groups.get('pages')?.map((item) => item.slug)).toEqual(['a'])
    expect(groups.get('posts')?.map((item) => item.slug)).toEqual(['b', 'a'])
  })

  it('gives every name a group, empty when nothing belongs to it', () => {
    const groups = groupByCollection<Item>([], ['pages', 'posts'], collectionOf)
    expect(groups.get('pages')).toEqual([])
    expect(groups.get('posts')).toEqual([])
  })

  it('leaves out items of a collection it was not given', () => {
    const groups = groupByCollection([{ collection: 'drafts', slug: 'x' }], ['pages'], collectionOf)
    expect([...groups.keys()]).toEqual(['pages'])
    expect(groups.get('pages')).toEqual([])
  })
})
