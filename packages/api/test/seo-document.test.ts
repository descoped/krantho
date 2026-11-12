import { KranthoConfigError } from '@krantho/config'
import { registerProfile } from '@krantho/seo'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveSeoConfig, seoCatalog } from '../src/handlers/seo-config.js'
import { seoFindings, seoResolved, seoSiteFindings } from '../src/handlers/seo-document.js'
import { seoRobots } from '../src/handlers/seo-robots.js'
import { composePageJsonLd, routeMatches } from '../src/seo-compose.js'
import { isSeoModuleMissing, startSeo } from '../src/seo-subsystem.js'
import type { ApiRequest } from '../src/types.js'
import { admin, viewer } from './assistant/auth.js'
import { testConfig, testContext, testStores } from './assistant/fixtures.js'

function documentRequest(collection: string, slug: string): ApiRequest {
  return { method: 'GET', path: '/api/seo', params: { collection, slug }, query: {} }
}

const siteRequest: ApiRequest = { method: 'GET', path: '/api/seo/findings', params: {}, query: {} }

interface ResolvedBody {
  entities: Array<{
    type: string
    properties: Array<{ property: string; value: unknown; source: string; editable: boolean }>
  }>
}

describe('GET /api/seo/resolved/:collection/:slug', () => {
  it('names the source of every property the structured data carries', async () => {
    const stores = testStores()
    await stores.seo.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Article', properties: { headline: 'Set by hand' } }] },
    })
    await stores.adapter.seed(
      {
        collection: 'pages',
        slug: 'about',
        fields: { title: 'About', description: 'Who we are' },
        metadata: {
          seo: { entities: [{ '@type': 'Article', properties: { alternativeHeadline: 'Mine' } }] },
        },
      },
      'draft',
    )
    const res = await seoResolved(documentRequest('pages', 'about'), testContext(viewer, stores))

    expect(res.status).toBe(200)
    const article = (res.body as ResolvedBody).entities.find((e) => e.type === 'Article')
    const byName = new Map(article?.properties.map((p) => [p.property, p]))
    expect(byName.get('headline')).toMatchObject({ value: 'Set by hand', source: 'manual' })
    expect(byName.get('description')).toMatchObject({ value: 'Who we are', source: 'auto' })
    expect(byName.get('url')).toMatchObject({
      value: 'https://example.com/about',
      source: 'computed',
    })
  })

  it('names the scope each value comes from: collection, URL pattern, document or computed', async () => {
    const stores = testStores()
    await stores.seo.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Article', properties: { headline: 'Collection' } }] },
    })
    await stores.seo.saveConfig({
      id: 'route:/*',
      scope: 'route',
      config: { entities: [{ '@type': 'Article', properties: { about: 'Pattern' } }] },
    })
    await stores.seo.saveConfig({
      id: 'route:/blog/*',
      scope: 'route',
      config: { entities: [{ '@type': 'Article', properties: { about: 'Not this page' } }] },
    })
    await stores.adapter.seed(
      {
        collection: 'pages',
        slug: 'about',
        fields: { title: 'About', description: 'Who we are' },
        metadata: {
          seo: { entities: [{ '@type': 'Article', properties: { alternativeHeadline: 'Mine' } }] },
        },
      },
      'draft',
    )
    const res = await seoResolved(documentRequest('pages', 'about'), testContext(viewer, stores))

    const article = (res.body as ResolvedBody).entities.find((e) => e.type === 'Article')
    const byName = new Map(article?.properties.map((p) => [p.property, p]))
    expect(byName.get('headline')).toMatchObject({ scope: 'collection' })
    expect(byName.get('about')).toMatchObject({ value: 'Pattern', scope: 'route' })
    expect(byName.get('alternativeHeadline')).toMatchObject({ scope: 'document' })
    expect(byName.get('description')).toMatchObject({ scope: 'document' })
    expect(byName.get('url')).toMatchObject({ scope: 'computed' })
  })

  it('answers 404 for a document that does not exist, and 401 without a signed-in user', async () => {
    const stores = testStores()
    const missing = await seoResolved(documentRequest('pages', 'nope'), testContext(viewer, stores))
    expect(missing.status).toBe(404)
    const anonymous = await seoResolved(
      documentRequest('pages', 'nope'),
      testContext(undefined, stores),
    )
    expect(anonymous.status).toBe(401)
  })
})

describe('GET /api/seo/findings/:collection/:slug', () => {
  it("returns the document's findings, structured-data ones naming their reader", async () => {
    const stores = testStores()
    await stores.seo.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Event', properties: {} }] },
    })
    await stores.adapter.seed(
      { collection: 'pages', slug: 'talk', fields: { title: 'Talk' } },
      'draft',
    )
    const res = await seoFindings(documentRequest('pages', 'talk'), testContext(viewer, stores))

    expect(res.status).toBe(200)
    const { findings, readers } = res.body as {
      findings: Array<Record<string, unknown>>
      readers: Array<{ id: string; name: string }>
    }
    expect(readers).toEqual([
      { id: 'google', name: 'Google' },
      { id: 'bing', name: 'Bing' },
    ])
    expect(findings).toContainEqual(
      expect.objectContaining({
        check: 'structured-data',
        reader: 'google',
        property: 'startDate',
      }),
    )
  })

  it('answers 404 for a document that does not exist', async () => {
    const res = await seoFindings(
      documentRequest('pages', 'nope'),
      testContext(viewer, testStores()),
    )
    expect(res.status).toBe(404)
  })
})

describe('routeMatches', () => {
  it('matches one segment for *, any rest of the path for **, and literals exactly', () => {
    expect(routeMatches('/blog/*', '/blog/hello')).toBe(true)
    expect(routeMatches('/blog/*', '/blog/2026/hello')).toBe(false)
    expect(routeMatches('/docs/**', '/docs/guides/install')).toBe(true)
    expect(routeMatches('/about', '/about')).toBe(true)
    expect(routeMatches('/about', '/about-us')).toBe(false)
    expect(routeMatches('/v1.0/*', '/v1x0/a')).toBe(false)
  })
})

describe('GET /api/seo/findings', () => {
  it('summarises every live page per reader, with the search features it can appear in', async () => {
    const stores = testStores()
    await stores.seo.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Event', properties: {} }] },
    })
    await stores.adapter.seed(
      { collection: 'pages', slug: 'talk', fields: { title: 'Talk' } },
      'published',
    )
    await stores.adapter.seed(
      { collection: 'pages', slug: 'unseen', fields: { title: 'Unseen' } },
      'draft',
    )
    const res = await seoSiteFindings(siteRequest, testContext(viewer, stores))

    expect(res.status).toBe(200)
    const { pages, readers } = res.body as {
      pages: Array<{
        slug: string
        path: string
        readers: Record<string, { errors: number; warnings: number; info: number }>
        features: Array<{ reader: string; type: string; eligible: boolean; missing: string[] }>
      }>
      readers: Array<{ id: string }>
    }
    expect(readers.map((reader) => reader.id)).toEqual(['google', 'bing'])
    expect(pages.map((page) => page.slug)).toEqual(['talk'])
    const [talk] = pages
    expect(talk?.path).toBe('/talk')
    expect(talk?.readers['page']?.errors).toBe(1)
    const google = talk?.readers['google']
    expect((google?.errors ?? 0) + (google?.warnings ?? 0)).toBeGreaterThan(0)
    expect(talk?.features).toContainEqual(
      expect.objectContaining({ reader: 'google', type: 'Event', eligible: false }),
    )
  })

  it('reads the SEO configuration once however many pages it summarises, and the pages as summaries', async () => {
    const stores = testStores()
    await stores.seo.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Article', properties: {} }] },
    })
    for (const slug of ['one', 'two', 'three', 'four']) {
      await stores.adapter.seed({ collection: 'pages', slug, fields: { title: slug } }, 'published')
    }
    const getConfig = vi.spyOn(stores.seo, 'getConfig')
    const listConfigs = vi.spyOn(stores.seo, 'listConfigs')

    const res = await seoSiteFindings(siteRequest, testContext(viewer, stores))

    expect((res.body as { pages: unknown[] }).pages).toHaveLength(4)
    expect(listConfigs).toHaveBeenCalledTimes(1)
    expect(getConfig).not.toHaveBeenCalled()
    // One read serves every page-rendering collection, as summaries: the metadata the findings
    // need, without bodies or HTML
    expect(stores.adapter.queries).toHaveLength(1)
    expect(stores.adapter.queries[0]).toMatchObject({
      state: 'published',
      projection: 'summary',
      locale: 'en',
    })
  })

  it('refuses a request without a signed-in user', async () => {
    const res = await seoSiteFindings(siteRequest, testContext(undefined, testStores()))
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/seo/config/:id', () => {
  it('refuses types that are unknown, superseded or retired, and keeps what was stored', async () => {
    const stores = testStores()
    const req: ApiRequest = {
      method: 'PUT',
      path: '/api/seo/config/collection:pages',
      params: { id: 'collection:pages' },
      query: {},
      body: { config: { entities: [{ '@type': 'Atricle' }, { '@type': 'Code' }] } },
    }
    const res = await saveSeoConfig(req, testContext(admin, stores))

    expect(res.status).toBe(400)
    const { issues } = res.body as { issues: string[] }
    expect(issues).toEqual([
      '"Atricle" is not a Schema.org type',
      '"Code" is superseded by "SoftwareSourceCode" in Schema.org',
    ])
    expect(await stores.seo.getConfig('collection:pages')).toBeNull()
  })
})

describe('PUT /api/seo/config/:id with a page structure', () => {
  function save(structure: unknown): ApiRequest {
    return {
      method: 'PUT',
      path: '/api/seo/config/collection:docs',
      params: { id: 'collection:docs' },
      query: {},
      body: { config: { entities: [{ '@type': 'Article' }], structure } },
    }
  }

  it('stores the trail and kind a collection gives its pages', async () => {
    const stores = testStores()
    const structure = { trail: [{ name: 'Docs', url: '/docs' }], kind: 'item' }
    const res = await saveSeoConfig(save(structure), testContext(admin, stores))

    expect(res.status).toBe(200)
    expect((await stores.seo.getConfig('collection:docs'))?.config.structure).toEqual(structure)
  })

  it('refuses a malformed structure', async () => {
    const stores = testStores()
    const res = await saveSeoConfig(save({ trail: [{ url: '/docs' }] }), testContext(admin, stores))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/seo/catalog?type=', () => {
  it("returns each active reader's rule for the type with its source", async () => {
    const req: ApiRequest = {
      method: 'GET',
      path: '/api/seo/catalog',
      params: {},
      query: { type: 'Event' },
    }
    const res = await seoCatalog(req, testContext(viewer, testStores()))

    expect(res.status).toBe(200)
    const { rules } = res.body as { rules: Array<Record<string, unknown>> }
    expect(rules).toEqual([
      expect.objectContaining({ reader: 'google', type: 'Event', status: 'active' }),
    ])
    expect(rules[0]?.['source']).toMatch(/^https:\/\/developers\.google\.com\//)
  })
})

describe('startSeo', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    vi.restoreAllMocks()
  })

  it('logs the identity values a reader recommends as warnings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await startSeo(testConfig({ seo: { identity: 'Organization' } }))

    const lines = warn.mock.calls.map(([line]) => String(line))
    expect(lines.some((line) => line.includes('KRANTHO_SITE_LOGO (site.logo)'))).toBe(true)
  })

  it('stops the site on an identity value a reader requires, naming its environment variable', async () => {
    restore = registerProfile({
      id: 'strict',
      name: 'Strict',
      rules: [
        {
          type: 'Organization',
          status: 'active',
          required: ['logo'],
          source: 'https://example.org/rules',
          verifiedAt: '2026-10-02',
        },
      ],
    })
    const config = testConfig({ seo: { identity: 'Organization', readers: ['strict'] } })

    const error = await startSeo(config).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(KranthoConfigError)
    expect((error as Error).message).toContain('KRANTHO_SITE_LOGO (site.logo)')
  })
})

describe('isSeoModuleMissing', () => {
  it('recognizes @krantho/seo missing, as Node and a bundler report it', () => {
    const node = new Error("Cannot find package '@krantho/seo' imported from /srv/site/x.js")
    const bundler = new Error("Cannot find module '@krantho/seo'")
    expect(isSeoModuleMissing(node)).toBe(true)
    expect(isSeoModuleMissing(bundler)).toBe(true)
  })

  it('does not mistake a dependency missing inside the package for it', () => {
    const inside = new Error(
      "Cannot find package 'yaml' imported from /srv/node_modules/@krantho/seo/dist/index.js",
    )
    expect(isSeoModuleMissing(inside)).toBe(false)
    expect(isSeoModuleMissing(new Error('Template not found'))).toBe(false)
  })
})

describe('a page with no SEO configuration', () => {
  it('resolves the same entities and values the page composes', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'plain', fields: { title: 'Plain', description: 'A page.' } },
      'draft',
    )
    const ctx = testContext(viewer, stores)
    const res = await seoResolved(documentRequest('pages', 'plain'), ctx)
    const resolved = (res.body as ResolvedBody).entities
    const current = await stores.adapter.getContent('pages', 'plain', 'en')
    const graph = (await composePageJsonLd({
      collection: 'pages',
      slug: 'plain',
      path: '/plain',
      fields: current?.fields ?? {},
      documentMeta: current?.meta,
      config: ctx.config,
      seoConfigs: stores.seo,
    })) as { '@graph': Array<Record<string, unknown>> }

    for (const entity of resolved) {
      const node = graph['@graph'].find((candidate) => candidate['@type'] === entity.type)
      expect(node, entity.type).toBeDefined()
      for (const property of entity.properties) {
        expect(node?.[property.property], `${entity.type}.${property.property}`).toBeDefined()
      }
    }
  })
})

describe('the robots.txt override in the site configuration', () => {
  const OVERRIDE = 'User-agent: *\nDisallow: /private/'

  function saveSite(config: Record<string, unknown>, id = 'site'): ApiRequest {
    return {
      method: 'PUT',
      path: `/api/seo/config/${id}`,
      params: { id },
      query: {},
      body: { config },
    }
  }

  it('is served as robots.txt, beside the entities and never among them', async () => {
    const stores = testStores()
    const ctx = testContext(admin, stores)
    const entities = [{ '@type': 'Organization', properties: { name: 'Example' } }]
    expect((await saveSeoConfig(saveSite({ entities, robotsTxt: OVERRIDE }), ctx)).status).toBe(200)
    expect((await stores.seo.getConfig('site'))?.config).toEqual({ entities, robotsTxt: OVERRIDE })
    const robots = await seoRobots(
      { method: 'GET', path: '/api/seo/robots.txt', params: {}, query: {} },
      ctx,
    )
    expect(robots.body).toBe(OVERRIDE)
  })

  it('stays out of every page graph, its resolved values and the findings', async () => {
    const stores = testStores()
    const ctx = testContext(admin, stores)
    const entities = [{ '@type': 'Organization', properties: { name: 'Example' } }]
    await saveSeoConfig(saveSite({ entities, robotsTxt: OVERRIDE }), ctx)
    await stores.adapter.seed(
      {
        collection: 'pages',
        slug: 'about',
        fields: { title: 'About', description: 'Who we are' },
        metadata: {
          seo: { entities: [{ '@type': 'Article', properties: { alternativeHeadline: 'Mine' } }] },
        },
      },
      'published',
    )
    const graph = await composePageJsonLd({
      collection: 'pages',
      slug: 'about',
      path: '/about',
      fields: { title: 'About' },
      config: ctx.config,
      seoConfigs: stores.seo,
    })
    const nodes = (graph as { '@graph': Array<Record<string, unknown>> })['@graph']
    expect(nodes.find((node) => node['@type'] === 'Organization')?.['name']).toBe('Example')
    const resolved = await seoResolved(documentRequest('pages', 'about'), ctx)
    const findings = await seoSiteFindings(siteRequest, ctx)
    for (const answer of [graph, resolved.body, findings.body]) {
      expect(JSON.stringify(answer)).not.toContain('Disallow: /private/')
      expect(JSON.stringify(answer)).not.toContain('robots')
    }
  })

  it('creates no entity when the site has no SEO settings yet', async () => {
    const stores = testStores()
    const res = await saveSeoConfig(
      saveSite({ entities: [], robotsTxt: OVERRIDE }),
      testContext(admin, stores),
    )
    expect(res.status).toBe(200)
    expect((await stores.seo.getConfig('site'))?.config).toEqual({
      entities: [],
      robotsTxt: OVERRIDE,
    })
  })

  it('belongs to the site scope only, and is text', async () => {
    const stores = testStores()
    const ctx = testContext(admin, stores)
    const onCollection = saveSite({ entities: [], robotsTxt: OVERRIDE }, 'collection:pages')
    expect((await saveSeoConfig(onCollection, ctx)).status).toBe(400)
    expect((await saveSeoConfig(saveSite({ entities: [], robotsTxt: 7 }), ctx)).status).toBe(400)
    expect(await stores.seo.getConfig('collection:pages')).toBeNull()
  })
})
