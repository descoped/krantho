import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { collectionToJsonSchema, defineCollection } from '../src/index.js'

describe('collectionToJsonSchema', () => {
  const pageSchema = z.object({
    title: z.string(),
    category: z.enum(['draft', 'published']).default('draft'),

    tags: z.array(z.string()).optional(),
    featured: z.boolean().default(false),
    order: z.number().optional(),
  })

  const pages = defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: 'content/pages',
    schema: pageSchema,
  })

  it('returns collection name and source', () => {
    const result = collectionToJsonSchema(pages)
    expect(result.name).toBe('pages')
    expect(result.source).toBe('filesystem')
  })

  it('converts Zod schema to JSON Schema with correct types', () => {
    const result = collectionToJsonSchema(pages)
    const schema = result.schema as Record<string, unknown>
    const properties = schema['properties'] as Record<string, Record<string, unknown>>

    expect(properties['title']?.['type']).toBe('string')
    expect(properties['category']?.['type']).toBe('string')
    expect(properties['category']?.['enum']).toEqual(['draft', 'published'])
    expect(properties['featured']?.['type']).toBe('boolean')
    expect(properties['order']?.['type']).toBe('number')
  })

  it('includes defaults in JSON Schema', () => {
    const result = collectionToJsonSchema(pages)
    const schema = result.schema as Record<string, unknown>
    const properties = schema['properties'] as Record<string, Record<string, unknown>>

    expect(properties['category']?.['default']).toBe('draft')
    expect(properties['featured']?.['default']).toBe(false)
  })

  it('marks required fields correctly', () => {
    const result = collectionToJsonSchema(pages)
    const schema = result.schema as Record<string, unknown>
    const required = schema['required'] as string[]

    expect(required).toContain('title')
    // category has a default so Zod may or may not require it
    // tags and order are optional
    expect(required).not.toContain('tags')
    expect(required).not.toContain('order')
  })

  it('handles array types', () => {
    const result = collectionToJsonSchema(pages)
    const schema = result.schema as Record<string, unknown>
    const properties = schema['properties'] as Record<string, Record<string, unknown>>

    expect(properties['tags']?.['type']).toBe('array')
    const items = properties['tags']?.['items'] as Record<string, unknown>
    expect(items['type']).toBe('string')
  })
})
