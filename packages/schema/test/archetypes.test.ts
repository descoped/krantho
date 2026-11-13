import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  compileContentContract,
  defineDocumentArchetype,
  defineMetadataArchetype,
} from '../src/archetypes.js'
import { defineCollection } from '../src/collection.js'
import { validateDocument } from '../src/validate-document.js'

const editorial = defineMetadataArchetype({
  id: 'editorial',
  label: 'Editorial',
  schema: z.object({
    byline: z.string().min(1),
    reviewers: z.array(z.object({ name: z.string() })).optional(),
  }),
})
const publication = defineMetadataArchetype({
  id: 'publication',
  label: 'Publication',
  schema: z.object({ date: z.iso.date() }),
})
const website = defineDocumentArchetype({
  id: 'website',
  label: 'Website content',
  fields: z.object({ title: z.string(), summary: z.string().optional() }),
})
const blog = defineDocumentArchetype({
  id: 'blog',
  label: 'Blog post',
  fields: z.object({ title: z.string(), excerpt: z.string().optional() }),
  body: 'required',
  metadata: {
    editorial: { archetype: editorial, required: true },
    publication: { archetype: publication },
  },
})
const news = defineDocumentArchetype({
  id: 'news',
  label: 'News article',
  fields: z.object({ headline: z.string(), summary: z.string() }),
  body: 'required',
  metadata: {
    editorial: { archetype: editorial, required: true },
    publication: { archetype: publication, required: true },
    newsroom: {
      archetype: defineMetadataArchetype({
        id: 'newsroom',
        label: 'Source',
        schema: z.object({ sourceName: z.string() }),
      }),
      required: true,
    },
  },
})

describe('complete content contracts', () => {
  it('validates website, blog and news content without SEO', () => {
    expect(
      validateDocument(compileContentContract(website), {
        fields: { title: 'About' },
        metadata: {},
        body: '',
      }).success,
    ).toBe(true)
    expect(
      validateDocument(compileContentContract(blog), {
        fields: { title: 'Post' },
        metadata: { editorial: { byline: 'Author' } },
        body: 'Content',
      }).success,
    ).toBe(true)
    expect(
      validateDocument(compileContentContract(news), {
        fields: { headline: 'News', summary: 'Summary' },
        metadata: {
          editorial: { byline: 'Reporter' },
          publication: { date: '2026-10-08' },
          newsroom: { sourceName: 'Council' },
        },
        body: 'Report',
      }).success,
    ).toBe(true)
  })
  it('binds reusable archetypes to collections', () => {
    const collection = defineCollection({ name: 'posts', source: 'database', archetype: blog })
    expect(collection.schema).toBe(blog.fields)
    expect(collection.archetype.id).toBe('blog')
  })
  it('rejects unknown fields, slots and nested properties without dropping them', () => {
    for (const values of [
      { fields: { title: 'Post', custom: 'keep me' }, metadata: { editorial: { byline: 'A' } } },
      {
        fields: { title: 'Post' },
        metadata: { editorial: { byline: 'A' }, other: { text: 'keep me' } },
      },
      {
        fields: { title: 'Post' },
        metadata: { editorial: { byline: 'A', reviewers: [{ name: 'B', extra: true }] } },
      },
    ])
      expect(
        validateDocument(compileContentContract(blog), { ...values, body: 'Text' }).success,
      ).toBe(false)
  })
  it('requires complete optional groups when present', () => {
    const result = validateDocument(compileContentContract(blog), {
      fields: { title: 'Post' },
      metadata: { editorial: { byline: 'A' }, publication: {} },
      body: 'Text',
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues[0]?.path).toEqual(['metadata', 'publication', 'date'])
  })
  it('keeps exact archived definitions usable after code changes', () => {
    const old = JSON.parse(JSON.stringify(compileContentContract(website)))
    const changed = compileContentContract(
      defineDocumentArchetype({
        ...website,
        fields: z.object({ title: z.string(), summary: z.string() }),
      }),
    )
    const values = { fields: { title: 'Page' }, metadata: {}, body: '' }
    expect(validateDocument(old, values).success).toBe(true)
    expect(validateDocument(changed, values).success).toBe(false)
    expect(old.revision).not.toBe(changed.revision)
  })
  it('canonicalizes property order but retains changes in constraints', () => {
    const a = defineDocumentArchetype({
      id: 'ordered',
      label: 'Ordered',
      fields: z.object({ a: z.string().optional(), b: z.number().optional() }),
    })
    const b = defineDocumentArchetype({
      ...a,
      fields: z.object({ b: z.number().optional(), a: z.string().optional() }),
    })
    expect(compileContentContract(a).revision).toBe(compileContentContract(b).revision)
  })
  it('keeps the revision when only a label changes', () => {
    const renamed = defineDocumentArchetype({
      ...blog,
      label: 'Article',
      metadata: {
        ...blog.metadata,
        editorial: {
          archetype: defineMetadataArchetype({ ...editorial, label: 'Byline' }),
          required: true,
        },
      },
    })
    const before = compileContentContract(blog)
    const after = compileContentContract(renamed)
    expect(after.label).toBe('Article')
    expect(after.metadata.editorial?.label).toBe('Byline')
    expect(after.revision).toBe(before.revision)
    expect(after.metadata.editorial?.revision).toBe(before.metadata.editorial?.revision)
  })

  it('rejects editable publication state', () => {
    expect(() =>
      defineDocumentArchetype({
        id: 'bad',
        label: 'Bad',
        fields: z.object({ status: z.string() }),
      }),
    ).toThrow('reserved')
  })
  it('enforces body policies', () => {
    const values = { fields: { title: 'Page' }, metadata: {}, body: ' ' }
    const required = compileContentContract(
      defineDocumentArchetype({ ...website, body: 'required' }),
    )
    const none = compileContentContract(defineDocumentArchetype({ ...website, body: 'none' }))
    expect(validateDocument(required, values).success).toBe(false)
    expect(validateDocument(none, values).success).toBe(false)
  })
})
