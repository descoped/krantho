import { describe, expect, it } from 'vitest'
import { defineArchetype } from '../src/archetypes/define-archetype.js'
import {
  blogPostArchetype,
  homePageArchetype,
  servicePageArchetype,
} from '../src/archetypes/presets.js'
import { composeFromConfig } from '../src/graph/compose-from-config.js'
import { composeGraph } from '../src/graph/compose-graph.js'
import { resolveEffectiveConfig } from '../src/graph/effective-config.js'
import type { SchemaEntity, SeoGraphConfig } from '../src/graph/types.js'

const siteConfig: SeoGraphConfig = {
  domain: 'acme.example.com',
  name: 'Acme Consulting',
  language: 'en',
  baseUrl: 'https://acme.example.com',
}

describe('composeGraph', () => {
  it('produces valid @context and @graph', () => {
    const graph = composeGraph({
      archetype: homePageArchetype,
      fields: { title: 'Home', description: 'Welcome' },
      config: siteConfig,
      path: '/',
    })

    expect(graph['@context']).toBe('https://schema.org')
    expect(graph['@graph']).toBeInstanceOf(Array)
    // One node per archetype type, and the page node
    expect(graph['@graph'].length).toBe(homePageArchetype.schemas.length + 1)
    expect(graph['@graph'].map((node) => node['@type'])).toContain('WebPage')
  })

  it('generates correct entity types for home page', () => {
    const graph = composeGraph({
      archetype: homePageArchetype,
      fields: { title: 'Home' },
      config: siteConfig,
      path: '/',
    })

    const types = graph['@graph'].map((e) => (e as Record<string, unknown>)['@type'])
    expect(types).toContain('LocalBusiness')
    expect(types).toContain('Person')
    expect(types).toContain('WebSite')
  })

  it('generates Article with @id references for blog post', () => {
    const graph = composeGraph({
      archetype: blogPostArchetype,
      fields: {
        title: 'My Post',
        date: '2026-03-15',
        author: 'John Doe',
        excerpt: 'A great post',
      },
      config: siteConfig,
      path: '/blog/my-post',
    })

    const article = graph['@graph'].find(
      (e) => (e as Record<string, unknown>)['@type'] === 'Article',
    ) as Record<string, unknown> | undefined

    expect(article).toBeDefined()
    expect(article?.headline).toBe('My Post')
    expect(article?.datePublished).toBe('2026-03-15')
    // The content names the author, so it wins over the site's Person
    expect(article?.author).toEqual({ '@type': 'Person', name: 'John Doe' })
  })

  it('generates BreadcrumbList from the trail the page renders', () => {
    const graph = composeGraph({
      archetype: servicePageArchetype,
      fields: { title: 'Services' },
      config: siteConfig,
      path: '/services',
      structure: {
        trail: [
          { name: 'Home', url: 'https://acme.example.com' },
          { name: 'Services', url: 'https://acme.example.com/services' },
        ],
      },
    })

    const breadcrumb = graph['@graph'].find(
      (e) => (e as Record<string, unknown>)['@type'] === 'BreadcrumbList',
    ) as Record<string, unknown> | undefined

    expect(breadcrumb).toBeDefined()
    const items = breadcrumb?.itemListElement as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect(items[0]?.position).toBe(1)
    expect(items[1]?.position).toBe(2)
  })

  it('generates FAQPage from provided FAQ data', () => {
    const graph = composeGraph({
      archetype: servicePageArchetype,
      fields: { title: 'Services' },
      config: siteConfig,
      path: '/services',
      faq: [
        { question: 'What do you offer?', answer: 'Consulting services.' },
        { question: 'How much?', answer: 'Contact us for pricing.' },
      ],
    })

    const faqPage = graph['@graph'].find(
      (e) => (e as Record<string, unknown>)['@type'] === 'FAQPage',
    ) as Record<string, unknown> | undefined

    expect(faqPage).toBeDefined()
    const mainEntity = faqPage?.mainEntity as Array<Record<string, unknown>>
    expect(mainEntity).toHaveLength(2)
    expect(mainEntity[0]?.name).toBe('What do you offer?')
  })

  it('uses @id conventions for cross-references', () => {
    const graph = composeGraph({
      archetype: homePageArchetype,
      fields: {},
      config: siteConfig,
      path: '/',
    })

    const business = graph['@graph'].find(
      (e) => (e as Record<string, unknown>)['@type'] === 'LocalBusiness',
    ) as Record<string, unknown> | undefined

    const website = graph['@graph'].find(
      (e) => (e as Record<string, unknown>)['@type'] === 'WebSite',
    ) as Record<string, unknown> | undefined

    expect(business?.['@id']).toBe('https://acme.example.com/#business')
    expect(website?.['@id']).toBe('https://acme.example.com/#website')
    expect((website?.publisher as Record<string, unknown> | undefined)?.['@id']).toBe(
      'https://acme.example.com/#business',
    )
  })
})

describe('composeFromConfig — generic site-level @id', () => {
  function findEntity(
    graph: ReturnType<typeof composeFromConfig>,
    type: string,
  ): Record<string, unknown> | undefined {
    return graph['@graph'].find((e) => (e as SchemaEntity)['@type'] === type) as
      | Record<string, unknown>
      | undefined
  }

  it('uses businessId for generic site-level types so cross-references resolve', () => {
    // ProfessionalService is NOT in the builder registry — it goes through
    // the generic fallback path. Its @id must still be #business so that
    // document-level entities referencing businessId() (Service.provider,
    // WebSite.publisher, Event.organizer, etc.) resolve correctly.
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Service', properties: { name: 'Strategic Consulting' } }],
      },
      fields: {},
      siteConfig,
      path: '/services/strategy',
      siteLevel: {
        entities: [{ '@type': 'ProfessionalService', properties: { name: 'Acme Consulting' } }],
      },
    })

    const business = findEntity(graph, 'ProfessionalService')
    expect(business).toBeDefined()
    expect(business?.['@id']).toBe('https://acme.example.com/#business')

    // The Service entity's provider reference should point to the same @id
    const service = findEntity(graph, 'Service')
    expect(service).toBeDefined()
    expect((service?.provider as Record<string, unknown>)?.['@id']).toBe(
      'https://acme.example.com/#business',
    )
  })

  it('applies businessId to any non-builder site-level type', () => {
    const graph = composeFromConfig({
      config: {
        entities: [],
      },
      fields: {},
      siteConfig,
      path: '/',
      siteLevel: {
        entities: [{ '@type': 'Restaurant', properties: { name: 'Chez Acme' } }],
      },
    })

    const restaurant = findEntity(graph, 'Restaurant')
    expect(restaurant).toBeDefined()
    expect(restaurant?.['@id']).toBe('https://acme.example.com/#business')
    expect(restaurant?.name).toBe('Chez Acme')
  })
})

describe('resolveEffectiveConfig — entity ordering', () => {
  it('preserves entity order from the first scope that introduces each entity', () => {
    const effective = resolveEffectiveConfig({
      collection: {
        entities: [
          { '@type': 'Article', properties: { headline: 'Collection' } },
          { '@type': 'Person', properties: {} },
        ],
      },
      document: {
        entities: [
          { '@type': 'Person', properties: { name: 'Override' } },
          { '@type': 'Article', properties: { headline: 'Document' } },
        ],
      },
    })

    // Collection introduced [Article, Person] first — that order is preserved.
    // Document scope overrides properties but does not reorder.
    expect(effective.entities.map((e) => e['@type'])).toEqual(['Article', 'Person'])
    expect(effective.entities[0]?.properties.headline).toBe('Document')
    expect(effective.entities[1]?.properties.name).toBe('Override')
  })

  it('includes entities unique to more-specific scopes at the end', () => {
    const effective = resolveEffectiveConfig({
      collection: {
        entities: [{ '@type': 'Article', properties: {} }],
      },
      document: {
        entities: [
          { '@type': 'Article', properties: { headline: 'Override' } },
          { '@type': 'BreadcrumbList', properties: {} },
        ],
      },
    })

    expect(effective.entities.map((e) => e['@type'])).toEqual(['Article', 'BreadcrumbList'])
    expect(effective.entities[0]?.properties.headline).toBe('Override')
  })
})

describe('composeFromConfig — privacy of version history', () => {
  // Persistence hands the composer its full version metadata, editor identity included.
  const versionMeta = {
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z',
    locale: 'en',
    changedBy: 'editor:jane.editor@example.com',
    version: 3,
  }

  function types(graph: ReturnType<typeof composeFromConfig>): Record<string, SchemaEntity> {
    return Object.fromEntries(graph['@graph'].map((e) => [e['@type'], e]))
  }

  it("never puts the last editor's identity into the graph", () => {
    const graph = composeFromConfig({
      config: {
        entities: [
          { '@type': 'Article', properties: {} },
          { '@type': 'Person', properties: {} },
          { '@type': 'BlogPosting', properties: {} },
          { '@type': 'MedicalEntity', properties: {} },
        ],
      },
      fields: { title: 'Post', description: 'A post' },
      siteConfig,
      path: '/blog/post',
      documentMeta: versionMeta,
    })

    expect(JSON.stringify(graph)).not.toContain('jane.editor@example.com')
    const byType = types(graph)
    expect(byType.BlogPosting?.author).toBeUndefined()
    expect(byType.MedicalEntity?.author).toBeUndefined()
    expect(byType.Person?.name).toBe('Acme Consulting')
  })

  it('takes an author from the content fields', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'BlogPosting', properties: {} }] },
      fields: { title: 'Post', author: 'Jane Writer' },
      siteConfig,
      path: '/blog/post',
      documentMeta: versionMeta,
    })

    expect(types(graph).BlogPosting?.author).toBe('Jane Writer')
  })
})

describe('composeFromConfig — entities without a dedicated builder', () => {
  const documentMeta = {
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z',
    locale: 'en',
    version: 1,
  }

  function entity(graph: ReturnType<typeof composeFromConfig>, type: string): SchemaEntity {
    const found = graph['@graph'].find((e) => e['@type'] === type)
    if (!found) throw new Error(`no ${type} entity`)
    return found
  }

  it('keeps the catalog properties and the computed ones, and drops other fields', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'WebPage', properties: {} }] },
      fields: {
        title: 'Pricing',
        'meta-description': 'What it costs',
        description: 'Plans and prices',
        status: 'published',
        order: 3,
        body: 'Internal draft notes',
        'team-contact': 'sales@example.com',
      },
      siteConfig,
      path: '/pricing',
      documentMeta,
    })

    expect(entity(graph, 'WebPage')).toEqual({
      '@type': 'WebPage',
      '@id': 'https://acme.example.com/pricing/#webpage',
      name: 'Pricing',
      description: 'What it costs',
      url: 'https://acme.example.com/pricing',
      mainEntityOfPage: 'https://acme.example.com/pricing',
      datePublished: '2026-01-02T00:00:00.000Z',
      dateModified: '2026-03-04T00:00:00.000Z',
      inLanguage: 'en',
    })
  })

  it('keeps type-specific catalog properties set by fields', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'Restaurant', properties: {} }] },
      fields: { title: 'Chez Acme', servesCuisine: 'French', priceRange: '$$', order: 1 },
      siteConfig,
      path: '/restaurants/chez-acme',
    })

    const restaurant = entity(graph, 'Restaurant')
    expect(restaurant.name).toBe('Chez Acme')
    expect(restaurant.servesCuisine).toBe('French')
    expect(restaurant.priceRange).toBe('$$')
    expect(restaurant.order).toBeUndefined()
    expect(restaurant.title).toBeUndefined()
  })

  it('keeps configured properties and mappings even when the catalog does not list them', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'WebPage', properties: { keywords: 'pricing, plans' } }],
        fieldMappings: { 'WebPage.about': 'topic', audience: 'segment' },
      },
      fields: { title: 'Pricing', topic: 'Plans', segment: 'Teams' },
      siteConfig,
      path: '/pricing',
    })

    const page = entity(graph, 'WebPage')
    expect(page.keywords).toBe('pricing, plans')
    expect(page.about).toBe('Plans')
    expect(page.audience).toBe('Teams')
    expect(page.topic).toBeUndefined()
    expect(page.segment).toBeUndefined()
  })

  it('keeps only properties the vocabulary defines for a type the catalog does not list', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'MedicalEntity', properties: {} }] },
      fields: { title: 'Condition', keywords: 'health', status: 'draft', internalCode: 'X-1' },
      siteConfig,
      path: '/conditions/x',
    })

    expect(entity(graph, 'MedicalEntity')).toEqual({
      '@type': 'MedicalEntity',
      '@id': 'https://acme.example.com/conditions/x/#medicalentity',
      name: 'Condition',
      url: 'https://acme.example.com/conditions/x',
      mainEntityOfPage: 'https://acme.example.com/conditions/x',
    })
  })

  it('carries the page values a definition leaves out', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'Service', properties: {} }] },
      siteLevel: { entities: [{ '@type': 'Organization', properties: {} }] },
      fields: { title: 'Consulting', description: 'Advice', status: 'published' },
      siteConfig,
      path: '/services/consulting',
      documentMeta,
    })

    expect(entity(graph, 'Service')).toEqual({
      '@type': 'Service',
      '@id': 'https://acme.example.com/services/consulting/#service',
      name: 'Consulting',
      description: 'Advice',
      provider: { '@id': 'https://acme.example.com/#business' },
      url: 'https://acme.example.com/services/consulting',
      mainEntityOfPage: 'https://acme.example.com/services/consulting',
    })
  })
})

describe('composeGraph — entities without a dedicated builder', () => {
  it('drops fields the type does not define', () => {
    const graph = composeGraph({
      archetype: defineArchetype({ schemas: ['WebPage'] }),
      fields: { title: 'About', status: 'published', order: 2, body: 'Text' },
      config: siteConfig,
      path: '/about',
    })

    expect(graph['@graph'][0]).toEqual({
      '@type': 'WebPage',
      '@id': 'https://acme.example.com/about/#webpage',
      name: 'About',
      url: 'https://acme.example.com/about',
      mainEntityOfPage: 'https://acme.example.com/about',
      inLanguage: 'en',
    })
  })
})
