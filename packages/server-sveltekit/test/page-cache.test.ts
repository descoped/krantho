import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineCollection } from '@krantho/schema'
import type { ContentLoader, KranthoHandler, KranthoHandlerOptions } from '@krantho/server'
import { createContentLoader, createKranthoHandler } from '@krantho/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createPageCacheHandle } from '../src/index.js'

/**
 * The SvelteKit page cache hook, driven with a fake `resolve` that renders
 * through a real content loader on a temporary SQLite database: published
 * pages get CDN headers and the tags of their reads, a signed preview link
 * reads the draft and is never stored, and everything else is left alone.
 */

type Config = KranthoHandlerOptions['config']

const fixtures = fileURLToPath(new URL('./fixtures/content', import.meta.url))
const jwtSecret = 'sveltekit-page-cache-test-secret-long-enough'

const site = {
  domain: 'localhost',
  name: 'Page cache',
  language: 'en',
  baseUrl: 'http://localhost:4004',
}

const collections = {
  pages: defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: join(fixtures, 'pages'),
    schema: z.object({ title: z.string(), description: z.string() }),
  }),
}

const gcp: Config['cache'] = {
  pages: 'cdn',
  cdn: { provider: 'gcp', gcp: { project: 'p', urlMap: 'm', accessToken: 't' } },
}

let dataDir: string
let base: Config
let handler: KranthoHandler
let loader: ContentLoader
const savedEnv: Record<string, string | undefined> = {}

beforeEach(async () => {
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith('KRANTHO_')) continue
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-sveltekit-page-cache-')), 'data')
  base = { site, paths: { dataDir }, auth: { jwtSecret } }
  handler = await createKranthoHandler({ config: base, collections, sitePreview: 'signed-url' })
  loader = createContentLoader({ config: base, collections })
})

afterEach(() => {
  handler.close()
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
})

interface FakeEvent {
  url: URL
  request: Request
}

/** A SvelteKit request event; `dataPath` is the raw `__data.json` path of a data request */
function event(url: string, init: { method?: string; dataPath?: string } = {}): FakeEvent {
  // Appended, not resolved: `//studio/x` is a path here, not a host
  const pageUrl = new URL(`http://site.example${url}`)
  const requestUrl = new URL(pageUrl)
  if (init.dataPath) requestUrl.pathname = init.dataPath
  return { url: pageUrl, request: new Request(requestUrl, { method: init.method ?? 'GET' }) }
}

/** A page route: renders the document the path names, through the content loader */
async function renderPage(e: FakeEvent): Promise<Response> {
  const slug = e.url.pathname === '/' ? 'home' : e.url.pathname.slice(1)
  const doc = await loader.getPublished({ collection: 'pages', slug })
  if (!doc) return new Response('Not found', { status: 404 })
  return new Response(`<h1>${String(doc.fields['title'])}</h1>`, {
    headers: { 'content-type': 'text/html' },
  })
}

async function serve(
  config: Config,
  e: FakeEvent,
  resolve: (e: FakeEvent) => Promise<Response> = renderPage,
): Promise<Response> {
  return createPageCacheHandle({ config })({ event: e, resolve })
}

/** Save a draft of the home page over its published version */
async function saveHomeDraft(): Promise<void> {
  const saved = await handler.handle(
    new Request('http://localhost/api/content/pages/home', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { title: 'Draft home', description: 'A draft' }, body: '' }),
    }),
  )
  expect(saved.status).toBe(200)
}

/** The signed preview URL the API sends an editor to for `slug` */
async function previewUrl(slug: string): Promise<string> {
  const response = await handler.handle(
    new Request(
      `http://localhost/api/preview?${new URLSearchParams({ collection: 'pages', slug })}`,
    ),
  )
  expect(response.status).toBe(307)
  return response.headers.get('location') ?? ''
}

function tokenOf(url: string): string {
  return new URL(url, 'http://site.example').searchParams.get('krantho-preview') ?? ''
}

function expectNoCacheHeaders(response: Response): void {
  expect(response.headers.get('cache-control')).toBeNull()
  expect(response.headers.get('cdn-cache-control')).toBeNull()
  expect(response.headers.get('cache-tag')).toBeNull()
}

describe('published pages under cache.pages: cdn', () => {
  it('caches a page at the CDN, tagged with its reads', async () => {
    const response = await serve({ ...base, cache: gcp }, event('/about'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<h1>About</h1>')
    expect(response.headers.get('content-type')).toBe('text/html')
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    expect(response.headers.get('cdn-cache-control')).toBe(
      'public, s-maxage=86400, stale-while-revalidate=604800',
    )
    expect(response.headers.get('cache-tag')).toBe('k:site,k:d:pages:about')
  })

  it("uses each provider's CDN and tag headers", async () => {
    const vercel = await serve(
      { ...base, cache: { pages: 'cdn', cdn: { provider: 'vercel', sMaxAgeSec: 60 } } },
      event('/about'),
    )
    expect(vercel.headers.get('vercel-cdn-cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=604800',
    )
    expect(vercel.headers.get('vercel-cache-tag')).toBe('k:site,k:d:pages:about')
    expect(vercel.headers.get('cdn-cache-control')).toBeNull()

    const cloudfront = await serve(
      {
        ...base,
        cache: {
          pages: 'cdn',
          cdn: { provider: 'cloudfront', cloudfront: { distributionId: 'E1' } },
        },
      },
      event('/about'),
    )
    expect(cloudfront.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    )
    expect(cloudfront.headers.get('cdn-cache-control')).toBeNull()
    expect(cloudfront.headers.get('x-krantho-cache-tag')).toBe('k:site,k:d:pages:about')
  })

  it('caches a 404 with the tag of the read that found nothing', async () => {
    const response = await serve({ ...base, cache: gcp }, event('/missing'))
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-tag')).toBe('k:site,k:d:pages:missing')
  })

  it('caches HEAD requests and __data.json requests by the same rules', async () => {
    const head = await serve({ ...base, cache: gcp }, event('/about', { method: 'HEAD' }))
    expect(head.headers.get('cache-tag')).toBe('k:site,k:d:pages:about')

    const data = await serve(
      { ...base, cache: gcp },
      event('/about', { dataPath: '/about/__data.json' }),
    )
    expect(data.headers.get('cdn-cache-control')).toContain('s-maxage=86400')
    expect(data.headers.get('cache-tag')).toBe('k:site,k:d:pages:about')
  })

  it('omits the tag header for a page that read nothing', async () => {
    const response = await serve(
      { ...base, cache: gcp },
      event('/static'),
      async () => new Response('Static'),
    )
    expect(response.headers.get('cdn-cache-control')).toContain('s-maxage=86400')
    expect(response.headers.get('cache-tag')).toBeNull()
  })

  it('leaves the API and Studio alone, however the path is spelled', async () => {
    const paths = [
      '/api',
      '/api/content/pages',
      '/studio',
      '/studio/pages',
      '/API/x',
      '/%61pi/x',
      '//studio/x',
    ]
    for (const path of paths) {
      const response = await serve(
        { ...base, cache: gcp },
        event(path),
        async () => new Response('{}'),
      )
      expect(response.status, path).toBe(200)
      expectNoCacheHeaders(response)
    }
  })

  it('never caches a POST, a response that sets a cookie, or an error', async () => {
    expectNoCacheHeaders(await serve({ ...base, cache: gcp }, event('/about', { method: 'POST' })))

    const cookie = await serve({ ...base, cache: gcp }, event('/about'), async (e) => {
      const page = await renderPage(e)
      page.headers.append('set-cookie', 'session=1; Path=/')
      return page
    })
    expect(cookie.status).toBe(200)
    expectNoCacheHeaders(cookie)

    const error = await serve({ ...base, cache: gcp }, event('/about'), async (e) => {
      await renderPage(e)
      return new Response('Boom', { status: 500 })
    })
    expect(error.status).toBe(500)
    expectNoCacheHeaders(error)
  })

  it('leaves a response alone whose own Cache-Control keeps it private', async () => {
    const values = [
      'private',
      'no-store',
      'no-cache',
      'Public, max-age=60, NO-STORE',
      'private="set-cookie"',
    ]
    for (const value of values) {
      const response = await serve({ ...base, cache: gcp }, event('/about'), async (e) => {
        const page = await renderPage(e)
        page.headers.set('cache-control', value)
        page.headers.set('vary', 'Cookie')
        return page
      })
      expect(response.status, value).toBe(200)
      expect(response.headers.get('cache-control'), value).toBe(value)
      expect(response.headers.get('vary'), value).toBe('Cookie')
      expect(response.headers.get('cdn-cache-control'), value).toBeNull()
      expect(response.headers.get('cache-tag'), value).toBeNull()
    }
  })

  it("reads the page's own Cache-Control under CloudFront, whose lifetime lives there too", async () => {
    const cloudfront: Config['cache'] = {
      pages: 'cdn',
      cdn: { provider: 'cloudfront', cloudfront: { distributionId: 'E1' } },
    }
    const kept = await serve({ ...base, cache: cloudfront }, event('/about'), async (e) => {
      const page = await renderPage(e)
      page.headers.set('cache-control', 'private, no-store')
      return page
    })
    expect(kept.headers.get('cache-control')).toBe('private, no-store')
    expect(kept.headers.get('x-krantho-cache-tag')).toBeNull()

    const cached = await serve({ ...base, cache: cloudfront }, event('/about'), async (e) => {
      const page = await renderPage(e)
      page.headers.set('cache-control', 'public, max-age=60')
      return page
    })
    expect(cached.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    )
  })

  it('caches a response whose own Cache-Control is public, with the CDN rule winning', async () => {
    const response = await serve({ ...base, cache: gcp }, event('/about'), async (e) => {
      const page = await renderPage(e)
      page.headers.set('cache-control', 'public, max-age=60')
      return page
    })
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    expect(response.headers.get('cdn-cache-control')).toContain('s-maxage=86400')
    expect(response.headers.get('cache-tag')).toBe('k:site,k:d:pages:about')
  })

  it('adds nothing with the default page cache', async () => {
    const response = await serve(base, event('/about'))
    expect(await response.text()).toBe('<h1>About</h1>')
    expectNoCacheHeaders(response)
  })
})

describe('signed preview links', () => {
  it('render the draft, never stored, never indexed, with no referrer', async () => {
    await saveHomeDraft()
    const url = await previewUrl('home')

    for (const e of [event(url), event(url, { dataPath: '/__data.json' })]) {
      const response = await serve({ ...base, cache: gcp }, e)
      expect(await response.text()).toBe('<h1>Draft home</h1>')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('x-robots-tag')).toBe('noindex')
      expect(response.headers.get('referrer-policy')).toBe('no-referrer')
      expect(response.headers.get('cdn-cache-control')).toBeNull()
      expect(response.headers.get('cache-tag')).toBeNull()
    }

    // Without the token the same page is the published, cached one
    const published = await serve({ ...base, cache: gcp }, event('/'))
    expect(await published.text()).toBe('<h1>Home</h1>')
    expect(published.headers.get('cache-tag')).toBe('k:site,k:d:pages:home')
  })

  it('are private under the default page cache and on an error too', async () => {
    await saveHomeDraft()
    const url = await previewUrl('home')

    const response = await serve(base, event(url))
    expect(await response.text()).toBe('<h1>Draft home</h1>')
    expect(response.headers.get('cache-control')).toBe('private, no-store')

    const error = await serve(base, event(url), async () => new Response('Boom', { status: 500 }))
    expect(error.headers.get('cache-control')).toBe('private, no-store')
  })

  it('read the published version with a token for another path, or a tampered one', async () => {
    await saveHomeDraft()
    const token = tokenOf(await previewUrl('about'))

    const otherPath = await serve({ ...base, cache: gcp }, event(`/?krantho-preview=${token}`))
    expect(await otherPath.text()).toBe('<h1>Home</h1>')
    expect(otherPath.headers.get('cache-tag')).toBe('k:site,k:d:pages:home')

    const home = tokenOf(await previewUrl('home'))
    const tampered = await serve({ ...base, cache: gcp }, event(`/?krantho-preview=${home}x`))
    expect(await tampered.text()).toBe('<h1>Home</h1>')
    expect(tampered.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
  })

  it('count only the first preview parameter', async () => {
    await saveHomeDraft()
    const token = tokenOf(await previewUrl('home'))

    const first = await serve(
      { ...base, cache: gcp },
      event(`/?krantho-preview=${token}&krantho-preview=junk`),
    )
    expect(await first.text()).toBe('<h1>Draft home</h1>')
    expect(first.headers.get('cache-control')).toBe('private, no-store')

    const second = await serve(
      { ...base, cache: gcp },
      event(`/?krantho-preview=junk&krantho-preview=${token}`),
    )
    expect(await second.text()).toBe('<h1>Home</h1>')
    expect(second.headers.get('cache-tag')).toBe('k:site,k:d:pages:home')
  })

  it('never apply to the API, even with a token signed for its path', async () => {
    const url = await previewUrl('api')
    expect(new URL(url, 'http://site.example').pathname).toBe('/api')

    const response = await serve(
      { ...base, cache: gcp },
      event(url),
      async () => new Response('{}'),
    )
    expect(response.headers.get('cache-control')).toBeNull()
    expect(response.headers.get('x-robots-tag')).toBeNull()
  })
})
