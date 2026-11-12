import type { IPersistenceAdapter } from '@krantho/persistence'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCollection } from '../src/collection.js'
import { defineConfig } from '../src/config.js'
import { ContentValidationError } from '../src/errors.js'
import { validateAllContent, validateFields } from '../src/validate-content.js'

// Minimal mock adapter for testing
function createMockAdapter(files: Record<string, string>): IPersistenceAdapter {
  return {
    async exists(slug: string): Promise<boolean> {
      return `${slug}.md` in files || slug in files
    },
    async read(slug: string): Promise<string> {
      const key = `${slug}.md` in files ? `${slug}.md` : slug
      const content = files[key]
      if (content === undefined) throw new Error(`Not found: ${slug}`)
      return content
    },
    async getMetadata(slug: string) {
      return { size: 100, lastModified: new Date() }
    },
    async listSlugs(): Promise<string[]> {
      return Object.keys(files).map((f) => f.replace(/\.md$/, ''))
    },
  }
}

describe('validateFields', () => {
  const collection = defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: 'content/pages',
    schema: z.object({
      title: z.string(),
      category: z.enum(['draft', 'published']).default('draft'),
      description: z.string(),
    }),
  })

  it('returns empty array for valid fields', () => {
    const errors = validateFields({ title: 'Home', description: 'Welcome' }, collection, 'home')
    expect(errors).toHaveLength(0)
  })

  it('returns errors for missing required fields', () => {
    const errors = validateFields({}, collection, 'home')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.collection).toBe('pages')
    expect(errors[0]?.slug).toBe('home')
  })

  it('returns errors for invalid enum values', () => {
    const errors = validateFields(
      { title: 'Home', description: 'Welcome', category: 'archived' },
      collection,
      'home',
    )
    expect(errors.length).toBeGreaterThan(0)
    const categoryError = errors.find((e) => e.field === 'category')
    expect(categoryError).toBeDefined()
  })

  it('applies defaults for missing optional fields', () => {
    const errors = validateFields({ title: 'Home', description: 'Welcome' }, collection, 'home')
    expect(errors).toHaveLength(0)
  })
})

describe('validateAllContent', () => {
  const pages = defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: 'content/pages',
    schema: z.object({
      title: z.string(),
    }),
  })

  it('validates all content and returns summary', async () => {
    const adapter = createMockAdapter({
      'home.md': '---\ntitle: Home\n---\n# Hello',
      'about.md': '---\ntitle: About\n---\n# About us',
    })

    const config = defineConfig({ collections: { pages } })
    const result = await validateAllContent(config, adapter, { mode: 'warn' })

    expect(result.valid).toBe(true)
    expect(result.summary.total).toBe(2)
    expect(result.summary.valid).toBe(2)
    expect(result.summary.invalid).toBe(0)
  })

  it('collects errors in warn mode', async () => {
    const adapter = createMockAdapter({
      'home.md': '---\ntitle: Home\n---\n# Hello',
      'broken.md': '---\ncategory: archived\n---\n# Broken',
    })

    const config = defineConfig({ collections: { pages } })
    const result = await validateAllContent(config, adapter, { mode: 'warn' })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.summary.invalid).toBe(1)
  })

  it('throws ContentValidationError in strict mode', async () => {
    const adapter = createMockAdapter({
      'broken.md': '---\ncategory: archived\n---\n# Broken',
    })

    const config = defineConfig({ collections: { pages } })

    await expect(validateAllContent(config, adapter, { mode: 'strict' })).rejects.toThrow(
      ContentValidationError,
    )
  })

  it('skips database-mastered collections', async () => {
    const blog = defineCollection({
      name: 'blog',
      source: 'database',
      schema: z.object({ title: z.string() }),
    })

    const adapter = createMockAdapter({})
    const config = defineConfig({ collections: { pages, blog } })
    const result = await validateAllContent(config, adapter, { mode: 'warn' })

    // Only filesystem collections are validated — adapter has no files
    expect(result.summary.total).toBe(0)
  })
})
