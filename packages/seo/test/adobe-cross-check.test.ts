/**
 * Cross-check: Adobe's structured-data validator implements Google's rules for
 * a set of types. Every error it reports on a graph krantho composes must be
 * one krantho's Google profile reports too, or a divergence listed here with
 * its reason — so the two rule sets cannot drift apart unnoticed.
 */
import Validator from '@adobe/structured-data-validator'
import { describe, expect, it } from 'vitest'
import type { JsonLdGraph, SeoGraphConfig } from '../src/graph/index.js'
import { composeFromConfig } from '../src/graph/index.js'
import '../src/profiles/index.js'
import { validateGraph } from '../src/validate/index.js'

const SITE: SeoGraphConfig = {
  domain: 'example.org',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.org',
  logo: 'https://example.org/media/logo.png',
  sameAs: ['https://github.com/example'],
}

/** A page that fills the fields the builders of the types below read */
const CONTENT = {
  title: 'Field notes',
  description: 'How a site states what its pages are about.',
  date: '2026-09-01',
  image: 'https://example.org/media/cover.png',
  offers: { price: '10', priceCurrency: 'EUR' },
  recipeIngredient: ['2 eggs'],
  recipeInstructions: ['Whisk the eggs.'],
  prepTime: 'PT10M',
  cookTime: 'PT20M',
  recipeYield: '4 servings',
  datePosted: '2026-09-01',
  validThrough: '2026-12-31',
  employmentType: 'FULL_TIME',
  jobLocation: 'Oslo',
  contentUrl: 'https://example.org/media/talk.mp4',
  thumbnailUrl: 'https://example.org/media/talk.png',
  uploadDate: '2026-09-02',
  duration: 'PT12M',
}

/**
 * Errors Adobe reports that krantho does not, each with why. krantho's
 * profiles state requirements on a type's own properties; a requirement on a
 * nested value is left to the content that supplies it.
 */
const KNOWN_DIVERGENCES: Readonly<Record<string, string>> = {
  'JobPosting jobLocation.address.addressCountry':
    'Google requires a country in the job location address; a nested requirement, met when content gives jobLocation as a Place with a PostalAddress',
}

/** The types Adobe has Google rules for that krantho composes as a page's entity */
const TYPES = [
  'Product',
  'Recipe',
  'JobPosting',
  'VideoObject',
  'BreadcrumbList',
  'Organization',
  'Person',
]

function compose(type: string): JsonLdGraph {
  return composeFromConfig({
    config: { entities: [{ '@type': type, properties: {} }] },
    fields: CONTENT,
    siteConfig: SITE,
    path: '/notes/field-notes',
    siteLevel: { entities: [{ '@type': 'Organization', properties: {} }] },
    documentMeta: { createdAt: '2026-09-01T08:00:00Z', locale: 'en', version: 1 },
    structure: { trail: [{ name: 'Notes', url: '/notes' }, { name: 'Field notes' }] },
  })
}

/** The graph as `@marbec/web-auto-extractor` hands JSON-LD to the validator: nodes by type */
function extracted(graph: JsonLdGraph): { jsonld: Record<string, unknown[]> } {
  const jsonld: Record<string, unknown[]> = {}
  for (const node of graph['@graph']) {
    const type = String(node['@type'])
    jsonld[type] = [...(jsonld[type] ?? []), structuredClone(node)]
  }
  return { jsonld }
}

describe('Adobe structured-data validator cross-check', () => {
  it.each(TYPES)('reports no Google error on %s that krantho does not', async (type) => {
    const graph = compose(type)
    const ours = validateGraph(graph, { profiles: ['google'] }).filter(
      (f) => f.profile === 'google',
    )
    const issues = await new Validator().validate(extracted(graph))

    const unexplained = issues
      .filter((issue) => issue.severity === 'ERROR')
      .flatMap((issue) => (issue.fieldNames ?? ['']).map((field) => `${issue.rootType} ${field}`))
      .filter((key) => !(key in KNOWN_DIVERGENCES))
      .filter((key) => {
        const [nodeType, field = ''] = key.split(' ')
        const property = field.split('.')[0] ?? ''
        return !ours.some(
          (f) =>
            f.type === nodeType && (f.property === property || f.message.includes(`"${property}"`)),
        )
      })
    expect(unexplained).toEqual([])
  })

  it('still finds each known divergence, so a fixed one is removed from the list', async () => {
    const reported = new Set<string>()
    for (const type of TYPES) {
      for (const issue of await new Validator().validate(extracted(compose(type)))) {
        for (const field of issue.fieldNames ?? []) reported.add(`${issue.rootType} ${field}`)
      }
    }
    expect(Object.keys(KNOWN_DIVERGENCES).filter((key) => !reported.has(key))).toEqual([])
  })
})
