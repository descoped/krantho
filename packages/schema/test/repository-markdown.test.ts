import { repositoryMarkdown } from '@krantho/persistence'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'

const document = {
  identity: { collection: 'pages', slug: 'about', locale: 'en' },
  contract: null,
  fields: {
    title: 'About: us',
    date: '2026-10-09',
    answer: 'no',
    order: 3,
    draft: false,
    tags: ['one', 'two'],
    intro: 'Line one\nline two',
    closing: 'Kept\n\n',
    '': 'empty key',
    null: 'a key that reads as null',
    true: 'a key that reads as true',
    '1': 'a key that reads as a number',
    links: ['one\ntwo', 'three'],
  },
  metadata: { sharing: { title: 'Share', index: true } },
  defaults: [],
  body: '# About\n\nText.\n',
  basis: { version: 2, checksum: 'abc' },
}

describe('repositoryMarkdown', () => {
  it('writes block YAML with plain keys', () => {
    const markdown = repositoryMarkdown(document)
    expect(markdown).toContain('\ntitle: "About: us"\n')
    expect(markdown).toContain('\nintro: |-\n  Line one\n  line two\n')
    expect(markdown).toContain('\ntags:\n  - "one"\n  - "two"\n')
    expect(markdown).toContain('\nmetadata:\n  sharing:\n    title: "Share"\n    index: true\n')
    expect(markdown.endsWith('---\n# About\n\nText.\n')).toBe(true)
  })

  it('reads back as the values it wrote, dates and "no" staying strings', () => {
    const parsed = matter(repositoryMarkdown(document))
    const { identity, contract, metadata, defaults, basis, ...fields } = parsed.data
    expect(fields).toEqual(document.fields)
    expect({ identity, contract, metadata, defaults, basis }).toEqual({
      identity: document.identity,
      contract: null,
      metadata: document.metadata,
      defaults: [],
      basis: document.basis,
    })
    expect(parsed.content).toBe(document.body)
  })
})
