import { describe, expect, it } from 'vitest'
import {
  buildDefaultRobotsBody,
  loadRobotsOverride,
  robotsOverrideConfigId,
} from '../src/handlers/seo-robots.js'
import {
  buildSitemapUrls,
  SITEMAP_PUBLIC_PATH,
  type SitemapUrl,
  serializeSitemapXml,
} from '../src/handlers/seo-sitemap.js'
import type { ApiContext } from '../src/types.js'

describe('buildDefaultRobotsBody', () => {
  it('produces a standard User-agent: * body naming the sitemap at the site root', () => {
    const body = buildDefaultRobotsBody('https://example.com')
    expect(body).toContain('User-agent: *')
    expect(body).toContain('Allow: /')
    expect(body).toContain(`Sitemap: https://example.com${SITEMAP_PUBLIC_PATH}`)
  })

  it('strips a trailing slash from the base URL before composing the sitemap line', () => {
    const body = buildDefaultRobotsBody('https://example.com/')
    expect(body).toContain(`Sitemap: https://example.com${SITEMAP_PUBLIC_PATH}`)
    expect(body).not.toContain(`https://example.com/${SITEMAP_PUBLIC_PATH}`)
  })

  it('produces a predictable four-line body with a blank separator', () => {
    const body = buildDefaultRobotsBody('https://example.com')
    const lines = body.split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('User-agent: *')
    expect(lines[1]).toBe('Allow: /')
    expect(lines[2]).toBe('')
    expect(lines[3]).toBe('Sitemap: https://example.com/sitemap.xml')
  })
})

describe('robotsOverrideConfigId', () => {
  it('uses the site-level scope (no new scope needed)', () => {
    // The override is the site config's `robotsTxt`, beside its entities,
    // rather than a new seo_config scope + CHECK migration.
    expect(robotsOverrideConfigId).toBe('site')
  })
})

describe('loadRobotsOverride', () => {
  it('returns null when no seoConfigAdapter is present', async () => {
    const ctx = {
      config: {
        site: {
          baseUrl: 'https://example.com',
          domain: 'example.com',
          name: 'Test',
          language: 'en',
        },
      },
    } as unknown as ApiContext
    const result = await loadRobotsOverride(ctx)
    expect(result).toBeNull()
  })

  it('returns the override text the site config holds as robotsTxt', async () => {
    const overrideText = 'User-agent: *\nDisallow: /private/'
    const ctx = {
      config: {
        site: {
          baseUrl: 'https://example.com',
          domain: 'example.com',
          name: 'Test',
          language: 'en',
        },
      },
      seoConfigAdapter: {
        getConfig: async (_id: string) => ({
          id: 'site',
          scope: 'site' as const,
          config: {
            entities: [{ '@type': 'Organization', properties: { name: 'Acme' } }],
            robotsTxt: overrideText,
          },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      },
    } as unknown as ApiContext
    const result = await loadRobotsOverride(ctx)
    expect(result).toBe(overrideText)
  })

  it('returns null when the site config holds no robotsTxt', async () => {
    const ctx = {
      config: {
        site: {
          baseUrl: 'https://example.com',
          domain: 'example.com',
          name: 'Test',
          language: 'en',
        },
      },
      seoConfigAdapter: {
        getConfig: async (_id: string) => ({
          id: 'site',
          scope: 'site' as const,
          config: {
            entities: [{ '@type': 'Organization', properties: { name: 'Acme' } }],
          },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      },
    } as unknown as ApiContext
    const result = await loadRobotsOverride(ctx)
    expect(result).toBeNull()
  })

  it('returns null when getConfig throws', async () => {
    const ctx = {
      config: {
        site: {
          baseUrl: 'https://example.com',
          domain: 'example.com',
          name: 'Test',
          language: 'en',
        },
      },
      seoConfigAdapter: {
        getConfig: async () => {
          throw new Error('DB connection failed')
        },
      },
    } as unknown as ApiContext
    const result = await loadRobotsOverride(ctx)
    expect(result).toBeNull()
  })

  it('returns null when getConfig returns null (no site config exists)', async () => {
    const ctx = {
      config: {
        site: {
          baseUrl: 'https://example.com',
          domain: 'example.com',
          name: 'Test',
          language: 'en',
        },
      },
      seoConfigAdapter: {
        getConfig: async () => null,
      },
    } as unknown as ApiContext
    const result = await loadRobotsOverride(ctx)
    expect(result).toBeNull()
  })
})

describe('serializeSitemapXml', () => {
  it('emits a well-formed XML document with the sitemaps.org namespace', () => {
    const xml = serializeSitemapXml([])
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('</urlset>')
  })

  it('renders a single URL with all fields when provided', () => {
    const urls: SitemapUrl[] = [
      {
        loc: 'https://example.com/about',
        lastmod: '2026-04-09T12:00:00.000Z',
        changefreq: 'weekly',
        priority: '0.8',
      },
    ]
    const xml = serializeSitemapXml(urls)
    expect(xml).toContain('<loc>https://example.com/about</loc>')
    expect(xml).toContain('<lastmod>2026-04-09T12:00:00.000Z</lastmod>')
    expect(xml).toContain('<changefreq>weekly</changefreq>')
    expect(xml).toContain('<priority>0.8</priority>')
  })

  it('omits lastmod when not provided', () => {
    const urls: SitemapUrl[] = [
      { loc: 'https://example.com/', changefreq: 'weekly', priority: '1.0' },
    ]
    const xml = serializeSitemapXml(urls)
    expect(xml).not.toContain('<lastmod>')
    expect(xml).toContain('<loc>https://example.com/</loc>')
  })

  it('escapes XML special characters in loc values', () => {
    const urls: SitemapUrl[] = [
      {
        loc: 'https://example.com/search?q=a&b=c<d>e',
        changefreq: 'never',
        priority: '0.1',
      },
    ]
    const xml = serializeSitemapXml(urls)
    expect(xml).toContain('<loc>https://example.com/search?q=a&amp;b=c&lt;d&gt;e</loc>')
    expect(xml).not.toContain('<loc>https://example.com/search?q=a&b=c<d>e</loc>')
  })

  it('renders multiple URLs separated by url elements', () => {
    const urls: SitemapUrl[] = [
      { loc: 'https://example.com/', changefreq: 'weekly', priority: '1.0' },
      { loc: 'https://example.com/about', changefreq: 'monthly', priority: '0.5' },
      { loc: 'https://example.com/contact', changefreq: 'yearly', priority: '0.3' },
    ]
    const xml = serializeSitemapXml(urls)
    // Each URL should produce its own <url> block
    const urlBlocks = xml.match(/<url>/g)
    expect(urlBlocks).toHaveLength(3)
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).toContain('<loc>https://example.com/about</loc>')
    expect(xml).toContain('<loc>https://example.com/contact</loc>')
  })
})

// --- buildSitemapUrls tests ---

interface StubItem {
  meta: { slug: string; collection: string; createdAt?: string }
  fields: Record<string, unknown>
}

interface StubContext {
  /** A collection name, or a name with the page `path` it declares */
  collections: Array<string | { name: string; path: string | false }>
  items: Record<string, StubItem[]>
  skipListPublished?: string[]
  baseUrl?: string
}

function makeStubContext(stub: StubContext): ApiContext {
  const baseUrl = stub.baseUrl ?? 'https://example.com'
  const collections = new Map(
    stub.collections.map((entry) => {
      const { name, path } = typeof entry === 'string' ? { name: entry, path: undefined } : entry
      return [name, { name, directory: `/content/${name}`, path }]
    }),
  )
  // Items stand for the live (published) version of each document
  const query = async (spec: { collections: string[] }): Promise<{ items: StubItem[] }> => {
    const name = spec.collections[0] ?? ''
    if (stub.skipListPublished?.includes(name)) {
      throw new Error('Listing not supported')
    }
    return { items: stub.items[name] ?? [] }
  }

  // Minimal ApiContext shape — only fields that buildSitemapUrls reads.
  return {
    contentConfig: { collections } as unknown as ApiContext['contentConfig'],
    config: {
      site: {
        domain: 'example.com',
        name: 'Example',
        language: 'en',
        baseUrl,
      },
    } as unknown as ApiContext['config'],
    adapter: {
      query,
      getPublished: async () => null,
    } as unknown as ApiContext['adapter'],
    engine: {} as ApiContext['engine'],
  } as ApiContext
}

describe('buildSitemapUrls', () => {
  it('always adds the homepage as the first entry with priority 1.0', async () => {
    const ctx = makeStubContext({ collections: ['pages'], items: { pages: [] } })
    const urls = await buildSitemapUrls(ctx)
    expect(urls[0]).toEqual({
      loc: 'https://example.com/',
      changefreq: 'weekly',
      priority: '1.0',
    })
  })

  it('places `pages` collection items at top-level (/slug) with priority 0.8', async () => {
    const ctx = makeStubContext({
      collections: ['pages'],
      items: {
        pages: [
          {
            meta: { slug: 'about', collection: 'pages' },
            fields: { title: 'About' },
          },
        ],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    const about = urls.find((u) => u.loc.endsWith('/about'))
    expect(about).toBeDefined()
    expect(about?.loc).toBe('https://example.com/about')
    expect(about?.priority).toBe('0.8')
    expect(about?.changefreq).toBe('weekly')
  })

  it('nests non-pages collections under /{collection}/{slug} with priority 0.6', async () => {
    const ctx = makeStubContext({
      collections: ['services'],
      items: {
        services: [
          {
            meta: { slug: 'strategy', collection: 'services' },
            fields: { title: 'Strategy' },
          },
        ],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    const svc = urls.find((u) => u.loc.endsWith('/strategy'))
    expect(svc?.loc).toBe('https://example.com/services/strategy')
    expect(svc?.priority).toBe('0.6')
    expect(svc?.changefreq).toBe('monthly')
  })

  it('skips the `globals` collection entirely', async () => {
    const ctx = makeStubContext({
      collections: ['pages', 'globals'],
      items: {
        pages: [{ meta: { slug: 'about', collection: 'pages' }, fields: { title: 'About' } }],
        globals: [
          { meta: { slug: 'navigation', collection: 'globals' }, fields: { 'nav-home': 'Home' } },
        ],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    expect(urls.some((u) => u.loc.includes('/globals/'))).toBe(false)
    expect(urls.some((u) => u.loc.endsWith('/navigation'))).toBe(false)
    // Homepage + about = 2 entries
    expect(urls).toHaveLength(2)
  })

  it('excludes items with robots-index=false or noindex', async () => {
    const ctx = makeStubContext({
      collections: ['pages'],
      items: {
        pages: [
          { meta: { slug: 'visible', collection: 'pages' }, fields: { title: 'Visible' } },
          {
            meta: { slug: 'hidden-bool', collection: 'pages' },
            fields: { title: 'Hidden', 'robots-index': false },
          },
          {
            meta: { slug: 'hidden-string', collection: 'pages' },
            fields: { title: 'Hidden', 'robots-index': 'false' },
          },
          {
            meta: { slug: 'hidden-noindex', collection: 'pages' },
            fields: { title: 'Hidden', 'robots-index': 'noindex' },
          },
        ],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    expect(urls.some((u) => u.loc.endsWith('/visible'))).toBe(true)
    expect(urls.some((u) => u.loc.endsWith('/hidden-bool'))).toBe(false)
    expect(urls.some((u) => u.loc.endsWith('/hidden-string'))).toBe(false)
    expect(urls.some((u) => u.loc.endsWith('/hidden-noindex'))).toBe(false)
  })

  it('gives lastmod as a full UTC W3C Datetime from createdAt', async () => {
    const ctx = makeStubContext({
      collections: ['pages'],
      items: {
        pages: [
          {
            meta: {
              slug: 'dated',
              collection: 'pages',
              createdAt: '2026-03-15T10:30:00Z',
            },
            fields: { title: 'Dated' },
          },
        ],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    const dated = urls.find((u) => u.loc.endsWith('/dated'))
    expect(dated?.lastmod).toBe('2026-03-15T10:30:00.000Z')
  })

  it('converts a createdAt with an offset to UTC, and omits one that is not a date', async () => {
    const ctx = makeStubContext({
      collections: ['pages'],
      items: {
        pages: [
          {
            meta: { slug: 'oslo', collection: 'pages', createdAt: '2026-10-01T00:17:06+02:00' },
            fields: { title: 'Oslo' },
          },
          {
            meta: { slug: 'broken', collection: 'pages', createdAt: 'not a date' },
            fields: { title: 'Broken' },
          },
        ],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    expect(urls.find((u) => u.loc.endsWith('/oslo'))?.lastmod).toBe('2026-09-30T22:17:06.000Z')
    expect(urls.find((u) => u.loc.endsWith('/broken'))?.lastmod).toBeUndefined()
  })

  it('omits lastmod when createdAt is absent', async () => {
    const ctx = makeStubContext({
      collections: ['pages'],
      items: {
        pages: [{ meta: { slug: 'no-date', collection: 'pages' }, fields: { title: 'No date' } }],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    const noDate = urls.find((u) => u.loc.endsWith('/no-date'))
    expect(noDate).toBeDefined()
    expect(noDate?.lastmod).toBeUndefined()
  })

  it('skips a collection gracefully when listing it throws', async () => {
    const ctx = makeStubContext({
      collections: ['pages', 'broken'],
      items: {
        pages: [{ meta: { slug: 'about', collection: 'pages' }, fields: { title: 'About' } }],
      },
      skipListPublished: ['broken'],
    })
    const urls = await buildSitemapUrls(ctx)
    // Homepage + about = 2 entries (broken collection is silently skipped)
    expect(urls).toHaveLength(2)
    expect(urls.some((u) => u.loc.endsWith('/about'))).toBe(true)
  })

  it('lists the home page once, as the homepage', async () => {
    const ctx = makeStubContext({
      collections: ['pages'],
      items: {
        pages: [{ meta: { slug: 'home', collection: 'pages' }, fields: { title: 'Home' } }],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    expect(urls.map((u) => u.loc)).toEqual(['https://example.com/'])
  })

  it('takes the homepage entry, with its lastmod, from the document that renders /', async () => {
    const ctx = makeStubContext({
      collections: [
        { name: 'features', path: '/features/:slug' },
        { name: 'landing', path: '/' },
      ],
      items: {
        features: [
          {
            meta: { slug: 'seo', collection: 'features', createdAt: '2026-09-30T18:00:00.000Z' },
            fields: { title: 'SEO' },
          },
        ],
        landing: [
          {
            meta: { slug: 'home', collection: 'landing', createdAt: '2026-09-29T08:00:00.000Z' },
            fields: { title: 'Home' },
          },
        ],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    expect(urls[0]).toEqual({
      loc: 'https://example.com/',
      lastmod: '2026-09-29T08:00:00.000Z',
      changefreq: 'weekly',
      priority: '1.0',
    })
    expect(urls.map((u) => u.loc)).toEqual([
      'https://example.com/',
      'https://example.com/features/seo',
    ])
  })

  it('places documents at the path their collection declares', async () => {
    const ctx = makeStubContext({
      collections: [
        { name: 'hosts', path: '/deploy/:slug' },
        { name: 'docs', path: '/docs/:slug' },
      ],
      items: {
        hosts: [{ meta: { slug: 'vercel', collection: 'hosts' }, fields: { title: 'Vercel' } }],
        docs: [
          { meta: { slug: 'index', collection: 'docs' }, fields: { title: 'Docs' } },
          { meta: { slug: 'install', collection: 'docs' }, fields: { title: 'Install' } },
        ],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    expect(urls.map((u) => u.loc)).toEqual([
      'https://example.com/',
      'https://example.com/deploy/vercel',
      'https://example.com/docs',
      'https://example.com/docs/install',
    ])
  })

  it('skips a collection declared without pages, and lists a fixed path once', async () => {
    const ctx = makeStubContext({
      collections: [
        { name: 'faq', path: false },
        { name: 'landing', path: '/' },
        { name: 'pricing', path: '/pricing' },
      ],
      items: {
        faq: [{ meta: { slug: 'refunds', collection: 'faq' }, fields: { title: 'Refunds' } }],
        landing: [{ meta: { slug: 'home', collection: 'landing' }, fields: { title: 'Home' } }],
        pricing: [
          { meta: { slug: 'plans', collection: 'pricing' }, fields: { title: 'Plans' } },
          { meta: { slug: 'table', collection: 'pricing' }, fields: { title: 'Table' } },
        ],
      },
    })
    const urls = await buildSitemapUrls(ctx)
    expect(urls.map((u) => u.loc)).toEqual(['https://example.com/', 'https://example.com/pricing'])
  })

  it('strips trailing slash from baseUrl before composing loc values', async () => {
    const ctx = makeStubContext({
      collections: ['pages'],
      items: {
        pages: [{ meta: { slug: 'about', collection: 'pages' }, fields: { title: 'About' } }],
      },
      baseUrl: 'https://example.com/',
    })
    const urls = await buildSitemapUrls(ctx)
    const about = urls.find((u) => u.loc.endsWith('/about'))
    expect(about?.loc).toBe('https://example.com/about')
    expect(about?.loc).not.toContain('com//about')
  })
})
