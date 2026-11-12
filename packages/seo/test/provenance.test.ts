import { describe, expect, it } from 'vitest'
import { resolveEffectiveConfig } from '../src/graph/effective-config.js'
import { valueScope } from '../src/graph/value-scope.js'
import type { PropertySource, ResolvedProperty } from '../src/index.js'
import { featureEligibility } from '../src/profiles/index.js'

const BASE = 'https://example.org'

function resolved(value: unknown, source: PropertySource): ResolvedProperty {
  return { value, source, origin: 'test' }
}

function graph(...nodes: Record<string, unknown>[]): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@graph': nodes }
}

describe('resolveEffectiveConfig — value scopes', () => {
  it('records the most specific scope that set each property', () => {
    const effective = resolveEffectiveConfig({
      collection: {
        entities: [{ '@type': 'Article', properties: { headline: 'C', author: 'C' } }],
      },
      route: { entities: [{ '@type': 'Article', properties: { author: 'R' } }] },
      document: { entities: [{ '@type': 'Article', properties: { headline: 'D' } }] },
    })

    const [article] = effective.entities
    expect(article?.properties).toEqual({ headline: 'D', author: 'R' })
    expect(article?.scopes).toEqual({ headline: 'document', author: 'route' })
  })
})

describe('valueScope', () => {
  const documentEntity = { fromSite: false, scopes: { headline: 'document' as const } }

  it('names a reference linked, whatever its source', () => {
    const reference = resolved({ '@id': `${BASE}/#org` }, 'manual')
    expect(valueScope(reference, 'publisher', documentEntity)).toBe('linked')
    const references = resolved([{ '@id': `${BASE}/#a` }, { '@id': `${BASE}/#b` }], 'computed')
    expect(valueScope(references, 'author', documentEntity)).toBe('linked')
  })

  it('names computed, site and document values by their source', () => {
    expect(valueScope(resolved(`${BASE}/a`, 'computed'), 'url', documentEntity)).toBe('computed')
    expect(valueScope(resolved('Acme', 'site'), 'name', documentEntity)).toBe('site')
    expect(valueScope(resolved('About', 'auto'), 'name', documentEntity)).toBe('document')
  })

  it('names a set value by the scope that set it, the collection by default, the site on a site entity', () => {
    expect(valueScope(resolved('Mine', 'manual'), 'headline', documentEntity)).toBe('document')
    expect(valueScope(resolved('Ours', 'manual'), 'about', documentEntity)).toBe('collection')
    expect(valueScope(resolved('Acme', 'manual'), 'name', { fromSite: true })).toBe('site')
  })
})

describe('featureEligibility', () => {
  const event = {
    '@type': 'Event',
    '@id': `${BASE}/talk#event`,
    name: 'Talk',
    startDate: '2026-11-01T18:00:00Z',
  }

  it("lists an entity's feature with what it still needs", () => {
    const [google] = featureEligibility(graph(event), ['google'])
    expect(google).toMatchObject({
      reader: 'google',
      feature: 'Event',
      type: 'Event',
      nodeId: `${BASE}/talk#event`,
      status: 'active',
      eligible: false,
      missing: ['location'],
    })
    expect(google?.source).toMatch(/^https:\/\//)
  })

  it('is eligible once every needed property is present', () => {
    const located = { ...event, location: { '@type': 'Place', name: 'Hall' } }
    const [google] = featureEligibility(graph(located), ['google'])
    expect(google).toMatchObject({ eligible: true, missing: [] })
  })

  it('never lists a feature the reader has retired', () => {
    const faq = { '@type': 'FAQPage', '@id': `${BASE}/faq#faq`, mainEntity: [] }
    expect(featureEligibility(graph(faq), ['google'])).toEqual([])
  })

  it('skips readers it does not know', () => {
    expect(featureEligibility(graph(event), ['nobody'])).toEqual([])
  })
})
