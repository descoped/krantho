import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineCollection } from '@krantho/schema'
import type { ContentLoader, KranthoHandler, KranthoHandlerOptions } from '@krantho/server'
import { createContentLoader, createKranthoHandler } from '@krantho/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { CachedPage, RenderedPage } from '../src/index.js'
import { renderCachedPage } from '../src/index.js'

/**
 * The Express page cache helper, rendering through a real content loader on a
 * temporary SQLite database: published pages get CDN headers and the tags of
 * their reads, a signed preview link reads the draft and is never stored, and
 * everything else gets no headers.
 */

type Config = KranthoHandlerOptions['config']

const fixtures = fileURLToPath(new URL('./fixtures/content', import.meta.url))
const jwtSecret = 'node-page-cache-test-secret-long-enough'

const site = {
  domain: 'localhost',
  name: 'Page cache',
  language: 'en',
  baseUrl: 'http://localhost:4003',
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
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-node-page-cache-')), 'data')
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

/** A server-side render of the document the path names, through the content loader */
function renderPage(url: string): () => Promise<RenderedPage> {
  return async () => {
    const path = new URL(`http://site.example${url}`).pathname
    const slug = path === '/' ? 'home' : path.slice(1)
    const doc = await loader.getPublished({ collection: 'pages', slug })
    if (!doc) return { status: 404, html: 'Not found' }
    return { status: 200, html: `<h1>${String(doc.fields.title)}</h1>` }
  }
}

function serve(
  config: Config,
  url: string,
  method = 'GET',
  render: () => Promise<RenderedPage> = renderPage(url),
): Promise<CachedPage> {
  return renderCachedPage({ url, method }, config, render)
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

/** The signed preview URL (path and query) the API sends an editor to for `slug` */
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
  return new URL(`http://site.example${url}`).searchParams.get('krantho-preview') ?? ''
}

describe('published pages under cache.pages: cdn', () => {
  it('caches a page at the CDN, tagged with its reads', async () => {
    const page = await serve({ ...base, cache: gcp }, '/about')
    expect(page.status).toBe(200)
    expect(page.html).toBe('<h1>About</h1>')
    expect(page.headers).toEqual({
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      'Cache-Tag': 'k:site,k:d:pages:about',
    })
  })

  it("uses each provider's CDN and tag headers", async () => {
    const vercel = await serve(
      { ...base, cache: { pages: 'cdn', cdn: { provider: 'vercel', sMaxAgeSec: 60 } } },
      '/about',
    )
    expect(vercel.headers).toEqual({
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=604800',
      'Vercel-Cache-Tag': 'k:site,k:d:pages:about',
    })

    const cloudfront = await serve(
      {
        ...base,
        cache: {
          pages: 'cdn',
          cdn: { provider: 'cloudfront', cloudfront: { distributionId: 'E1' } },
        },
      },
      '/about',
    )
    expect(cloudfront.headers).toEqual({
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
      'x-krantho-cache-tag': 'k:site,k:d:pages:about',
    })
  })

  it('caches a 404 and a HEAD request, tagged with their reads', async () => {
    const missing = await serve({ ...base, cache: gcp }, '/missing')
    expect(missing.status).toBe(404)
    expect(missing.headers['Cache-Tag']).toBe('k:site,k:d:pages:missing')

    const head = await serve({ ...base, cache: gcp }, '/about', 'HEAD')
    expect(head.headers['Cache-Tag']).toBe('k:site,k:d:pages:about')
  })

  it('accepts an absolute request URL', async () => {
    const page = await serve(
      { ...base, cache: gcp },
      'http://site.example/about',
      'GET',
      renderPage('/about'),
    )
    expect(page.headers['Cache-Tag']).toBe('k:site,k:d:pages:about')
  })

  it('omits the tag header for a page that read nothing', async () => {
    const page = await serve({ ...base, cache: gcp }, '/static', 'GET', async () => ({
      status: 200,
      html: 'Static',
    }))
    expect(page.headers['CDN-Cache-Control']).toContain('s-maxage=86400')
    expect(page.headers['Cache-Tag']).toBeUndefined()
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
      const page = await serve({ ...base, cache: gcp }, path, 'GET', async () => ({
        status: 200,
        html: '{}',
      }))
      expect(page.headers, path).toEqual({})
    }
  })

  it('never caches a POST or an error', async () => {
    const post = await serve({ ...base, cache: gcp }, '/about', 'POST')
    expect(post.html).toBe('<h1>About</h1>')
    expect(post.headers).toEqual({})

    const error = await serve({ ...base, cache: gcp }, '/about', 'GET', async () => {
      await renderPage('/about')()
      return { status: 500, html: 'Boom' }
    })
    expect(error.status).toBe(500)
    expect(error.headers).toEqual({})
  })

  it('never caches a page that sets a cookie, and keeps the cookie', async () => {
    for (const name of ['Set-Cookie', 'set-cookie']) {
      const cookies = ['session=1; Path=/', 'theme=dark; Path=/']
      const page = await serve({ ...base, cache: gcp }, '/about', 'GET', async () => ({
        ...(await renderPage('/about')()),
        headers: { [name]: cookies, 'Content-Type': 'text/html' },
      }))
      expect(page.status).toBe(200)
      expect(page.headers, name).toEqual({ [name]: cookies, 'Content-Type': 'text/html' })
    }
  })

  it("merges the page's own headers with the CDN headers, the CDN's winning", async () => {
    const page = await serve({ ...base, cache: gcp }, '/about', 'GET', async () => ({
      ...(await renderPage('/about')()),
      headers: {
        'Content-Type': 'text/html',
        'content-length': 14,
        'cache-control': 'public, max-age=60',
        'cache-tag': 'mine',
        'X-Skipped': undefined,
      },
    }))
    expect(page.headers).toEqual({
      'Content-Type': 'text/html',
      'content-length': 14,
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      'Cache-Tag': 'k:site,k:d:pages:about',
    })
  })

  it("keeps a preview's cookie and replaces its caching headers", async () => {
    await saveHomeDraft()
    const url = await previewUrl('home')
    const page = await serve({ ...base, cache: gcp }, url, 'GET', async () => ({
      ...(await renderPage(url)()),
      headers: { 'set-cookie': 'session=1', 'cache-control': 'public, max-age=60' },
    }))
    expect(page.html).toBe('<h1>Draft home</h1>')
    expect(page.headers).toEqual({
      'set-cookie': 'session=1',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
    })
  })

  it('passes the headers of a request it leaves alone through unchanged', async () => {
    const page = await serve({ ...base, cache: gcp }, '/api/x', 'GET', async () => ({
      status: 200,
      html: '{}',
      headers: { 'content-type': 'application/json', 'set-cookie': 's=1' },
    }))
    expect(page.headers).toEqual({ 'content-type': 'application/json', 'set-cookie': 's=1' })
  })

  it('leaves a page alone whose own Cache-Control keeps it private', async () => {
    const values = [
      'private',
      'no-store',
      'no-cache',
      'Public, max-age=60, NO-STORE',
      'private="set-cookie"',
    ]
    for (const value of values) {
      const page = await serve({ ...base, cache: gcp }, '/about', 'GET', async () => ({
        ...(await renderPage('/about')()),
        headers: { 'Cache-Control': value, Vary: 'Cookie' },
      }))
      expect(page.status, value).toBe(200)
      expect(page.headers, value).toEqual({ 'Cache-Control': value, Vary: 'Cookie' })
    }

    const split = await serve({ ...base, cache: gcp }, '/about', 'GET', async () => ({
      ...(await renderPage('/about')()),
      headers: { 'cache-control': ['public', 'no-cache'] },
    }))
    expect(split.headers).toEqual({ 'cache-control': ['public', 'no-cache'] })
  })

  it("reads the page's own Cache-Control under CloudFront, whose lifetime lives there too", async () => {
    const cloudfront: Config['cache'] = {
      pages: 'cdn',
      cdn: { provider: 'cloudfront', cloudfront: { distributionId: 'E1' } },
    }
    const kept = await serve({ ...base, cache: cloudfront }, '/about', 'GET', async () => ({
      ...(await renderPage('/about')()),
      headers: { 'Cache-Control': 'private, no-store' },
    }))
    expect(kept.headers).toEqual({ 'Cache-Control': 'private, no-store' })

    const cached = await serve({ ...base, cache: cloudfront }, '/about', 'GET', async () => ({
      ...(await renderPage('/about')()),
      headers: { 'cache-control': 'public, max-age=60' },
    }))
    expect(cached.headers).toEqual({
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
      'x-krantho-cache-tag': 'k:site,k:d:pages:about',
    })
  })

  it('caches a page whose own Cache-Control is public, with the CDN rule winning', async () => {
    const page = await serve({ ...base, cache: gcp }, '/about', 'GET', async () => ({
      ...(await renderPage('/about')()),
      headers: { 'Cache-Control': 'public, max-age=60' },
    }))
    expect(page.headers).toEqual({
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      'Cache-Tag': 'k:site,k:d:pages:about',
    })
  })

  it('adds nothing with the default page cache', async () => {
    const page = await serve(base, '/about')
    expect(page.html).toBe('<h1>About</h1>')
    expect(page.headers).toEqual({})
  })
})

describe('signed preview links', () => {
  const previewed = {
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
    'Referrer-Policy': 'no-referrer',
  }

  it('render the draft, never stored, never indexed, with no referrer', async () => {
    await saveHomeDraft()
    const url = await previewUrl('home')

    const preview = await serve({ ...base, cache: gcp }, url)
    expect(preview.html).toBe('<h1>Draft home</h1>')
    expect(preview.headers).toEqual(previewed)

    // Without the token the same page is the published, cached one
    const published = await serve({ ...base, cache: gcp }, '/')
    expect(published.html).toBe('<h1>Home</h1>')
    expect(published.headers['Cache-Tag']).toBe('k:site,k:d:pages:home')
  })

  it('are private under the default page cache and on an error too', async () => {
    await saveHomeDraft()
    const url = await previewUrl('home')

    const preview = await serve(base, url)
    expect(preview.html).toBe('<h1>Draft home</h1>')
    expect(preview.headers).toEqual(previewed)

    const error = await serve(base, url, 'GET', async () => ({ status: 500, html: 'Boom' }))
    expect(error.headers).toEqual(previewed)
  })

  it('read the published version with a token for another path, or a tampered one', async () => {
    await saveHomeDraft()
    const token = tokenOf(await previewUrl('about'))

    const otherPath = await serve({ ...base, cache: gcp }, `/?krantho-preview=${token}`)
    expect(otherPath.html).toBe('<h1>Home</h1>')
    expect(otherPath.headers['Cache-Tag']).toBe('k:site,k:d:pages:home')

    const home = tokenOf(await previewUrl('home'))
    const tampered = await serve({ ...base, cache: gcp }, `/?krantho-preview=${home}x`)
    expect(tampered.html).toBe('<h1>Home</h1>')
    expect(tampered.headers['Cache-Control']).toBe('public, max-age=0, must-revalidate')
  })

  it('count only the first preview parameter', async () => {
    await saveHomeDraft()
    const token = tokenOf(await previewUrl('home'))

    const first = await serve(
      { ...base, cache: gcp },
      `/?krantho-preview=${token}&krantho-preview=junk`,
    )
    expect(first.html).toBe('<h1>Draft home</h1>')
    expect(first.headers).toEqual(previewed)

    const second = await serve(
      { ...base, cache: gcp },
      `/?krantho-preview=junk&krantho-preview=${token}`,
    )
    expect(second.html).toBe('<h1>Home</h1>')
    expect(second.headers['Cache-Tag']).toBe('k:site,k:d:pages:home')
  })

  it('never apply to the API, even with a token signed for its path', async () => {
    const url = await previewUrl('api')
    expect(new URL(`http://site.example${url}`).pathname).toBe('/api')

    const page = await serve({ ...base, cache: gcp }, url, 'GET', async () => ({
      status: 200,
      html: '{}',
    }))
    expect(page.headers).toEqual({})
  })
})
