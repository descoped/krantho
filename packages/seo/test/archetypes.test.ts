import { describe, expect, it } from 'vitest'
import {
  aboutPageArchetype,
  blogPostArchetype,
  coursePageArchetype,
  defineArchetype,
  eventPageArchetype,
  homePageArchetype,
  howToPageArchetype,
  jobPostingPageArchetype,
  recipePageArchetype,
  servicePageArchetype,
  videoPageArchetype,
} from '../src/archetypes/index.js'
import { composeGraph } from '../src/graph/compose-graph.js'
import type { SchemaEntity, SeoGraphConfig } from '../src/graph/types.js'

const siteConfig: SeoGraphConfig = {
  domain: 'acme.example.com',
  name: 'Acme',
  language: 'en',
  baseUrl: 'https://acme.example.com',
}

describe('defineArchetype', () => {
  it('creates an archetype with schemas and default mappings', () => {
    const arch = defineArchetype({ schemas: ['LocalBusiness', 'WebSite'] })
    expect(arch.schemas).toEqual(['LocalBusiness', 'WebSite'])
    expect(arch.mappings['title']).toBe('name')
    expect(arch.mappings['description']).toBe('description')
  })

  it('merges custom mappings with defaults', () => {
    const arch = defineArchetype({
      schemas: ['Article'],
      mappings: { 'custom-field': 'headline' },
    })
    expect(arch.mappings['custom-field']).toBe('headline')
    expect(arch.mappings['title']).toBe('name') // default preserved
  })

  it('throws when no schemas provided', () => {
    expect(() => defineArchetype({ schemas: [] })).toThrow('at least one schema type')
  })

  it('accepts catalog types without dedicated builders', () => {
    // Restaurant has no registered definition — it is built from its resolved values
    const arch = defineArchetype({ schemas: ['Restaurant', 'BreadcrumbList'] })
    expect(arch.schemas).toEqual(['Restaurant', 'BreadcrumbList'])
  })

  it('accepts any current Schema.org type', () => {
    expect(defineArchetype({ schemas: ['TechArticle'] }).schemas).toEqual(['TechArticle'])
  })

  it('throws on superseded or retired Schema.org types', () => {
    expect(() => defineArchetype({ schemas: ['Code'] })).toThrow(/superseded or retired/)
  })

  it('throws on Schema.org types not in the vocabulary (typo protection)', () => {
    expect(() => defineArchetype({ schemas: ['NotARealType'] })).toThrow(/unknown Schema\.org type/)
  })

  it('throws listing all unknown types in one error', () => {
    expect(() => defineArchetype({ schemas: ['Article', 'Foo', 'Bar'] })).toThrow(/Foo, Bar/)
  })
})

describe('pre-built archetypes', () => {
  it('homePageArchetype has correct schemas', () => {
    expect(homePageArchetype.schemas).toContain('LocalBusiness')
    expect(homePageArchetype.schemas).toContain('Person')
    expect(homePageArchetype.schemas).toContain('WebSite')
  })

  it('aboutPageArchetype has correct schemas', () => {
    expect(aboutPageArchetype.schemas).toContain('Organization')
    expect(aboutPageArchetype.schemas).toContain('BreadcrumbList')
  })

  it('servicePageArchetype includes FAQPage', () => {
    expect(servicePageArchetype.schemas).toContain('FAQPage')
    expect(servicePageArchetype.schemas).toContain('Service')
  })

  it('blogPostArchetype includes Article', () => {
    expect(blogPostArchetype.schemas).toContain('Article')
    expect(blogPostArchetype.schemas).toContain('Person')
  })

  it('eventPageArchetype includes Event + BreadcrumbList + Organization', () => {
    expect(eventPageArchetype.schemas).toEqual(['Event', 'BreadcrumbList', 'Organization'])
  })

  it('recipePageArchetype includes Recipe + BreadcrumbList + Person', () => {
    expect(recipePageArchetype.schemas).toEqual(['Recipe', 'BreadcrumbList', 'Person'])
  })

  it('coursePageArchetype includes Course + BreadcrumbList + Organization', () => {
    expect(coursePageArchetype.schemas).toEqual(['Course', 'BreadcrumbList', 'Organization'])
  })

  it('jobPostingPageArchetype includes JobPosting + BreadcrumbList + Organization', () => {
    expect(jobPostingPageArchetype.schemas).toEqual([
      'JobPosting',
      'BreadcrumbList',
      'Organization',
    ])
  })

  it('howToPageArchetype includes HowTo + BreadcrumbList + Person', () => {
    expect(howToPageArchetype.schemas).toEqual(['HowTo', 'BreadcrumbList', 'Person'])
  })

  it('videoPageArchetype includes VideoObject + BreadcrumbList + Organization', () => {
    expect(videoPageArchetype.schemas).toEqual(['VideoObject', 'BreadcrumbList', 'Organization'])
  })
})

describe('composeGraph generic fallback', () => {
  it('renders catalog types without builders through the generic fallback', () => {
    const restaurantArchetype = defineArchetype({ schemas: ['Restaurant'] })
    const graph = composeGraph({
      archetype: restaurantArchetype,
      fields: {
        name: 'Acme Eatery',
        servesCuisine: 'Italian',
        priceRange: '$$',
      },
      config: siteConfig,
      path: '/locations/acme-eatery',
    })

    const restaurant = graph['@graph'].find((e) => (e as SchemaEntity)['@type'] === 'Restaurant') as
      | Record<string, unknown>
      | undefined

    expect(restaurant).toBeDefined()
    expect(restaurant?.['name']).toBe('Acme Eatery')
    expect(restaurant?.['servesCuisine']).toBe('Italian')
    expect(restaurant?.['priceRange']).toBe('$$')
    expect(restaurant?.['@id']).toBe('https://acme.example.com/locations/acme-eatery/#restaurant')
  })

  it('generic fallback derives url and mainEntityOfPage from path', () => {
    const arch = defineArchetype({ schemas: ['Restaurant'] })
    const graph = composeGraph({
      archetype: arch,
      fields: { name: 'Acme' },
      config: siteConfig,
      path: '/r/acme',
    })

    const restaurant = graph['@graph'].find((e) => (e as SchemaEntity)['@type'] === 'Restaurant') as
      | Record<string, unknown>
      | undefined

    expect(restaurant?.['url']).toBe('https://acme.example.com/r/acme')
    expect(restaurant?.['mainEntityOfPage']).toBe('https://acme.example.com/r/acme')
  })

  it('mixes builder-typed and generic-fallback entities in the same archetype', () => {
    const arch = defineArchetype({ schemas: ['Article', 'Restaurant'] })
    const graph = composeGraph({
      archetype: arch,
      fields: { title: 'Eat Here', name: 'Acme Eatery' },
      config: siteConfig,
      path: '/blog/eat-here',
    })

    const article = graph['@graph'].find((e) => (e as SchemaEntity)['@type'] === 'Article') as
      | Record<string, unknown>
      | undefined
    const restaurant = graph['@graph'].find((e) => (e as SchemaEntity)['@type'] === 'Restaurant') as
      | Record<string, unknown>
      | undefined

    // Article was built by its definition: @id uses the article-specific
    // fragment and headline is read from the title field.
    expect(article).toBeDefined()
    expect(article?.['@id']).toBe('https://acme.example.com/blog/eat-here/#article')
    expect(article?.['headline']).toBe('Eat Here')
    // No site Person or Organization to point at: the author is left out
    // rather than referring to a node the graph does not define.
    expect(article?.['author']).toBeUndefined()

    // Restaurant has no definition: @id uses the lowercased type fragment
    // and its catalog properties were taken from fields.
    expect(restaurant).toBeDefined()
    expect(restaurant?.['@id']).toBe('https://acme.example.com/blog/eat-here/#restaurant')
    expect(restaurant?.['name']).toBe('Acme Eatery')
  })
})
