import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { compileContentContract } from '../src/archetypes.js'
import { blogContent, publicationMetadata } from '../src/content-archetypes.js'
import { validateDocument } from '../src/validate-document.js'

describe('publication metadata', () => {
  const schema = publicationMetadata.schema

  it('keeps the date as a UTC date-time with a Z', () => {
    expect(schema.safeParse({ date: '2026-10-10T09:30:00Z' }).success).toBe(true)
    expect(
      (z.toJSONSchema(schema).properties as Record<string, { format?: string }>).date?.format,
    ).toBe('date-time')
  })

  it('refuses a date alone and a time zone offset', () => {
    expect(schema.safeParse({ date: '2026-10-10' }).success).toBe(false)
    expect(schema.safeParse({ date: '2026-10-10T11:30:00+02:00' }).success).toBe(false)
  })
})

describe('a document saved with a date written alone', () => {
  const contract = compileContentContract(blogContent)
  const save = (date: string) =>
    validateDocument(contract, {
      fields: { title: 'Post' },
      metadata: { editorial: { byline: 'Author' }, publication: { date } },
      body: 'Content',
    })

  it('is stored as midnight UTC', () => {
    const result = save('2026-10-10')
    expect(result.success).toBe(true)
    expect(result.data?.metadata.publication).toEqual({ date: '2026-10-10T00:00:00Z' })
  })

  it('is stored as UTC when written with an offset', () => {
    expect(save('2026-10-10T11:30:00+02:00').data?.metadata.publication).toEqual({
      date: '2026-10-10T09:30:00Z',
    })
  })

  it('is refused when it is not a moment', () => {
    expect(save('soon').success).toBe(false)
  })
})
