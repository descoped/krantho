import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCollection } from '../src/collection.js'

describe('defineCollection', () => {
  const pageSchema = z.object({
    title: z.string(),
    category: z.enum(['draft', 'published']).default('published'),
    description: z.string(),
  })

  it('creates a filesystem collection with required properties', () => {
    const pages = defineCollection({
      name: 'pages',
      source: 'filesystem',
      directory: 'content/pages',
      schema: pageSchema,
    })

    expect(pages.name).toBe('pages')
    expect(pages.source).toBe('filesystem')
    expect(pages.directory).toBe('content/pages')
    expect(pages.schema).toBe(pageSchema)
  })

  it('creates a database collection without directory', () => {
    const blogSchema = z.object({
      title: z.string(),
      date: z.string().datetime(),
    })

    const blog = defineCollection({
      name: 'blog',
      source: 'database',
      schema: blogSchema,
    })

    expect(blog.name).toBe('blog')
    expect(blog.source).toBe('database')
    expect(blog.directory).toBeUndefined()
  })

  it('throws when name is empty', () => {
    expect(() =>
      defineCollection({
        name: '',
        source: 'filesystem',
        directory: 'content/pages',
        schema: pageSchema,
      }),
    ).toThrow('Collection name is required')
  })

  it('reads a named index file, which must be a markdown file in the directory', () => {
    const docs = (indexFile: string) =>
      defineCollection({
        name: 'docs',
        source: 'filesystem',
        directory: 'docs',
        indexFile,
        schema: pageSchema,
      })

    expect(docs('README.md').indexFile).toBe('README.md')
    expect(() => docs('README.txt')).toThrow('must be a .md file name in its directory')
    expect(() => docs('sub/README.md')).toThrow('must be a .md file name in its directory')
  })

  it('throws when filesystem source has no directory', () => {
    expect(() =>
      defineCollection({
        name: 'pages',
        source: 'filesystem',
        schema: pageSchema,
      }),
    ).toThrow('requires a "directory" property')
  })

  it('leaves the page path undeclared by default', () => {
    const pages = defineCollection({
      name: 'pages',
      source: 'filesystem',
      directory: 'content/pages',
      schema: pageSchema,
    })

    expect(pages.path).toBeUndefined()
  })

  it('carries a declared page path: a pattern, a fixed path, or no pages', () => {
    const define = (path: string | false) =>
      defineCollection({ name: 'hosts', source: 'database', schema: pageSchema, path })

    expect(define('/deploy/:slug').path).toBe('/deploy/:slug')
    expect(define('/').path).toBe('/')
    expect(define(false).path).toBe(false)
  })

  it('throws when a page path does not start with a slash', () => {
    expect(() =>
      defineCollection({
        name: 'hosts',
        source: 'database',
        schema: pageSchema,
        path: 'deploy/:slug',
      }),
    ).toThrow('must start with "/"')
  })

  it('preserves the Zod schema for type inference', () => {
    const collection = defineCollection({
      name: 'pages',
      source: 'filesystem',
      directory: 'content/pages',
      schema: pageSchema,
    })

    // Validate that the schema works for parsing
    const result = collection.schema.safeParse({
      title: 'Home',
      description: 'Welcome',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('published') // default applied
    }
  })
})

describe('designed sections', () => {
  const schema = z.object({ title: z.string() })

  it('lists the sections the page template designs, in order', () => {
    const features = defineCollection({
      name: 'features',
      source: 'database',
      schema,
      sections: ['Problem', ' Approach ', 'Proof', 'Limits'],
    })
    expect(features.sections).toEqual(['Problem', 'Approach', 'Proof', 'Limits'])
  })

  it('designs none when the collection names none', () => {
    expect(defineCollection({ name: 'pages', source: 'database', schema }).sections).toEqual([])
  })

  it('refuses a section listed twice', () => {
    expect(() =>
      defineCollection({ name: 'x', source: 'database', schema, sections: ['Proof', 'proof'] }),
    ).toThrow('lists section "proof" twice')
  })

  it('refuses an empty section name', () => {
    expect(() =>
      defineCollection({ name: 'x', source: 'database', schema, sections: ['  '] }),
    ).toThrow('empty section name')
  })
})
