import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineDocumentArchetype, defineMetadataArchetype } from '../src/archetypes.js'
import { defineCollection } from '../src/collection.js'
import { defineConfig } from '../src/config.js'

describe('defineConfig', () => {
  const pages = defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: 'content/pages',
    schema: z.object({
      title: z.string(),
    }),
  })

  const blog = defineCollection({
    name: 'blog',
    source: 'database',
    schema: z.object({
      title: z.string(),
      date: z.string().datetime(),
    }),
  })

  it('creates config with collections map', () => {
    const config = defineConfig({ collections: { pages, blog } })

    expect(config.collections.size).toBe(2)
    expect(config.collections.get('pages')).toBe(pages)
    expect(config.collections.get('blog')).toBe(blog)
  })

  it('throws when no collections provided', () => {
    expect(() => defineConfig({ collections: {} })).toThrow(
      'defineConfig requires at least one collection',
    )
  })

  it('throws when key does not match collection name', () => {
    expect(() =>
      defineConfig({
        collections: { wrongKey: pages },
      }),
    ).toThrow('Collection key "wrongKey" does not match collection name "pages"')
  })
})

it('rejects incompatible reuse of a metadata identity across collection archetypes', () => {
  const binding = (name: string, value: z.ZodType) =>
    defineCollection({
      name,
      source: 'database',
      archetype: defineDocumentArchetype({
        id: `site/${name}`,
        label: name,
        fields: z.object({ title: z.string() }),
        metadata: {
          editorial: {
            archetype: defineMetadataArchetype({
              id: 'site/editorial',
              label: 'Editorial',
              schema: z.object({ byline: value }),
            }),
          },
        },
      }),
    })
  expect(() =>
    defineConfig({
      collections: {
        pages: binding('pages', z.string()),
        news: binding('news', z.number()),
      },
    }),
  ).toThrow('incompatible definitions')
})
