import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KranthoConfigInput } from '@krantho/config'
import { envNameFor, LEAVES } from '@krantho/config'
import { defineCollection, defineDocumentArchetype, defineMetadataArchetype } from '@krantho/schema'
import { DOCUMENT_SEO_METADATA_SCHEMA } from '@krantho/seo-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createContentLoader } from '../src/content-loader.js'
import { createKranthoHandler } from '../src/handler.js'

/**
 * Server-rendered pages read through `createContentLoader()`. It must open the
 * database the API handler opens — derived from the same configuration — and
 * must not touch the filesystem until the first read.
 */

const fixtures = fileURLToPath(new URL('./fixtures/content', import.meta.url))

const site = {
  domain: 'localhost',
  name: 'Loader',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

let dataDir: string
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-loader-')), 'data')
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
  vi.restoreAllMocks()
})

function pagesIn(directory: string) {
  return defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory,
    archetype: defineDocumentArchetype({
      id: 'test/page',
      label: 'Page',
      fields: z.object({ title: z.string(), description: z.string() }),
      metadata: {
        seo: {
          archetype: defineMetadataArchetype({
            id: 'krantho/structured-data',
            label: 'Structured data',
            schema: z.fromJSONSchema(DOCUMENT_SEO_METADATA_SCHEMA) as z.ZodObject,
          }),
        },
      },
    }),
  })
}

const collections = { pages: pagesIn(join(fixtures, 'pages')) }

describe('createContentLoader', () => {
  const put = (body: string) =>
    new Request('http://localhost/api/content/pages/home', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { title: 'Home', description: 'Home page' }, body }),
    })
  const setStatus = (status: string) =>
    new Request('http://localhost/api/content/pages/home/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })

  it('reads the published content the API handler imported', async () => {
    const config: KranthoConfigInput = { site, paths: { dataDir } }
    const handler = await createKranthoHandler({
      config,
      collections,
    })
    try {
      const loader = createContentLoader({ config, collections })
      const home = await loader.getPublished({ collection: 'pages', slug: 'home' })
      expect(home?.fields.title).toBe('Home')
      expect(home?.locale).toBe('en')
      expect((await loader.listPublished('pages')).map((doc) => doc.slug).sort()).toEqual([
        'about',
        'home',
      ])
      expect(await loader.getPublished({ collection: 'blog', slug: 'home' })).toBeNull()
    } finally {
      handler.close()
    }
  })

  it('lists the published documents without their bodies', async () => {
    const config: KranthoConfigInput = { site, paths: { dataDir } }
    const handler = await createKranthoHandler({ config, collections })
    try {
      const loader = createContentLoader({ config, collections })
      const summaries = await loader.listPublishedSummaries('pages')

      expect(summaries.map((doc) => doc.slug).sort()).toEqual(['about', 'home'])
      expect(summaries.find((doc) => doc.slug === 'home')).toMatchObject({
        collection: 'pages',
        locale: 'en',
        fields: { title: 'Home' },
      })
      expect(summaries.find((doc) => doc.slug === 'home')?.publishedAt).toBeInstanceOf(Date)
      for (const doc of summaries) expect(doc).not.toHaveProperty('body')
      expect((await loader.listPublished('pages')).every((doc) => doc.body.length > 0)).toBe(true)
      expect(await loader.listPublishedSummaries('blog')).toEqual([])
    } finally {
      handler.close()
    }
  })

  it('caches the summaries of a collection apart from its documents', async () => {
    const config: KranthoConfigInput = { site, paths: { dataDir } }
    const handler = await createKranthoHandler({ config, collections })
    try {
      const loader = createContentLoader({ config, collections })
      const title = async () =>
        (await loader.listPublishedSummaries('pages')).find((doc) => doc.slug === 'home')?.fields
          .title
      expect(await title()).toBe('Home')
      expect((await loader.listPublished('pages')).length).toBe(2)

      await handler.handle(
        new Request('http://localhost/api/content/pages/home', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            fields: { title: 'Renamed', description: 'Home page' },
            body: '',
          }),
        }),
      )
      await handler.handle(setStatus('published'))

      expect(await title()).toBe('Home')
      const fresh = createContentLoader({ config, collections })
      expect(
        (await fresh.listPublishedSummaries('pages')).find((doc) => doc.slug === 'home')?.fields
          .title,
      ).toBe('Renamed')
    } finally {
      handler.close()
    }
  })

  it('keeps showing the published version while a draft is saved, until it is published', async () => {
    const config: KranthoConfigInput = {
      site,
      paths: { dataDir },
      content: { cache: { enabled: false } },
    }
    const handler = await createKranthoHandler({
      config,
      collections,
    })
    try {
      const loader = createContentLoader({ config, collections })
      const body = async () =>
        (await loader.getPublished({ collection: 'pages', slug: 'home' }))?.body ?? null

      expect((await handler.handle(put('Saved as a draft'))).status).toBe(200)
      expect(await body()).not.toContain('Saved as a draft')

      expect((await handler.handle(setStatus('published'))).status).toBe(200)
      expect(await body()).toContain('Saved as a draft')

      expect((await handler.handle(setStatus('draft'))).status).toBe(200)
      expect(await body()).toBeNull()
    } finally {
      handler.close()
    }
  })

  it('serves cached reads for the configured time-to-live', async () => {
    const config: KranthoConfigInput = { site, paths: { dataDir } }
    const handler = await createKranthoHandler({
      config,
      collections,
    })
    try {
      const loader = createContentLoader({ config, collections })
      const title = async () =>
        (await loader.getPublished({ collection: 'pages', slug: 'home' }))?.fields.title
      expect(await title()).toBe('Home')

      await handler.handle(put('Changed'))
      await handler.handle(setStatus('published'))
      expect(await title()).toBe('Home')
      expect(
        (
          await createContentLoader({ config, collections }).getPublished({
            collection: 'pages',
            slug: 'home',
          })
        )?.body,
      ).toContain('Changed')
    } finally {
      handler.close()
    }
  })

  it('reads every publish at once behind a CDN, which caches the pages instead', async () => {
    // The purge after a publish goes to Cloud CDN: answer it here, never on the network
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'))
    const config: KranthoConfigInput = {
      site,
      paths: { dataDir },
      cache: {
        pages: 'cdn',
        cdn: { provider: 'gcp', gcp: { project: 'p', urlMap: 'm', accessToken: 't' } },
      },
    }
    const handler = await createKranthoHandler({
      config,
      collections,
    })
    try {
      const loader = createContentLoader({ config, collections })
      const body = async () =>
        (await loader.getPublished({ collection: 'pages', slug: 'home' }))?.body ?? null
      expect(await body()).not.toContain('Published behind a CDN')

      await handler.handle(put('Published behind a CDN'))
      await handler.handle(setStatus('published'))
      expect(await body()).toContain('Published behind a CDN')
    } finally {
      handler.close()
    }
  })

  it('reads the site default locale when none is given', async () => {
    const handler = await createKranthoHandler({
      config: { site, paths: { dataDir } },
      collections,
    })
    try {
      const loader = createContentLoader({
        config: {
          site: { ...site, supportedLocales: ['no', 'en'], defaultLocale: 'no' },
          paths: { dataDir },
        },
        collections,
      })
      expect(await loader.getPublished({ collection: 'pages', slug: 'home' })).toBeNull()
      expect(await loader.listPublished('pages')).toEqual([])
      expect(await loader.listPublishedSummaries('pages')).toEqual([])
      expect(
        (await loader.listPublishedSummaries('pages', 'en')).map((doc) => doc.slug).sort(),
      ).toEqual(['about', 'home'])
      const english = await loader.getPublished({ collection: 'pages', slug: 'home', locale: 'en' })
      expect(english?.fields.title).toBe('Home')
      const saved = await handler.handle(
        new Request('http://localhost/api/seo/config?id=doc:pages/home', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            _version: 1,
            locale: 'en',
            entities: [{ '@type': 'WebPage', properties: { headline: 'English title' } }],
          }),
        }),
      )
      expect(saved.status).toBe(200)
      await handler.handle(setStatus('published'))
      expect(await loader.seoProperties('doc:pages/home', 'en')).toEqual({
        headline: 'English title',
      })
      expect(await loader.seoProperties('doc:pages/home')).toEqual({})
    } finally {
      handler.close()
    }
  })

  it('imports the repository content into the site default locale', async () => {
    const config: KranthoConfigInput = {
      site: { ...site, supportedLocales: ['nb', 'en'], defaultLocale: 'nb' },
      paths: { dataDir },
    }
    const handler = await createKranthoHandler({ config, collections })
    try {
      const res = await handler.handle(new Request('http://localhost/api/content/pages/home'))
      expect(res.status).toBe(200)
      const doc = (await res.json()) as { meta: { locale: string } }
      expect(doc.meta.locale).toBe('nb')

      const loader = createContentLoader({ config, collections })
      expect((await loader.getPublished({ collection: 'pages', slug: 'home' }))?.locale).toBe('nb')
      expect(
        await loader.getPublished({ collection: 'pages', slug: 'home', locale: 'en' }),
      ).toBeNull()
    } finally {
      handler.close()
    }
  })

  it('serves SEO properties and a JSON-LD graph composed from the published version', async () => {
    const config: KranthoConfigInput = {
      site,
      paths: { dataDir },
      content: { cache: { enabled: false } },
    }
    const handler = await createKranthoHandler({
      config,
      collections,
    })
    try {
      const saved = await handler.handle(
        new Request('http://localhost/api/seo/config?id=doc:pages/home', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            _version: 1,
            entities: [{ '@type': 'WebPage', properties: { headline: 'Configured' } }],
          }),
        }),
      )
      expect(saved.status).toBe(200)

      const loader = createContentLoader({ config, collections })
      expect(await loader.seoProperties('doc:pages/home')).toEqual({})
      await handler.handle(setStatus('published'))
      expect(await loader.seoProperties('doc:pages/home')).toEqual({ headline: 'Configured' })
      expect(await loader.seoProperties('doc:pages/about')).toEqual({})

      const graph = await loader.jsonLd({ collection: 'pages', slug: 'home' })
      expect(JSON.stringify(graph)).toContain('WebPage')

      await handler.handle(
        new Request('http://localhost/api/content/pages/home/publish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'draft' }),
        }),
      )
      expect(await loader.jsonLd({ collection: 'pages', slug: 'home' })).toBeNull()
    } finally {
      handler.close()
    }
  })

  it('opens nothing until the first read', async () => {
    const loader = createContentLoader({ config: { site, paths: { dataDir } }, collections })
    expect(existsSync(dataDir)).toBe(false)
    await loader.listPublished('pages')
    expect(existsSync(join(dataDir, 'content.db'))).toBe(true)
  })

  it('imports the repository content itself when a page is served before the API', async () => {
    const loader = createContentLoader({ config: { site, paths: { dataDir } }, collections })

    const home = await loader.getPublished({ collection: 'pages', slug: 'home' })

    expect(home?.fields.title).toBe('Home')
  })

  it('seeds the SEO configuration itself when a page is served before the API', async () => {
    const config: KranthoConfigInput = {
      site,
      paths: { dataDir },
      seo: { identity: 'Organization', collections: { pages: ['Article'] } },
    }
    const loader = createContentLoader({ config, collections })

    const graph = JSON.stringify(await loader.jsonLd({ collection: 'pages', slug: 'home' }))

    expect(graph).toContain('"Organization"')
    expect(graph).toContain('"Article"')
  })

  it('composes the configured SEO for a site without a database', async () => {
    const config: KranthoConfigInput = {
      site,
      persistence: { provider: 'filesystem' },
      seo: { identity: 'WebSite', collections: { pages: ['TechArticle'] } },
    }
    const loader = createContentLoader({ config, collections })

    const graph = (await loader.jsonLd({ collection: 'pages', slug: 'home' })) as {
      '@graph': Array<Record<string, unknown>>
    }
    const types = graph['@graph'].map((node) => node['@type'])

    expect(types).toContain('WebSite')
    expect(types).toContain('TechArticle')
    expect(types).not.toContain('BlogPosting')
    expect(await loader.seoProperties('site')).toMatchObject({ name: 'Loader' })
    expect(existsSync(dataDir)).toBe(false)
  })

  it('states the structure the page renders in its graph', async () => {
    const config: KranthoConfigInput = {
      site,
      paths: { dataDir },
      seo: { identity: 'Organization', collections: { pages: ['Article'] } },
    }
    const loader = createContentLoader({ config, collections })
    const ref = { collection: 'pages', slug: 'home' }

    const plain = (await loader.jsonLd(ref)) as { '@graph': Array<Record<string, unknown>> }
    expect(plain['@graph'].some((node) => node['@type'] === 'BreadcrumbList')).toBe(false)

    const trail = [{ name: 'Start', url: '/start' }, { name: 'Home' }]
    const graph = (await loader.jsonLd(ref, { trail, kind: 'about' })) as {
      '@graph': Array<Record<string, unknown>>
    }
    const list = graph['@graph'].find((node) => node['@type'] === 'BreadcrumbList')
    expect(list?.itemListElement).toHaveLength(2)
    expect(graph['@graph'].find((node) => node['@type'] === 'AboutPage')).toMatchObject({
      breadcrumb: { '@id': list?.['@id'] },
    })
  })

  it('seeds a database once per process, so a page served later keeps edits made since', async () => {
    const config: KranthoConfigInput = {
      site,
      paths: { dataDir },
      content: { cache: { enabled: false } },
      seo: {
        seedMode: 'overwrite',
        site: { entities: [{ '@type': 'Organization', properties: { name: 'Seeded' } }] },
      },
    }
    const handler = await createKranthoHandler({ config, collections })
    try {
      const saved = await handler.handle(
        new Request('http://localhost/api/seo/config?id=site', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            entities: [{ '@type': 'Organization', properties: { name: 'Edited' } }],
          }),
        }),
      )
      expect(saved.status).toBe(200)

      const loader = createContentLoader({ config, collections })
      // The edit wins over the configured identity; what it leaves unset comes from `site`
      expect(await loader.seoProperties('site')).toEqual({ name: 'Edited', url: site.baseUrl })
    } finally {
      handler.close()
    }
  })

  it('seeds the SEO configuration when a page and the API open a fresh database together', async () => {
    const config: KranthoConfigInput = {
      site,
      paths: { dataDir },
      seo: { identity: 'Organization', collections: { pages: ['Article'] } },
    }
    const loader = createContentLoader({ config, collections })

    const [handler, graph] = await Promise.all([
      createKranthoHandler({ config, collections }),
      loader.jsonLd({ collection: 'pages', slug: 'home' }),
    ])
    try {
      expect(JSON.stringify(graph)).toContain('"Article"')
      const response = await handler.handle(new Request('http://localhost/api/seo/config'))
      const body = JSON.stringify(await response.json())
      expect(body).toContain('collection:pages')
      expect(body).toContain('"Organization"')
    } finally {
      handler.close()
    }
  })

  it('imports each document once when a page and the API open a fresh database together', async () => {
    const config: KranthoConfigInput = { site, paths: { dataDir } }
    const loader = createContentLoader({ config, collections })

    const [handler] = await Promise.all([
      createKranthoHandler({ config, collections }),
      loader.getPublished({ collection: 'pages', slug: 'home' }),
    ])
    try {
      const response = await handler.handle(
        new Request('http://localhost/api/content/pages/home/versions'),
      )
      const body = (await response.json()) as { versions: unknown[] }
      expect(body.versions).toHaveLength(1)
    } finally {
      handler.close()
    }
  })
})

describe('createContentLoader preview', () => {
  it('reads the current version, draft included, while pages keep the published one', async () => {
    const config: KranthoConfigInput = {
      site,
      paths: { dataDir },
      content: { cache: { enabled: false } },
    }
    const handler = await createKranthoHandler({ config, collections })
    try {
      const saved = await handler.handle(
        new Request('http://localhost/api/content/pages/home', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            fields: { title: 'Draft home', description: 'A draft' },
            body: 'Draft',
          }),
        }),
      )
      expect(saved.status).toBe(200)

      const loader = createContentLoader({ config, collections })
      const ref = { collection: 'pages', slug: 'home' }
      expect((await loader.getPublished(ref))?.fields.title).toBe('Home')
      expect((await loader.preview.getPublished(ref))?.fields.title).toBe('Draft home')
      expect(JSON.stringify(await loader.preview.jsonLd(ref))).toContain('Draft home')
      expect(await loader.preview.getPublished({ collection: 'pages', slug: 'missing' })).toBeNull()
    } finally {
      handler.close()
    }
  })
})

describe('site preview route', () => {
  const preview = (query: string, token?: string) =>
    new Request(`http://localhost/api/preview?${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })

  it('answers an editor with the page path, and refuses everyone else', async () => {
    const jwtSecret = 'preview-test-secret-that-is-long-enough'
    // An access token in the shape the API issues
    const token = (roles: string[]): string => {
      const encode = (value: object): string =>
        Buffer.from(JSON.stringify(value)).toString('base64url')
      const header = encode({ alg: 'HS256', typ: 'JWT' })
      const payload = encode({
        sub: 'u1',
        email: 'e@example.com',
        roles,
        exp: Date.now() / 1000 + 300,
      })
      const signature = createHmac('sha256', jwtSecret)
        .update(`${header}.${payload}`)
        .digest('base64url')
      return `${header}.${payload}.${signature}`
    }
    const handler = await createKranthoHandler({
      config: {
        site,
        paths: { dataDir },
        auth: { mode: 'token', jwtSecret, token: { secret: 'shared-secret' } },
      },
      collections,
      sitePreview: 'draft-mode',
    })
    try {
      expect((await handler.handle(preview('collection=pages&slug=about'))).status).toBe(403)
      const viewer = await handler.handle(preview('collection=pages&slug=about', token(['viewer'])))
      expect(viewer.status).toBe(403)

      const allowed = await handler.handle(
        preview('collection=pages&slug=about', token(['editor'])),
      )
      expect(allowed.status).toBe(200)
      expect(await allowed.json()).toEqual({ path: '/about' })

      const home = await handler.handle(preview('collection=pages&slug=home', token(['editor'])))
      expect(await home.json()).toEqual({ path: '/' })

      const capabilities = await handler.handle(new Request('http://localhost/api/capabilities'))
      const { features } = (await capabilities.json()) as { features: Record<string, string> }
      expect(features.sitePreview).toBe('draft-mode')
    } finally {
      handler.close()
    }
  })

  it('does not exist where the host renders no drafts', async () => {
    const handler = await createKranthoHandler({
      config: { site, paths: { dataDir } },
      collections,
    })
    try {
      expect((await handler.handle(preview('collection=pages&slug=about'))).status).toBe(404)
    } finally {
      handler.close()
    }
  })
})

describe('autoImport', () => {
  it('warns when a collection directory is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const missing = join(dataDir, '..', 'no-such-dir')
    const handler = await createKranthoHandler({
      config: { site, paths: { dataDir } },
      collections: { pages: pagesIn(missing) },
    })
    handler.close()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(missing))
  })
})
