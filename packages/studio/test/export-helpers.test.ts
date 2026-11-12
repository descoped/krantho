// downloadFile is not tested because it uses DOM APIs (document.createElement,
// URL.createObjectURL) that are not available in the Vitest/Node environment.

import { describe, expect, it } from 'vitest'
import { exportAsJsonLd, exportAsScriptTag, generateFilename } from '../src/lib/export-helpers.js'

const sampleGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Article', '@id': 'https://example.com/#article', headline: 'Test' },
    { '@type': 'Person', '@id': 'https://example.com/#person', name: 'Jane' },
  ],
}

describe('exportAsJsonLd', () => {
  it('produces valid formatted JSON', () => {
    const result = exportAsJsonLd(sampleGraph)
    expect(JSON.parse(result)).toEqual(sampleGraph)
  })

  it('preserves @context and @graph', () => {
    const result = exportAsJsonLd(sampleGraph)
    expect(result).toContain('"@context": "https://schema.org"')
    expect(result).toContain('"@graph"')
  })
})

describe('exportAsScriptTag', () => {
  it('wraps JSON-LD in correct script element', () => {
    const result = exportAsScriptTag(sampleGraph)
    expect(result).toMatch(/^<script type="application\/ld\+json">/)
    expect(result).toMatch(/<\/script>$/)
  })

  it('contains valid JSON between tags', () => {
    const result = exportAsScriptTag(sampleGraph)
    const json = result.replace(/^<script[^>]*>\n/, '').replace(/\n<\/script>$/, '')
    expect(JSON.parse(json)).toEqual(sampleGraph)
  })
})

describe('generateFilename', () => {
  it('generates document scope filename', () => {
    expect(generateFilename('pages', 'home')).toBe('pages-home.jsonld')
  })

  it('generates collection scope filename', () => {
    expect(generateFilename('services')).toBe('services.jsonld')
  })

  it('generates site scope filename', () => {
    expect(generateFilename()).toBe('site.jsonld')
  })

  it('handles undefined slug', () => {
    expect(generateFilename('pages', undefined)).toBe('pages.jsonld')
  })
})
