import type { PageStructure } from '@krantho/core'
import type { SeoConfigData } from '@krantho/seo-shared'
import { afterEach, describe, expect, it } from 'vitest'
import { registerDecorator, registeredDecorators } from '../src/decorators/index.js'
import type { SchemaEntity, SeoGraphConfig } from '../src/graph/index.js'
import { composeFromConfig, resolveEffectiveConfig } from '../src/graph/index.js'
import type { Finding } from '../src/validate/index.js'
import { validateGraph } from '../src/validate/index.js'

const SITE: SeoGraphConfig = {
  domain: 'example.org',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.org',
}

const SITE_LEVEL: SeoConfigData = {
  entities: [
    { '@type': 'Organization', properties: {} },
    { '@type': 'WebSite', properties: {} },
  ],
}

const META = {
  createdAt: '2026-09-01T08:00:00Z',
  updatedAt: '2026-09-20T12:00:00Z',
  locale: 'en',
  version: 2,
}

function compose(
  options: {
    types?: string[]
    config?: Partial<SeoConfigData>
    structure?: PageStructure
    findings?: Finding[]
  } = {},
): SchemaEntity[] {
  const graph = composeFromConfig({
    config: {
      entities: (options.types ?? ['Article']).map((type) => ({ '@type': type, properties: {} })),
      ...options.config,
    },
    fields: { title: 'Add SEO', image: 'https://example.org/seo.png' },
    siteConfig: SITE,
    path: '/docs/add-seo',
    siteLevel: SITE_LEVEL,
    documentMeta: META,
    structure: options.structure,
    onFinding: (finding) => options.findings?.push(finding),
  })
  const errors = validateGraph(graph).filter((finding) => finding.severity === 'error')
  expect(errors).toEqual([])
  return graph['@graph']
}

function nodeOf(graph: SchemaEntity[], type: string): SchemaEntity | undefined {
  return graph.find((node) => node['@type'] === type)
}

const PAGE = 'https://example.org/docs/add-seo'

describe('page decorator', () => {
  it('emits the page node, part of the WebSite, about the document entity', () => {
    const page = nodeOf(compose(), 'WebPage')
    expect(page).toEqual({
      '@type': 'WebPage',
      '@id': `${PAGE}/#webpage`,
      url: PAGE,
      name: 'Add SEO',
      isPartOf: { '@id': 'https://example.org/#website' },
      mainEntity: { '@id': `${PAGE}/#article` },
      primaryImageOfPage: { '@type': 'ImageObject', url: 'https://example.org/seo.png' },
      dateModified: '2026-09-20T12:00:00Z',
      inLanguage: 'en',
    })
  })

  it('makes the page node the type its kind names, from the template or the configuration', () => {
    expect(nodeOf(compose({ structure: { kind: 'collection' } }), 'CollectionPage')).toBeDefined()
    expect(nodeOf(compose({ structure: { kind: 'ContactPage' } }), 'ContactPage')).toBeDefined()
    const configured = compose({ config: { structure: { kind: 'about' } } })
    expect(nodeOf(configured, 'AboutPage')).toBeDefined()
  })

  it('uses a configured WebPage type of the page as the page node', () => {
    const graph = compose({ types: ['FAQPage'] })
    expect(graph.filter((node) => node['@type'] === 'WebPage')).toEqual([])
    expect(nodeOf(graph, 'FAQPage')).toMatchObject({
      isPartOf: { '@id': 'https://example.org/#website' },
    })
  })

  it('falls back to WebPage with a finding for a kind it does not know', () => {
    const findings: Finding[] = []
    const graph = compose({ structure: { kind: 'Thing' }, findings })
    expect(nodeOf(graph, 'WebPage')).toBeDefined()
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'unknown-type' }),
    ])
  })
})

describe('breadcrumb decorator', () => {
  it('states the trail the page renders, with relative URLs made absolute', () => {
    const graph = compose({
      structure: {
        trail: [
          { name: 'Docs', url: '/docs' },
          { name: 'Get started', url: '/docs#area-start' },
          { name: 'Add SEO' },
        ],
      },
    })
    const list = nodeOf(graph, 'BreadcrumbList')
    expect(list?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Docs', item: 'https://example.org/docs' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Get started',
        item: 'https://example.org/docs#area-start',
      },
      { '@type': 'ListItem', position: 3, name: 'Add SEO', item: PAGE },
    ])
    expect(nodeOf(graph, 'WebPage')?.breadcrumb).toEqual({ '@id': list?.['@id'] })
  })

  it('adds the page to the trail a collection configures', () => {
    const graph = compose({ config: { structure: { trail: [{ name: 'Docs', url: '/docs' }] } } })
    expect(nodeOf(graph, 'BreadcrumbList')?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Docs', item: 'https://example.org/docs' },
      { '@type': 'ListItem', position: 2, name: 'Add SEO', item: PAGE },
    ])
  })

  it('builds a configured BreadcrumbList from the same trail, and Home › page without one', () => {
    const trail = [{ name: 'Docs', url: '/docs' }, { name: 'Add SEO' }]
    const withTrail = compose({ types: ['Article', 'BreadcrumbList'], structure: { trail } })
    expect(withTrail.filter((node) => node['@type'] === 'BreadcrumbList')).toHaveLength(1)
    expect(nodeOf(withTrail, 'BreadcrumbList')?.itemListElement).toHaveLength(2)

    const fallback = compose({ types: ['Article', 'BreadcrumbList'] })
    const items = nodeOf(fallback, 'BreadcrumbList')?.itemListElement as SchemaEntity[]
    expect(items.map((item) => item.name)).toEqual(['Home', 'Add SEO'])
  })

  it('adds no BreadcrumbList when the page states no trail and none is configured', () => {
    expect(nodeOf(compose(), 'BreadcrumbList')).toBeUndefined()
  })
})

describe('sequence decorator', () => {
  it('states the set the page is part of and its position in it', () => {
    const graph = compose({
      structure: {
        sequence: { partOf: { name: 'Get started', url: '/docs#area-start' }, position: 3 },
      },
    })
    const page = nodeOf(graph, 'WebPage')
    expect(page?.isPartOf).toEqual([
      { '@id': 'https://example.org/#website' },
      { '@id': 'https://example.org/docs#area-start' },
    ])
    expect(page?.position).toBe(3)
    expect(nodeOf(graph, 'CollectionPage')).toEqual({
      '@type': 'CollectionPage',
      '@id': 'https://example.org/docs#area-start',
      name: 'Get started',
      url: 'https://example.org/docs#area-start',
    })
  })
})

describe('registerDecorator', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it("runs a site's decorator after krantho's, and removes it on restore", () => {
    restore = registerDecorator({
      id: 'speakable',
      decorate(graph, page) {
        const node = graph.find((entity) => entity['@id'] === page.pageId)
        if (node) node.speakable = { '@type': 'SpeakableSpecification', cssSelector: ['h1'] }
        return graph
      },
    })
    expect(registeredDecorators().map((decorator) => decorator.id)).toEqual([
      'page',
      'breadcrumb',
      'sequence',
      'speakable',
    ])
    expect(nodeOf(compose(), 'WebPage')?.speakable).toBeDefined()

    restore()
    restore = undefined
    expect(registeredDecorators().map((decorator) => decorator.id)).not.toContain('speakable')
  })
})

describe('resolveEffectiveConfig', () => {
  it('takes each structure setting from the most specific scope that gives it', () => {
    const effective = resolveEffectiveConfig({
      collection: {
        entities: [],
        structure: { trail: [{ name: 'Docs', url: '/docs' }], kind: 'item' },
      },
      document: { entities: [], structure: { kind: 'about' } },
    })
    expect(effective.structure).toEqual({ trail: [{ name: 'Docs', url: '/docs' }], kind: 'about' })
  })
})
