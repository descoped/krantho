import { describe, expect, it } from 'vitest'
import type { Finding } from '../src/validate/index.js'
import { validateGraph } from '../src/validate/index.js'

const BASE = 'https://example.org'

function graph(...nodes: Record<string, unknown>[]): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@graph': nodes }
}

function codes(findings: readonly Finding[]): string[] {
  return findings.map((f) => f.code)
}

function errors(findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => f.severity === 'error')
}

const organization = {
  '@type': 'Organization',
  '@id': `${BASE}/#business`,
  name: 'Example',
  url: BASE,
}

describe('validateGraph', () => {
  it('should accept a conformant graph', () => {
    const article = {
      '@type': 'Article',
      '@id': `${BASE}/a/#article`,
      headline: 'A',
      datePublished: '2026-10-02',
      dateModified: '2026-10-02T10:00:00Z',
      author: { '@id': `${BASE}/#business` },
      image: `${BASE}/a.png`,
      mainEntityOfPage: `${BASE}/a`,
    }
    expect(validateGraph(graph(organization, article))).toEqual([])
  })

  it('should accept a single root node', () => {
    expect(validateGraph({ '@context': 'https://schema.org', ...organization })).toEqual([])
  })

  it('should report a reference that resolves to nothing', () => {
    const article = {
      '@type': 'Article',
      '@id': `${BASE}/a/#article`,
      author: { '@id': `${BASE}/#person` },
    }
    const findings = validateGraph(graph(article))
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'unresolved-reference',
        profile: 'schema.org',
        nodeId: `${BASE}/a/#article`,
        type: 'Article',
        property: 'author',
      }),
    ])
  })

  it('should report a reference to a node of a type outside the range', () => {
    const website = { '@type': 'WebSite', '@id': `${BASE}/#website`, name: 'Example', url: BASE }
    const article = {
      '@type': 'Article',
      '@id': `${BASE}/a/#article`,
      author: { '@id': `${BASE}/#website` },
    }
    expect(codes(validateGraph(graph(website, article)))).toEqual(['value-out-of-range'])
  })

  it('should report duplicate identifiers', () => {
    expect(codes(validateGraph(graph(organization, { ...organization, name: 'Other' })))).toEqual([
      'duplicate-id',
    ])
  })

  it('should report nodes without a type, top-level and nested', () => {
    const untyped = { '@id': `${BASE}/#x`, name: 'X' }
    const event = { '@type': 'Event', '@id': `${BASE}/e/#event`, location: { name: 'Hall' } }
    expect(codes(validateGraph(graph(untyped, event)))).toEqual(['missing-type', 'missing-type'])
  })

  it('should report unknown types and properties', () => {
    const node = { '@type': 'Atricle', '@id': `${BASE}/a/#article`, headlien: 'A' }
    expect(codes(validateGraph(graph(node)))).toEqual(['unknown-type', 'unknown-property'])
  })

  it('should warn about a property used outside its domain', () => {
    const node = {
      '@type': 'Person',
      '@id': `${BASE}/#person`,
      name: 'P',
      headline: 'Not a person property',
    }
    const findings = validateGraph(graph(node))
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'property-not-in-domain',
        property: 'headline',
      }),
    ])
  })

  it('should accept a property inherited from a supertype', () => {
    const node = { '@type': 'TechArticle', '@id': `${BASE}/a/#article`, name: 'A', headline: 'A' }
    expect(validateGraph(graph(node))).toEqual([])
  })

  it('should report literals outside the range', () => {
    const node = {
      '@type': 'Article',
      '@id': `${BASE}/a/#article`,
      datePublished: 'yesterday',
      url: '/relative',
      wordCount: 'many',
    }
    const findings = validateGraph(graph(node))
    expect(codes(findings)).toEqual([
      'value-out-of-range',
      'value-out-of-range',
      'value-out-of-range',
    ])
    expect(findings.map((f) => f.property)).toEqual(['datePublished', 'url', 'wordCount'])
  })

  it('should report a nested node of a type outside the range', () => {
    const node = {
      '@type': 'Article',
      '@id': `${BASE}/a/#article`,
      author: { '@type': 'Place', name: 'Oslo' },
    }
    expect(codes(validateGraph(graph(node)))).toEqual(['value-out-of-range'])
  })

  it('should accept text where a thing is expected', () => {
    const node = { '@type': 'Recipe', '@id': `${BASE}/r/#recipe`, prepTime: 'PT20M', author: 'Ada' }
    expect(validateGraph(graph(node))).toEqual([])
  })

  it('should check enumeration values', () => {
    const offer = (availability: string): Record<string, unknown> => ({
      '@type': 'Product',
      '@id': `${BASE}/p/#product`,
      name: 'P',
      offers: { '@type': 'Offer', price: 10, priceCurrency: 'EUR', availability },
    })
    expect(validateGraph(graph(offer('https://schema.org/InStock')))).toEqual([])
    expect(validateGraph(graph(offer('InStock')))).toEqual([])
    expect(codes(validateGraph(graph(offer('https://schema.org/Available'))))).toEqual([
      'value-out-of-range',
    ])
  })

  it('should validate every element of an array value', () => {
    const node = {
      '@type': 'Article',
      '@id': `${BASE}/a/#article`,
      author: [{ '@id': `${BASE}/#business` }, { '@id': `${BASE}/#nobody` }],
    }
    expect(codes(validateGraph(graph(organization, node)))).toEqual(['unresolved-reference'])
  })

  it('should check value objects by their value', () => {
    const node = {
      '@type': 'Article',
      '@id': `${BASE}/a/#article`,
      headline: { '@value': 'A', '@language': 'en' },
    }
    expect(validateGraph(graph(node))).toEqual([])
  })

  it('should report superseded and retired terms as errors, pending terms as information', () => {
    const code = { '@type': 'Code', '@id': `${BASE}/c/#code`, name: 'C' }
    const dataset = {
      '@type': 'Dataset',
      '@id': `${BASE}/d/#dataset`,
      name: 'D',
      variablesMeasured: 'x',
    }
    const story = { '@type': 'AmpStory', '@id': `${BASE}/s/#story`, name: 'S' }
    const findings = validateGraph(graph(code, dataset, story))
    expect(findings.map((f) => [f.severity, f.code])).toEqual([
      ['error', 'superseded-term'],
      ['error', 'retired-term'],
      ['info', 'pending-term'],
    ])
    expect(findings[0]?.message).toContain('SoftwareSourceCode')
    expect(errors(findings)).toHaveLength(2)
  })
})
