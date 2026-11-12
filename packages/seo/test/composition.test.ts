import type { SeoConfigData } from '@krantho/seo-shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { SchemaEntity, SeoGraphConfig } from '../src/graph/index.js'
import { composeFromConfig } from '../src/graph/index.js'
import { resolveProperties } from '../src/graph/resolve-properties.js'
import { typedValue } from '../src/graph/typed-value.js'
import { getTypeDefinition, registeredTypes, registerType } from '../src/types/index.js'
import type { Finding } from '../src/validate/index.js'
import { validateGraph } from '../src/validate/index.js'

const SITE: SeoGraphConfig = {
  domain: 'example.org',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.org',
  logo: 'https://example.org/logo.png',
  description: 'Example builds things.',
  sameAs: ['https://github.com/example'],
}

const META = {
  createdAt: '2026-09-01T08:00:00Z',
  updatedAt: '2026-09-20T12:00:00Z',
  locale: 'nb',
  version: 2,
}

function compose(options: {
  site?: SeoConfigData | null
  type?: string
  fields?: Record<string, unknown>
  properties?: Record<string, unknown>
  findings?: Finding[]
}): SchemaEntity[] {
  return composeFromConfig({
    config: {
      entities: [{ '@type': options.type ?? 'Article', properties: options.properties ?? {} }],
    },
    fields: options.fields ?? { title: 'Post', image: 'https://example.org/post.png' },
    siteConfig: SITE,
    path: '/blog/post',
    siteLevel: options.site ?? null,
    documentMeta: META,
    onFinding: (finding) => options.findings?.push(finding),
  })['@graph']
}

function byType(graph: SchemaEntity[], type: string): SchemaEntity | undefined {
  return graph.find((entity) => entity['@type'] === type)
}

const ORGANIZATION = { '@type': 'Organization', properties: {} }
const PERSON = { '@type': 'Person', properties: { name: 'Ada' } }
const WEBSITE = { '@type': 'WebSite', properties: {} }

describe('reference resolution', () => {
  it('should point the author at the site Person', () => {
    const graph = compose({ site: { entities: [ORGANIZATION, PERSON] } })
    expect(byType(graph, 'Article')?.['author']).toEqual({ '@id': 'https://example.org/#person' })
  })

  it('should make the publishing Organization the author when no Person is configured', () => {
    const graph = compose({ site: { entities: [ORGANIZATION, WEBSITE] } })
    const article = byType(graph, 'Article')
    expect(article?.['author']).toEqual({ '@id': 'https://example.org/#business' })
    expect(article?.['publisher']).toEqual({ '@id': 'https://example.org/#business' })
    expect(article?.['isPartOf']).toEqual({ '@id': 'https://example.org/#website' })
    expect(validateGraph({ '@context': 'https://schema.org', '@graph': graph })).toEqual([])
  })

  it('should point at a configured subtype of the wanted type', () => {
    const graph = compose({
      site: { entities: [{ '@type': 'ProfessionalService', properties: {} }] },
    })
    expect(byType(graph, 'Article')?.['author']).toEqual({ '@id': 'https://example.org/#business' })
  })

  it('should leave out what nothing in the site configuration can satisfy, with a finding', () => {
    const findings: Finding[] = []
    const article = byType(compose({ findings }), 'Article')
    expect(article?.['author']).toBeUndefined()
    expect(article?.['publisher']).toBeUndefined()
    expect(article?.['isPartOf']).toBeUndefined()
    expect(findings.map((f) => [f.code, f.property])).toEqual([
      ['unresolved-reference', 'author'],
      ['unresolved-reference', 'publisher'],
      ['unresolved-reference', 'isPartOf'],
    ])
    expect(findings.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('should keep an author the content names', () => {
    const graph = compose({
      site: { entities: [ORGANIZATION] },
      fields: { title: 'Post', author: 'Grace' },
    })
    expect(byType(graph, 'Article')?.['author']).toEqual({ '@type': 'Person', name: 'Grace' })
  })

  it('should leave configured references as set', () => {
    const graph = compose({ properties: { about: { '@id': 'https://example.org/#topic' } } })
    expect(byType(graph, 'Article')?.['about']).toEqual({ '@id': 'https://example.org/#topic' })
  })
})

describe('values a builder does not list', () => {
  it('should carry dateModified, image and the page language onto an Article', () => {
    const article = byType(compose({ site: { entities: [ORGANIZATION] } }), 'Article')
    expect(article?.['dateModified']).toBe('2026-09-20T12:00:00Z')
    expect(article?.['datePublished']).toBe('2026-09-01T08:00:00Z')
    expect(article?.['image']).toBe('https://example.org/post.png')
    expect(article?.['inLanguage']).toBe('nb')
  })

  it("should carry the site's identity onto its Organization", () => {
    const organization = byType(compose({ site: { entities: [ORGANIZATION] } }), 'Organization')
    expect(organization).toEqual({
      '@type': 'Organization',
      '@id': 'https://example.org/#business',
      name: 'Example',
      url: 'https://example.org',
      logo: 'https://example.org/logo.png',
      description: 'Example builds things.',
      sameAs: ['https://github.com/example'],
    })
  })

  it('should let the SEO settings override the site identity', () => {
    const site = {
      entities: [{ '@type': 'Organization', properties: { logo: 'https://example.org/alt.png' } }],
    }
    expect(byType(compose({ site }), 'Organization')?.['logo']).toBe('https://example.org/alt.png')
  })

  it('should not give a document entity the site identity', () => {
    const restaurant = byType(
      compose({ type: 'Restaurant', fields: { title: 'Chez Acme' } }),
      'Restaurant',
    )
    expect(restaurant?.['name']).toBe('Chez Acme')
    expect(restaurant?.['logo']).toBeUndefined()
  })
})

describe('resolveProperties', () => {
  const inputs = {
    type: 'Article',
    level: 'document' as const,
    configured: {},
    fields: {},
    computed: { url: 'https://example.org/p', dateModified: '2026-09-20' },
    site: SITE,
  }

  it('should take a value from one source in a fixed order', () => {
    const resolved = resolveProperties({
      ...inputs,
      configured: { headline: 'From settings' },
      fields: { title: 'From content', 'modified-date': '2026-10-01' },
    })
    expect(resolved.get('headline')).toEqual({
      value: 'From settings',
      source: 'manual',
      origin: 'the SEO settings',
    })
    expect(resolved.get('dateModified')).toEqual({
      value: '2026-10-01',
      source: 'auto',
      origin: 'the content field "modified-date"',
    })
    expect(resolved.get('url')).toEqual({
      value: 'https://example.org/p',
      source: 'computed',
      origin: "the page's path",
    })
    expect(resolved.get('inLanguage')).toEqual({
      value: 'en',
      source: 'site',
      origin: 'site.language',
    })
  })

  it('should prefer meta-description over description, and an explicit mapping over both', () => {
    const fields = { description: 'Plain', 'meta-description': 'Meta', summary: 'Mapped' }
    expect(resolveProperties({ ...inputs, fields }).get('description')?.value).toBe('Meta')
    const mapped = resolveProperties({
      ...inputs,
      fields,
      fieldMappings: { 'Article.description': 'summary' },
    })
    expect(mapped.get('description')?.value).toBe('Mapped')
  })

  it('should give a site entity no value from page content', () => {
    const resolved = resolveProperties({
      ...inputs,
      type: 'Organization',
      level: 'site',
      fields: { title: 'Page' },
    })
    expect(resolved.get('name')).toEqual({ value: 'Example', source: 'site', origin: 'site.name' })
    expect(resolved.has('dateModified')).toBe(false)
  })
})

describe('typedValue', () => {
  it('should type a node given without one', () => {
    expect(typedValue('offers', { price: '10' })).toEqual({ '@type': 'Offer', price: '10' })
    expect(typedValue('address', { addressLocality: 'Oslo' })).toEqual({
      '@type': 'PostalAddress',
      addressLocality: 'Oslo',
    })
    expect(typedValue('offers', [{ price: '1' }])).toEqual([{ '@type': 'Offer', price: '1' }])
  })

  it('should leave typed nodes, references and literals as they are', () => {
    expect(typedValue('offers', { '@type': 'AggregateOffer' })).toEqual({
      '@type': 'AggregateOffer',
    })
    expect(typedValue('author', { '@id': 'x' })).toEqual({ '@id': 'x' })
    expect(typedValue('name', 'Text')).toBe('Text')
  })
})

describe('type registry', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it('should register the built-in types', () => {
    expect(registeredTypes()).toEqual(expect.arrayContaining(['Article', 'Organization', 'Event']))
    expect(getTypeDefinition('Restaurant')).toBeUndefined()
  })

  it("should build a site's own type", () => {
    restore = registerType({
      type: 'Book',
      scope: 'document',
      idFragment: 'book',
      fields: { isbn: ['isbn-13'] },
      build: (context) => ({
        '@type': context.type,
        '@id': context.id,
        bookFormat: 'https://schema.org/EBook',
      }),
    })
    const book = byType(
      compose({ type: 'Book', fields: { title: 'Notes', 'isbn-13': '978-0' } }),
      'Book',
    )
    expect(book).toMatchObject({
      '@id': 'https://example.org/blog/post/#book',
      bookFormat: 'https://schema.org/EBook',
      isbn: '978-0',
    })
    restore()
    restore = undefined
    expect(getTypeDefinition('Book')).toBeUndefined()
  })

  it('should refuse types the vocabulary does not have or no longer uses', () => {
    const build = (): SchemaEntity => ({ '@type': 'X' })
    expect(() =>
      registerType({ type: 'Atricle', scope: 'document', idFragment: 'x', build }),
    ).toThrow(/not a Schema.org type/)
    expect(() => registerType({ type: 'Code', scope: 'document', idFragment: 'x', build })).toThrow(
      /superseded/,
    )
  })
})

describe('resolvePageEntities', () => {
  it('should show each value with its source, and which ones the SEO settings may set', async () => {
    const { resolvePageEntities } = await import('../src/graph/index.js')
    const entities = resolvePageEntities({
      config: { entities: [{ '@type': 'Article', properties: { headline: 'Set by an editor' } }] },
      fields: { title: 'Post', image: 'https://example.org/post.png' },
      siteConfig: SITE,
      path: '/blog/post',
      siteLevel: { entities: [ORGANIZATION] },
      documentMeta: META,
    })
    expect(entities.map((e) => [e.type, e.id, e.level])).toEqual([
      ['Organization', 'https://example.org/#business', 'site'],
      ['Article', 'https://example.org/blog/post/#article', 'document'],
    ])
    const article = Object.fromEntries((entities[1]?.properties ?? []).map((p) => [p.property, p]))
    expect(article['headline']).toMatchObject({
      value: 'Set by an editor',
      source: 'manual',
      editable: true,
    })
    expect(article['image']).toMatchObject({ source: 'auto', origin: 'the content field "image"' })
    expect(article['url']).toMatchObject({
      value: 'https://example.org/blog/post',
      source: 'computed',
      origin: "the page's path",
      editable: true,
    })
    const organization = Object.fromEntries(
      (entities[0]?.properties ?? []).map((p) => [p.property, p]),
    )
    expect(organization['logo']).toMatchObject({ source: 'site', origin: 'site.logo' })
  })

  it('should list only the values the graph carries', async () => {
    const { resolvePageEntities } = await import('../src/graph/index.js')
    const [list] = resolvePageEntities({
      config: { entities: [{ '@type': 'BreadcrumbList', properties: {} }] },
      fields: { title: 'Post' },
      siteConfig: SITE,
      path: '/blog/post',
      documentMeta: META,
    })
    const names = list?.properties.map((property) => property.property) ?? []
    expect(names).not.toContain('url')
    expect(names).not.toContain('dateModified')
  })
})
