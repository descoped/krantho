import { describe, expect, it } from 'vitest'
import {
  changedContent,
  type EnrichFacts,
  enrichBlocker,
  stepOutcome,
} from '../src/editor/data-mode/enrichment-model.js'
import { editableConfig, emittedNodes, emittedTypes } from '../src/editor/data-mode/graph-config.js'
import {
  formAsVersion,
  refreshFailed,
  restoreFailed,
  restoreMessage,
  versionChips,
} from '../src/editor/data-mode/history-model.js'
import {
  imageSource,
  type PreviewInput,
  pagePreview,
  resultCrumbs,
} from '../src/editor/data-mode/preview-model.js'
import {
  COMPOSED_ORIGIN,
  entityViews,
  referencesOf,
  scopeCounts,
  VALUE_SCOPES,
  valueText,
} from '../src/editor/data-mode/provenance.js'
import { findingGroups } from '../src/editor/data-mode/reader-findings.js'
import type { EnrichStatusResponse, ResolvedEntity } from '../src/lib/api-types.js'

const ENTITIES: ResolvedEntity[] = [
  {
    type: 'Organization',
    id: 'https://fjord.example/#org',
    level: 'site',
    properties: [
      {
        property: 'name',
        value: 'Fjord',
        source: 'site',
        scope: 'site',
        origin: 'site.name',
        editable: true,
      },
    ],
  },
  {
    type: 'Article',
    id: 'https://fjord.example/pricing/#article',
    level: 'document',
    properties: [
      {
        property: 'headline',
        value: 'Pricing',
        source: 'auto',
        scope: 'document',
        origin: 'the content field "title"',
        editable: true,
      },
      {
        property: 'wordCount',
        value: 120,
        source: 'manual',
        scope: 'route',
        origin: 'the SEO settings',
        editable: true,
      },
      {
        property: 'publisher',
        value: { '@id': 'https://fjord.example/#org' },
        source: 'manual',
        scope: 'linked',
        origin: 'the SEO settings',
        editable: false,
      },
      {
        property: 'keywords',
        value: ['a', 'b'],
        source: 'manual',
        scope: 'collection',
        origin: 'the SEO settings',
        editable: true,
      },
      {
        property: 'url',
        value: 'https://fjord.example/pricing',
        source: 'computed',
        scope: 'computed',
        origin: "the page's path",
        editable: true,
      },
    ],
  },
]

/** The graph composition emits for the page: the configured entities, then the page and breadcrumb decorators */
const NODES = [
  { '@type': 'Organization', '@id': 'https://fjord.example/#org', name: 'Fjord' },
  {
    '@type': 'WebSite',
    '@id': 'https://fjord.example/#website',
    url: 'https://fjord.example',
    publisher: { '@id': 'https://fjord.example/#org' },
  },
  {
    '@type': 'Article',
    '@id': 'https://fjord.example/pricing/#article',
    headline: 'Pricing',
    wordCount: 120,
    publisher: { '@id': 'https://fjord.example/#org' },
    keywords: ['a', 'b'],
    url: 'https://fjord.example/pricing',
    image: 'https://fjord.example/hero.png',
  },
  {
    '@type': 'WebPage',
    '@id': 'https://fjord.example/pricing/#webpage',
    url: 'https://fjord.example/pricing',
    isPartOf: { '@id': 'https://fjord.example/#website' },
    mainEntity: { '@id': 'https://fjord.example/pricing/#article' },
    breadcrumb: { '@id': 'https://fjord.example/pricing/#breadcrumb' },
  },
  {
    '@type': 'BreadcrumbList',
    '@id': 'https://fjord.example/pricing/#breadcrumb',
    itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Pricing' }],
  },
]

const SOURCES = { nodes: NODES, resolved: ENTITIES, siteTypes: new Set<string>() }

describe('provenance', () => {
  it('names every §6 source: site, collection, URL pattern, document, computed, linked', () => {
    expect(Object.values(VALUE_SCOPES).map((scope) => scope.label)).toEqual([
      'site',
      'collection',
      'URL pattern',
      'document',
      'computed',
      'linked',
    ])
  })

  it('lists every node the page emits, the page’s own first, each value with its scope and origin', () => {
    const views = entityViews(SOURCES)
    expect(views.map((view) => [view.type, view.scope])).toEqual([
      ['Article', 'page'],
      ['WebPage', 'page'],
      ['BreadcrumbList', 'page'],
      ['Organization', 'site'],
      ['WebSite', 'site'],
    ])
    const article = views[0]
    expect(article?.rows.map((row) => [row.key, row.text, row.scope])).toEqual([
      ['headline', 'Pricing', 'document'],
      ['wordCount', '120', 'route'],
      ['publisher', 'https://fjord.example/#org', 'linked'],
      ['keywords', '["a","b"]', 'collection'],
      ['url', 'https://fjord.example/pricing', 'computed'],
      ['image', 'https://fjord.example/hero.png', 'computed'],
    ])
    expect(article?.rows.at(-1)?.origin).toBe(COMPOSED_ORIGIN)
    const publisher = article?.rows.find((row) => row.key === 'publisher')
    expect(publisher?.references).toEqual(['https://fjord.example/#org'])
    expect(publisher?.fixed).toBe(true)
  })

  it('lists a node krantho adds while composing, with its type and @id, every value computed', () => {
    const webPage = entityViews(SOURCES).find((view) => view.type === 'WebPage')
    expect(webPage?.id).toBe('https://fjord.example/pricing/#webpage')
    expect(webPage?.rows.map((row) => [row.key, row.scope, row.origin])).toEqual([
      ['url', 'computed', COMPOSED_ORIGIN],
      ['isPartOf', 'computed', COMPOSED_ORIGIN],
      ['mainEntity', 'computed', COMPOSED_ORIGIN],
      ['breadcrumb', 'computed', COMPOSED_ORIGIN],
    ])
    expect(webPage?.rows.find((row) => row.key === 'isPartOf')?.references).toEqual([
      'https://fjord.example/#website',
    ])
    // The page node links the BreadcrumbList the composition added too
    expect(webPage?.rows.find((row) => row.key === 'breadcrumb')?.references).toEqual([
      'https://fjord.example/pricing/#breadcrumb',
    ])
    expect(webPage?.rows.every((row) => !row.fixed)).toBe(true)
  })

  it('takes an added node’s scope from its type when the catalog names it site-level, else from its place', () => {
    const late = { '@type': 'Person', '@id': '#founder', name: 'Ada' }
    const nodes = [...NODES, late]
    expect(entityViews({ ...SOURCES, nodes }).find((v) => v.id === '#founder')?.scope).toBe('page')
    const siteTypes = new Set(['Person'])
    expect(
      entityViews({ ...SOURCES, nodes, siteTypes }).find((v) => v.id === '#founder')?.scope,
    ).toBe('site')
  })

  it('reads references, one or a list, and shows other objects as JSON', () => {
    expect(referencesOf([{ '@id': '#a' }, { '@id': '#b' }])).toEqual(['#a', '#b'])
    expect(referencesOf('text')).toEqual([])
    expect(valueText([{ '@id': '#a' }, { '@id': '#b' }])).toBe('#a, #b')
    expect(valueText({ '@type': 'Offer', price: '5' })).toBe('{"@type":"Offer","price":"5"}')
    expect(valueText(true)).toBe('true')
  })

  it('counts the values of each source in the legend’s order', () => {
    const views = entityViews({ ...SOURCES, nodes: NODES.slice(0, 1).concat(NODES[2] ?? []) })
    expect(scopeCounts(views)).toEqual([
      ['site', 1],
      ['collection', 1],
      ['route', 1],
      ['document', 1],
      ['computed', 2],
      ['linked', 1],
    ])
  })
})

describe('graph config at the document scope', () => {
  const graph = {
    '@graph': [
      { '@type': 'Article', '@id': '/pricing#article', headline: 'Pricing' },
      { '@type': 'BreadcrumbList', '@id': '/pricing#breadcrumb' },
      { name: 'untyped' },
    ],
  }

  it('reads the emitted nodes and their types', () => {
    expect(emittedNodes(graph)).toHaveLength(3)
    expect(emittedNodes({ '@type': 'WebPage' })).toEqual([{ '@type': 'WebPage' }])
    expect(emittedNodes(null)).toEqual([])
    expect(emittedTypes(emittedNodes(graph))).toEqual(['Article', 'BreadcrumbList'])
  })

  it('matches each node to a configured entity and adds one for a composed node, carrying its @id', () => {
    const config = editableConfig(emittedNodes(graph), {
      document: null,
      collection: { entities: [{ '@type': 'Article', properties: { articleSection: 'Plans' } }] },
      site: null,
    })
    expect(config.entities).toEqual([
      { '@type': 'Article', '@id': '/pricing#article', properties: { articleSection: 'Plans' } },
      { '@type': 'BreadcrumbList', '@id': '/pricing#breadcrumb', properties: {} },
    ])
  })

  it('starts from the document’s own configuration before the collection’s, else the site types', () => {
    const nodes = emittedNodes({ '@graph': [{ '@type': 'Service', '@id': '#s' }] })
    const own = { entities: [{ '@type': 'Service', '@id': '#s', properties: { name: 'Own' } }] }
    const collection = { entities: [{ '@type': 'Service', properties: { name: 'Collection' } }] }
    expect(editableConfig(nodes, { document: own, collection, site: null }).entities).toEqual(
      own.entities,
    )
    const site = { entities: [{ '@type': 'Service', properties: {} }] }
    expect(editableConfig(nodes, { document: null, collection: null, site }).entities).toEqual([
      { '@type': 'Service', '@id': '#s', properties: {} },
    ])
  })

  it('never copies the collection’s field mappings or page structure into a document’s own config', () => {
    const nodes = emittedNodes({ '@graph': [{ '@type': 'Article', '@id': '#a' }] })
    const collection = {
      entities: [{ '@type': 'Article', properties: {} }],
      fieldMappings: { headline: 'title' },
      structure: { trail: [{ name: 'Home', path: '/' }], kind: 'Article' },
    }
    const config = editableConfig(nodes, { document: null, collection, site: null })
    expect(config).toEqual({ entities: [{ '@type': 'Article', '@id': '#a', properties: {} }] })
  })
})

describe('previews', () => {
  const input: PreviewInput = {
    fields: { title: 'Pricing', description: 'What it costs', image: 'hero-id' },
    slug: 'pricing',
    pageUrl: 'https://fjord.example/pricing',
    documentSeo: {},
    siteSeo: {},
    siteName: 'Fjord Studio',
  }

  it('resolves as the site’s meta tags do: content fields, then the site', () => {
    const preview = pagePreview(input)
    expect(preview.title).toBe('Pricing')
    expect(preview.description).toBe('What it costs')
    expect(preview.url).toBe('https://fjord.example/pricing')
    expect(preview.social).toEqual({
      title: 'Pricing',
      description: 'What it costs',
      image: 'hero-id',
      type: 'website',
      siteName: 'Fjord Studio',
    })
    expect(preview.twitterCard).toBe('summary_large_image')
  })

  it('lets the SEO settings and the og- and canonical overrides win', () => {
    const preview = pagePreview({
      ...input,
      fields: {
        ...input.fields,
        'meta-description': 'Plans and prices',
        'og-title': 'Share title',
        'og-type': 'article',
        'canonical-url': 'https://fjord.example/plans',
      },
      documentSeo: { headline: 'Seo headline' },
      siteSeo: { name: 'Fjord' },
    })
    expect(preview.title).toBe('Seo headline')
    expect(preview.description).toBe('Plans and prices')
    expect(preview.url).toBe('https://fjord.example/plans')
    expect(preview.social.title).toBe('Share title')
    expect(preview.social.type).toBe('article')
    expect(preview.social.siteName).toBe('Fjord')
  })

  it('falls back to the slug and a summary card without an image', () => {
    const preview = pagePreview({ ...input, fields: {}, pageUrl: null })
    expect(preview.title).toBe('pricing')
    expect(preview.url).toBeNull()
    expect(preview.social.image).toBeNull()
    expect(preview.twitterCard).toBe('summary')
  })

  it('writes the address as crumbs and loads a media id through the media API', () => {
    expect(resultCrumbs('https://fjord.example/services/design')).toEqual({
      host: 'fjord.example',
      trail: ' › services › design',
    })
    expect(resultCrumbs(null)).toEqual({ host: '', trail: '' })
    expect(imageSource('https://cdn.example/a.png')).toBe('https://cdn.example/a.png')
    expect(imageSource('/uploads/a.png')).toBe('/uploads/a.png')
    expect(imageSource('m 1')).toBe('/api/media/m%201/image?preset=lg')
  })
})

describe('enrichment', () => {
  const facts: EnrichFacts = {
    saved: true,
    admin: true,
    canEdit: true,
    lockedBy: null,
    dirty: false,
    defaultLocale: true,
    defaultLocaleName: 'en',
  }

  it('runs for an admin on the default locale’s saved, clean, unlocked version — and says why not otherwise', () => {
    expect(enrichBlocker(facts)).toBeNull()
    expect(enrichBlocker({ ...facts, saved: false })).toMatch(/^Save the page first/)
    expect(enrichBlocker({ ...facts, admin: false })).toBe('Enrichment is run by an admin.')
    expect(enrichBlocker({ ...facts, lockedBy: 'editor:ola@fjord.example' })).toBe(
      'ola@fjord.example is editing: enrichment waits until they finish.',
    )
    expect(enrichBlocker({ ...facts, defaultLocale: false })).toMatch(/the EN version/)
    expect(enrichBlocker({ ...facts, defaultLocale: false, defaultLocaleName: null })).toMatch(
      /^The site's locales could not be read/,
    )
    expect(enrichBlocker({ ...facts, dirty: true })).toMatch(/^Save or discard your changes/)
  })

  it('reads what a job did for the document', () => {
    const status = (
      item: Partial<EnrichStatusResponse['items'][number]>,
    ): EnrichStatusResponse => ({
      jobId: 'j',
      status: 'complete',
      type: 'archetype',
      progress: { total: 1, completed: 1, skipped: 0, errors: 0, current: null },
      items: [{ collection: 'pages', slug: 'pricing', status: 'complete', ...item }],
      usage: { inputTokens: 0, outputTokens: 0, model: null },
    })
    const target = { collection: 'pages', slug: 'pricing' }
    expect(stepOutcome('archetype', status({ result: '3 properties' }), target)).toEqual({
      step: 'archetype',
      state: 'generated',
      text: '3 properties',
    })
    expect(
      stepOutcome('archetype', status({ status: 'skipped', result: 'Already has it' }), target)
        .state,
    ).toBe('skipped')
    expect(stepOutcome('archetype', status({ status: 'error', error: 'No key' }), target)).toEqual({
      step: 'archetype',
      state: 'error',
      text: 'No key',
    })
    expect(stepOutcome('archetype', status({ slug: 'other' }), target).text).toBe(
      'Not part of the job',
    )
  })

  it('reads the document again only when the meta description was written', () => {
    const outcome = (step: 'meta-descriptions' | 'archetype', state: 'generated' | 'skipped') => ({
      step,
      state,
      text: '',
    })
    expect(changedContent([outcome('meta-descriptions', 'generated')])).toBe(true)
    expect(
      changedContent([outcome('meta-descriptions', 'skipped'), outcome('archetype', 'generated')]),
    ).toBe(false)
  })
})

describe('history', () => {
  it('marks the live and the current version', () => {
    expect(versionChips(4, { version: 5, liveVersion: 4 })).toEqual({ live: true, current: false })
    expect(versionChips(5, { version: 5, liveVersion: 5 })).toEqual({ live: true, current: true })
    expect(versionChips(3, { version: 5, liveVersion: null })).toEqual({
      live: false,
      current: false,
    })
  })

  it('compares with the form as the version after the newest, and says what a restore does', () => {
    const versions = [{ version: 5, changedBy: null, createdAt: '' }]
    const form = formAsVersion(versions, {
      metadata: {},
      fields: { title: 'T' },
      body: 'B',
    })
    expect(form.version).toBe(6)
    expect(form.fields).toEqual({ title: 'T' })
    expect(restoreMessage(2, false)).toMatch(/^v2 is saved again as the newest version/)
    expect(restoreMessage(2, true)).toMatch(/Your unsaved changes in the form will be lost\.$/)
    expect(restoreFailed(2, 'Locked')).toBe('v2 could not be restored: Locked')
    expect(refreshFailed(2, 5)).toMatch(
      /^v2 was restored as v5, but the page could not be refreshed/,
    )
  })
})

describe('findings and rich results', () => {
  it('groups findings: the page’s checks, Schema.org, then each reader, errors first', () => {
    const groups = findingGroups(
      [
        { severity: 'warning', check: 'structured-data', message: 'w', reader: 'google' },
        { severity: 'error', check: 'structured-data', message: 'e', reader: 'google' },
        { severity: 'warning', check: 'meta-description', message: 'm' },
        { severity: 'error', check: 'structured-data', message: 's' },
      ],
      [
        { id: 'google', name: 'Google' },
        { id: 'bing', name: 'Bing' },
      ],
    )
    expect(groups.map((g) => [g.label, g.findings.map((f) => f.message)])).toEqual([
      ['Title and meta description', ['m']],
      ['Schema.org', ['s']],
      ['Google', ['e', 'w']],
      ['Bing', []],
    ])
  })
})
