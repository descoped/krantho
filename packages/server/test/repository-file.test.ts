import { repositoryFile } from '@krantho/persistence'
import {
  defineCollection,
  documentChecksum,
  parseRepositoryContent,
  resolveCollectionContract,
} from '@krantho/schema'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

/**
 * A document written as a repository file reads back as the same document, whatever its
 * strings look like to YAML, so a pulled file never reads as a change on the next deploy.
 */
const collection = defineCollection({
  name: 'pages',
  source: 'filesystem',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    eyebrow: z.string().optional(),
    tags: z.array(z.string()).optional(),
    order: z.number().optional(),
    featured: z.boolean().optional(),
  }),
  directory: '/content/pages',
})
const contract = resolveCollectionContract(collection, null)

function readBack(file: string) {
  const parsed = matter(file)
  const result = parseRepositoryContent(
    collection,
    'about',
    parsed.data,
    parsed.content,
    collection.schema,
    contract,
  )
  if (!result.success) throw new Error(result.error.message)
  return { data: result.data, status: parsed.data.status, locale: parsed.data.locale }
}

const awkward = {
  title: 'About: the "quoted" one',
  description: 'no',
  eyebrow: '2026-01-01',
  tags: ['yes', '123', 'null', '# not a comment', ' padded ', ''],
  order: 3,
  featured: true,
}

describe('repositoryFile', () => {
  it('reads back as the same document, strings that look like other YAML values included', () => {
    const file = repositoryFile({
      fields: awkward,
      body: '\nA body with a --- rule\n\n---\n\nbelow.\n',
      metadata: {},
      defaults: [],
      status: 'published',
    })
    const { data, status } = readBack(file)

    expect(data.fields).toEqual(awkward)
    expect(data.body).toBe('\nA body with a --- rule\n\n---\n\nbelow.\n')
    expect(status).toBe('published')
  })

  it('writes the same file from what it read back, so a pulled file is a fixed point', () => {
    const input = {
      fields: { ...awkward, description: 'Line one\nline two\n' },
      body: 'Body\n',
      metadata: {},
      defaults: [],
      status: 'draft',
      locale: 'nb',
      fieldOrder: ['title', 'description', 'eyebrow', 'tags', 'order', 'featured'],
    }
    const first = repositoryFile(input)
    const { data, status, locale } = readBack(first)
    const second = repositoryFile({
      fields: data.fields,
      body: data.body,
      metadata: data.metadata,
      defaults: data.defaults,
      status,
      locale,
      fieldOrder: input.fieldOrder,
    })

    expect(second).toBe(first)
    expect(documentChecksum(data)).toBe(documentChecksum({ ...data, fields: input.fields }))
  })

  it('keeps the schema order for author fields and puts the rest after, then status', () => {
    const file = repositoryFile({
      fields: { featured: true, extra: 'x', title: 'T', order: 1 },
      body: 'B\n',
      metadata: {},
      defaults: [],
      status: 'published',
      fieldOrder: ['title', 'order', 'featured'],
    })
    expect(file.split('\n').slice(0, 6)).toEqual([
      '---',
      'title: T',
      'order: 1',
      'featured: true',
      'extra: x',
      'status: published',
    ])
  })

  it('writes plain strings where YAML allows and single quotes where it does not', () => {
    const file = repositoryFile({
      fields: { title: 'About us', description: 'no', eyebrow: 'It is: here' },
      body: '',
      metadata: {},
      defaults: [],
      status: 'published',
    })
    expect(file).toContain('title: About us\n')
    expect(file).toContain("description: 'no'\n")
    expect(file).toContain("eyebrow: 'It is: here'\n")
  })

  it('leaves out locale and empty blocks, and writes the ones that hold something', () => {
    const lean = repositoryFile({
      fields: { title: 'T' },
      body: 'B',
      metadata: {},
      defaults: [],
      status: 'published',
    })
    expect(lean).toBe('---\ntitle: T\nstatus: published\n---\nB')
    const full = repositoryFile({
      fields: { title: 'T' },
      body: 'B',
      metadata: { seo: { description: 'D' } },
      defaults: [],
      status: 'published',
      locale: 'nb',
    })
    expect(full).toContain('locale: nb\n')
    expect(full).toContain('metadata:\n  seo:\n    description: D\n')
  })
})
