/**
 * Conformance: every graph krantho composes validates against the pinned
 * Schema.org vocabulary — for every supported type, with representative
 * content, under several site configurations.
 */

import type { SeoConfigData, SeoConfigEntity } from '@krantho/seo-shared'
import { describe, expect, it } from 'vitest'
import {
  aboutPageArchetype,
  blogPostArchetype,
  coursePageArchetype,
  eventPageArchetype,
  homePageArchetype,
  howToPageArchetype,
  jobPostingPageArchetype,
  recipePageArchetype,
  servicePageArchetype,
  videoPageArchetype,
} from '../src/archetypes/index.js'
import { getDocumentLevelTypes, getSiteLevelTypes } from '../src/catalog/index.js'
import type { JsonLdGraph, SeoGraphConfig } from '../src/graph/index.js'
import { composeFromConfig, composeGraph } from '../src/graph/index.js'
import type { Finding } from '../src/validate/index.js'
import { validateGraph } from '../src/validate/index.js'

const SITE: SeoGraphConfig = {
  domain: 'example.org',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.org',
  logo: 'https://example.org/media/logo.png',
  description: 'Example publishes field notes.',
  sameAs: ['https://github.com/example'],
}

const PATH = '/notes/structured-data'

const DOCUMENT_META = {
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-20T12:30:00.000Z',
  locale: 'en',
  version: 3,
}

/** A page with only what every collection has */
const MINIMAL_CONTENT = {
  title: 'Field notes on structured data',
  description: 'How a site states what its pages are about.',
}

/** A page that fills the fields the dedicated builders read */
const FULL_CONTENT = {
  ...MINIMAL_CONTENT,
  'meta-description': 'Field notes on composing conformant structured data.',
  date: '2026-09-01',
  image: 'https://example.org/media/cover.png',
  status: 'published',
  startDate: '2026-11-01T09:00:00Z',
  endDate: '2026-11-01T17:00:00Z',
  location: 'Example Hall, Oslo',
  offers: { price: '10', priceCurrency: 'EUR' },
  recipeIngredient: ['2 eggs', '1 cup flour'],
  recipeInstructions: ['Whisk the eggs.', 'Fold in the flour.'],
  prepTime: 'PT10M',
  cookTime: 'PT20M',
  recipeYield: '4 servings',
  step: ['Open Studio.', 'Choose a type.'],
  totalTime: 'PT15M',
  courseCode: 'SD-101',
  datePosted: '2026-09-01',
  validThrough: '2026-12-31',
  employmentType: 'FULL_TIME',
  jobLocation: 'Oslo',
  contentUrl: 'https://example.org/media/talk.mp4',
  thumbnailUrl: 'https://example.org/media/talk.png',
  uploadDate: '2026-09-02',
  duration: 'PT12M',
}

const ORGANIZATION: SeoConfigEntity = {
  '@type': 'Organization',
  properties: {
    logo: 'https://example.org/media/logo.png',
    sameAs: ['https://github.com/example'],
  },
}
const PERSON: SeoConfigEntity = { '@type': 'Person', properties: { name: 'Ada Example' } }
const WEBSITE: SeoConfigEntity = { '@type': 'WebSite', properties: {} }

/** Site configurations a document is composed under */
const SITES: ReadonlyArray<readonly [string, SeoConfigData | null]> = [
  ['no site entities', null],
  ['an Organization', { entities: [ORGANIZATION, WEBSITE] }],
  ['an Organization and a Person', { entities: [ORGANIZATION, PERSON, WEBSITE] }],
]

const CONTENTS = [
  ['minimal content', MINIMAL_CONTENT],
  ['full content', FULL_CONTENT],
] as const

function errorsOf(findings: readonly Finding[]): string[] {
  return findings
    .filter((f) => f.severity === 'error')
    .map((f) => `${f.code} ${f.type ?? ''}${f.property ? `.${f.property}` : ''}: ${f.message}`)
}

function composeDocument(
  type: string,
  site: SeoConfigData | null,
  fields: Record<string, unknown>,
): JsonLdGraph {
  const config: SeoConfigData = { entities: [{ '@type': type, properties: {} }] }
  return composeFromConfig({
    config,
    fields,
    siteConfig: SITE,
    path: PATH,
    siteLevel: site,
    documentMeta: DOCUMENT_META,
  })
}

describe('conformance of composed graphs', () => {
  const documentTypes = getDocumentLevelTypes().map((t) => t.type)
  const siteTypes = getSiteLevelTypes().map((t) => t.type)

  for (const type of documentTypes) {
    for (const [siteLabel, site] of SITES) {
      for (const [contentLabel, fields] of CONTENTS) {
        it(`${type} — ${contentLabel}, ${siteLabel}`, () => {
          expect(errorsOf(validateGraph(composeDocument(type, site, fields)))).toEqual([])
        })
      }
    }
  }

  for (const type of siteTypes) {
    it(`site identity ${type} with an Article page`, () => {
      const site: SeoConfigData = {
        entities: [
          { '@type': type, properties: { logo: 'https://example.org/media/logo.png' } },
          WEBSITE,
        ],
      }
      expect(errorsOf(validateGraph(composeDocument('Article', site, FULL_CONTENT)))).toEqual([])
    })
  }

  const presets = {
    homePageArchetype,
    aboutPageArchetype,
    servicePageArchetype,
    blogPostArchetype,
    eventPageArchetype,
    recipePageArchetype,
    coursePageArchetype,
    jobPostingPageArchetype,
    howToPageArchetype,
    videoPageArchetype,
  }
  for (const [name, archetype] of Object.entries(presets)) {
    it(`archetype ${name}`, () => {
      const graph = composeGraph({ archetype, fields: FULL_CONTENT, config: SITE, path: PATH })
      expect(errorsOf(validateGraph(graph))).toEqual([])
    })
  }
})
