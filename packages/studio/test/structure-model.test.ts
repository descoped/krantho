import { describe, expect, it } from 'vitest'
import { nodeViews, resolvedById } from '../src/editor/data-mode/provenance.js'
import type { PageSeoSummary, ResolvedEntity, SeoConfig, SeoConfigData } from '../src/lib/api.js'
import { llmsOriginText, parseSitemap, servedFrom } from '../src/structure/crawlers-model.js'
import { legendKinds, linkLines, pageGraph, pageScopes } from '../src/structure/graph-model.js'
import { cardState, richCards, richTotals } from '../src/structure/rich-results-model.js'
import {
  archetypeChoices,
  cascadeCounts,
  catalogGroups,
  identityRows,
  withTypes,
} from '../src/structure/scopes-model.js'
import { servedGraph } from '../src/structure/served-graph.js'
import { introFigures } from '../src/structure/structure-model.js'
import type { Catalog, StructureBase } from '../src/structure/structure-sources.js'
import {
  ABOUT_ARTICLE_ID,
  ABOUT_BREADCRUMB_ID,
  ABOUT_WEBPAGE_ID,
  BUSINESS_ID,
  CATALOG,
  CONFIGS,
  WEBSITE_ID,
} from './fixtures/structure-data.js'
import {
  ABOUT_RESOLVED,
  ABOUT_SERVED,
  LLMS,
  pageHtml,
  SITE_FINDINGS,
  SITEMAP_XML,
} from './fixtures/structure-pages.js'

const pages = SITE_FINDINGS.pages as unknown as PageSeoSummary[]
const configs = CONFIGS as unknown as SeoConfig[]
const catalog = CATALOG as unknown as Catalog
const SITE_ONLY = new Set(['ProfessionalService', 'WebSite'])

function aboutGraph() {
  const served = servedGraph(pageHtml(ABOUT_SERVED))
  const about = pages.find((page) => page.slug === 'about')
  return pageGraph({
    nodes: served.nodes,
    resolved: ABOUT_RESOLVED.entities as unknown as ResolvedEntity[],
    siteTypes: new Set(['ProfessionalService', 'WebSite', 'Person']),
    scopes: pageScopes(configs, 'pages', 'about'),
    features: about?.features ?? [],
  })
}

describe('the JSON-LD a page serves', () => {
  it('reads every ld+json script of the HTML, and counts one that is not JSON', () => {
    const html = pageHtml(ABOUT_SERVED, { '@type': 'Event', name: 'Talk' }).replace(
      '</head>',
      '<script type="application/ld+json">{ broken</script></head>',
    )
    const graph = servedGraph(html)
    expect(graph.scripts).toHaveLength(2)
    expect(graph.nodes.map((node) => node['@type'])).toEqual([
      'ProfessionalService',
      'WebSite',
      'Article',
      'BreadcrumbList',
      'WebPage',
      'Event',
    ])
    expect(graph.unreadable).toBe(1)
  })
})

describe('a page graph', () => {
  it('names where each node comes from: site, the page’s own settings, the collection, or derived', () => {
    const kinds = Object.fromEntries(aboutGraph().nodes.map((node) => [node.id, node.kind]))
    expect(kinds).toEqual({
      [BUSINESS_ID]: 'site',
      [WEBSITE_ID]: 'site',
      // The about page's own settings name Article
      [ABOUT_ARTICLE_ID]: 'document',
      [ABOUT_BREADCRUMB_ID]: 'collection',
      // krantho composes the WebPage; /resolved does not list it
      [ABOUT_WEBPAGE_ID]: 'derived',
    })
  })

  it('names a type a URL pattern gives as the URL pattern’s', () => {
    const graph = pageGraph({
      nodes: [{ '@type': 'Service', '@id': 'svc', name: 'Strategy' }],
      resolved: [{ type: 'Service', id: 'svc', level: 'document', properties: [] }],
      siteTypes: new Set(),
      scopes: pageScopes(configs, 'pages', 'pricing'),
      features: [],
    })
    expect(graph.nodes[0]?.kind).toBe('route')
  })

  it('links nodes by the property that references them, each edge once per property', () => {
    const graph = aboutGraph()
    const edges = graph.edges.map((e) => `${e.from} ${e.property} ${e.to}`)
    expect(edges).toContain(`${WEBSITE_ID} publisher ${BUSINESS_ID}`)
    expect(edges).toContain(`${ABOUT_ARTICLE_ID} isPartOf ${WEBSITE_ID}`)
    expect(edges).toContain(`${ABOUT_WEBPAGE_ID} breadcrumb ${ABOUT_BREADCRUMB_ID}`)
    expect(linkLines(graph, ABOUT_WEBPAGE_ID)).toEqual([
      'isPartOf → WebSite',
      'mainEntity → Article',
      'breadcrumb → BreadcrumbList',
    ])
  })

  it('gives each node its property count, its features and what they lack', () => {
    const business = aboutGraph().nodes.find((node) => node.id === BUSINESS_ID)
    expect(business?.propertyCount).toBe(3)
    expect(business?.features.map((f) => f.feature)).toEqual(['Local business'])
    expect(business?.missing).toEqual(['address'])
    // Each value carries the scope /resolved names for it: the site's settings and its config
    const rows = Object.fromEntries((business?.view.rows ?? []).map((row) => [row.key, row.scope]))
    expect(rows).toEqual({ name: 'site', url: 'site', telephone: 'site' })
  })

  it('shows the four legend kinds, and URL pattern only when a node has it', () => {
    expect(legendKinds(aboutGraph())).toEqual(['site', 'collection', 'document', 'derived'])
  })
})

describe('rich results across the site', () => {
  const cards = richCards(pages, SITE_FINDINGS.readers, SITE_ONLY)

  it('makes one card per reader feature, with eligible pages out of applicable', () => {
    const summary = cards.map((card) => [
      card.feature,
      card.eligible,
      card.applicable,
      cardState(card),
    ])
    expect(summary).toEqual([
      ['Article', 1, 2, 'partly'],
      ['Breadcrumb', 1, 1, 'eligible'],
      ['Local business', 0, 3, 'not-eligible'],
      ['Site names', 3, 3, 'eligible'],
    ])
    expect(richTotals(cards)).toEqual({ eligible: 5, applicable: 9 })
  })

  it('says what is missing, on which pages, and where it is fixed', () => {
    const local = cards.find((card) => card.feature === 'Local business')
    expect(local?.missing).toEqual([
      expect.objectContaining({
        property: 'address',
        type: 'ProfessionalService',
        site: true,
        fix: '/structure/scopes#scope-site',
        pages: [
          { collection: 'pages', slug: 'about', path: '/about' },
          { collection: 'pages', slug: 'home', path: '/' },
          { collection: 'services', slug: 'strategy', path: '/services/strategy' },
        ],
      }),
    ])
    const article = cards.find((card) => card.feature === 'Article')
    expect(article?.missing[0]).toMatchObject({
      property: 'headline',
      site: false,
      fix: '/site/pages/home?mode=data',
    })
    expect(article?.source).toContain('structured-data/article')
    expect(cards.find((card) => card.feature === 'Site names')?.conditions).toEqual([
      'On the home page',
    ])
  })
})

describe('rich results the rules show that no page uses yet', () => {
  const readers = SITE_FINDINGS.readers
  const types = catalog.types

  it('adds a card for each active or restricted feature of the catalog, never a retired one', () => {
    const cards = richCards(pages, readers, SITE_ONLY, types)
    const unused = cards.filter((card) => card.applicable === 0)
    expect(unused.map((card) => [card.feature, card.status, cardState(card), card.types])).toEqual([
      ['Dataset Search', 'restricted', 'conditional', ['Dataset']],
      ['Event', 'active', 'unused', ['Event']],
    ])
    expect(cards.map((card) => card.feature)).not.toContain('FAQ')
    expect(cards.map((card) => card.feature)).not.toContain('How-to')
    // A feature the pages use keeps the pages' card
    expect(cards.filter((card) => card.feature === 'Article')).toHaveLength(1)
  })

  it('has no card at all only when the rules list no feature they show', () => {
    const retiredOnly = types.filter((type) => type.richResultStatus === 'retired')
    expect(richCards([], readers, SITE_ONLY, retiredOnly)).toEqual([])
    expect(richCards([], readers, SITE_ONLY, types)).not.toEqual([])
  })

  it('takes the catalog as Google’s rules, so adds nothing when Google is not a reader', () => {
    const bing = [{ id: 'bing', name: 'Bing' }]
    expect(richCards([], bing, SITE_ONLY, types)).toEqual([])
  })
})

describe('/resolved joined by @id', () => {
  // A document entity saved with no role beside its collection's: the real
  // resolution lists the same @id twice, the document's last
  const twice: ResolvedEntity[] = [
    {
      type: 'Article',
      id: ABOUT_ARTICLE_ID,
      level: 'document',
      properties: [
        {
          property: 'headline',
          value: 'About us',
          source: 'auto',
          scope: 'document',
          origin: 'the content field "title"',
          editable: true,
        },
        {
          property: 'articleSection',
          value: 'News',
          source: 'manual',
          scope: 'collection',
          origin: 'the SEO settings',
          editable: true,
        },
      ],
    },
    {
      type: 'Article',
      id: ABOUT_ARTICLE_ID,
      level: 'document',
      properties: [
        {
          property: 'about',
          value: 'Us',
          source: 'manual',
          scope: 'document',
          origin: 'the SEO settings',
          editable: true,
        },
        {
          property: 'articleSection',
          value: 'Notes',
          source: 'manual',
          scope: 'document',
          origin: 'the SEO settings',
          editable: true,
        },
      ],
    },
  ]

  it('merges an @id listed twice: every property, the document scope winning', () => {
    const merged = resolvedById(twice).get(ABOUT_ARTICLE_ID)
    const byKey = Object.fromEntries((merged?.properties ?? []).map((p) => [p.property, p.scope]))
    expect(byKey).toEqual({ headline: 'document', articleSection: 'document', about: 'document' })
    // The same answer whichever order the duplicates come in
    const reversed = resolvedById([...twice].reverse()).get(ABOUT_ARTICLE_ID)
    const section = reversed?.properties.find((p) => p.property === 'articleSection')
    expect(section?.value).toBe('Notes')
  })

  it('gives each emitted value of a merged node its source', () => {
    const [view] = nodeViews({
      nodes: [{ '@type': 'Article', '@id': ABOUT_ARTICLE_ID, headline: 'About us', about: 'Us' }],
      resolved: twice,
      siteTypes: new Set(),
    })
    expect(view?.rows.map((row) => [row.key, row.scope, row.origin])).toEqual([
      ['headline', 'document', 'the content field "title"'],
      ['about', 'document', 'the SEO settings'],
    ])
  })
})

describe('the intro band', () => {
  const base = {
    configs: { state: 'ok', value: configs },
    catalog: { state: 'ok', value: catalog },
  } as unknown as StructureBase

  it('counts valid graphs and eligible rich results from the findings, site entities from the settings', () => {
    const figures = introFigures(base, {
      state: 'ready',
      data: { pages, readers: SITE_FINDINGS.readers },
    })
    expect(figures).toEqual({
      graphs: { valid: 1, pages: 3 },
      siteEntities: 2,
      rich: { eligible: 5, applicable: 9 },
    })
  })

  it('leaves out a figure whose source was not read, never zero', () => {
    const unread = { ...base, configs: { state: 'failed' } } as unknown as StructureBase
    expect(introFigures(unread, { state: 'error', message: 'down' })).toEqual({
      graphs: null,
      siteEntities: null,
      rich: null,
    })
  })
})

describe('scopes and archetypes', () => {
  it('counts what each of the four scopes holds', () => {
    expect(cascadeCounts({ state: 'ok', value: configs })).toEqual({
      siteEntities: 2,
      collections: 2,
      routes: 1,
      documents: 1,
    })
    expect(cascadeCounts({ state: 'failed' })).toBeNull()
  })

  it('names the setting in krantho.config.ts for each identity value', () => {
    const rows = identityRows({
      name: 'Fjord Studio',
      domain: 'fjord.example',
      language: 'en',
      baseUrl: 'https://fjord.example',
      supportedLocales: ['en'],
      defaultLocale: 'en',
      sameAs: [],
    })
    expect(rows[0]).toEqual({ label: 'Name', value: 'Fjord Studio', setting: 'site.name' })
    expect(rows.find((row) => row.setting === 'site.logo')?.value).toBeNull()
  })

  it('keeps a kept type’s entity, the field mappings and the structure when the types change', () => {
    const current: SeoConfigData = {
      entities: [{ '@type': 'Article', role: 'primary', properties: { articleSection: 'News' } }],
      fieldMappings: { headline: 'title' },
      structure: { kind: 'item' },
    }
    expect(withTypes(current, ['Article', 'BreadcrumbList'])).toEqual({
      entities: [
        { '@type': 'Article', role: 'primary', properties: { articleSection: 'News' } },
        { '@type': 'BreadcrumbList', properties: {} },
      ],
      fieldMappings: { headline: 'title' },
      structure: { kind: 'item' },
    })
  })

  it('leaves every type with a retired feature out of the catalog', () => {
    const types = catalogGroups(catalog).flatMap((group) => group.types.map((t) => t.type))
    expect(types).not.toContain('FAQPage')
    expect(types).not.toContain('HowTo')
    expect(types).toEqual(expect.arrayContaining(['Article', 'Service', 'Dataset', 'WebSite']))
  })

  it('offers page types only, a retired one only while a collection still has it', () => {
    const offered = (chosen: string[]): string[] =>
      archetypeChoices(catalog, new Set(chosen)).flatMap((g) => g.types.map((t) => t.type))
    expect(offered([])).not.toContain('FAQPage')
    expect(offered([])).not.toContain('WebSite')
    expect(offered(['FAQPage'])).toContain('FAQPage')
  })
})

describe('crawler files', () => {
  it('reads a served sitemap’s URLs, and refuses what is not a sitemap', () => {
    expect(parseSitemap(SITEMAP_XML)).toEqual([
      {
        loc: 'https://fjord.example/',
        lastmod: '2026-10-02T23:42:05.515Z',
        changefreq: 'weekly',
        priority: '1.0',
      },
      {
        loc: 'https://fjord.example/about',
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: undefined,
      },
    ])
    expect(parseSitemap('<html><body>Not found</body></html>')).toBeNull()
  })

  it('tells krantho’s llms.txt from the site’s own, and names where it comes from', () => {
    const served = (text: string, status = 200) => ({ path: '/llms.txt', status, text })
    expect(servedFrom(served(LLMS), LLMS.trimEnd())).toBe('krantho')
    expect(servedFrom(served('# Other'), LLMS)).toBe('own')
    expect(servedFrom(served('', 404), LLMS)).toBe('none')
    expect(llmsOriginText('krantho', 'generated')).toContain('built from the live pages')
    expect(llmsOriginText('krantho', 'snapshot')).toContain('snapshot saved through the assistant')
    expect(llmsOriginText('own', 'generated')).toContain("site's own /llms.txt route")
  })

  it('claims no origin it was not told', () => {
    for (const text of [llmsOriginText('krantho', null), llmsOriginText(null, 'generated')]) {
      expect(text).toContain('could not be determined')
      expect(text).not.toContain('built from the live pages')
    }
  })
})
