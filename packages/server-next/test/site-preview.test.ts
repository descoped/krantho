import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envNameFor, LEAVES } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/**
 * "Preview on site": the API decides who may preview, the route handlers turn
 * that into Next.js draft mode, and the loader then reads the current version.
 * Draft mode is stood in for.
 */

const draft = {
  isEnabled: false,
  enable: vi.fn(() => {
    draft.isEnabled = true
  }),
  disable: vi.fn(() => {
    draft.isEnabled = false
  }),
}

const requestHeaders = new Headers()

vi.mock('next/headers', () => ({
  draftMode: async () => draft,
  headers: async () => requestHeaders,
}))
vi.mock('next/cache', () => ({
  unstable_cache:
    <T>(read: () => Promise<T>) =>
    () =>
      read(),
  revalidateTag: vi.fn(),
}))
vi.mock('next/server', () => ({ after: vi.fn() }))

const { createApiRouteHandlers, createContentLoader, showPreviewBanner } = await import(
  '../src/index.js'
)

const collections = {
  pages: defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: fileURLToPath(new URL('./fixtures/content/pages', import.meta.url)),
    schema: z.object({ title: z.string(), description: z.string() }),
  }),
}

const site = {
  domain: 'localhost',
  name: 'Preview',
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
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-preview-')), 'data')
  draft.isEnabled = false
  draft.enable.mockClear()
  draft.disable.mockClear()
  for (const name of [...requestHeaders.keys()]) requestHeaders.delete(name)
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
})

const context = (...path: string[]) => ({ params: Promise.resolve({ path }) })
const get = (path: string) => new Request(`http://localhost:4002${path}`)

describe('site preview', () => {
  it('turns on draft mode and sends the editor to the page, which then shows the draft', async () => {
    const config = { site, paths: { dataDir } }
    const { GET, PUT } = createApiRouteHandlers({ config, collections })
    const loader = createContentLoader({ config, collections })
    await PUT(
      new Request('http://localhost:4002/api/content/pages/about', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fields: { title: 'Draft about', description: 'A draft' },
          body: 'Draft',
        }),
      }),
      context('content', 'pages', 'about'),
    )
    const ref = { collection: 'pages', slug: 'about' }
    const listedTitle = async () =>
      (await loader.listPublished('pages')).find((doc) => doc.slug === 'about')?.fields['title']
    const summaryTitle = async () =>
      (await loader.listPublishedSummaries('pages')).find((doc) => doc.slug === 'about')?.fields[
        'title'
      ]
    expect((await loader.getPublished(ref))?.fields['title']).toBe('About')
    expect(await summaryTitle()).toBe('About')
    expect(await loader.isPreview()).toBe(false)

    const response = await GET(get('/api/preview?collection=pages&slug=about'), context('preview'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:4002/about')
    expect(draft.enable).toHaveBeenCalledOnce()
    expect(await loader.isPreview()).toBe(true)
    expect((await loader.getPublished(ref))?.fields['title']).toBe('Draft about')
    // Lists and summaries show what visitors see; only a document read is its current version
    expect(await listedTitle()).toBe('About')
    expect(await summaryTitle()).toBe('About')
    expect(JSON.stringify(await loader.jsonLd(ref))).toContain('Draft about')
  })

  it('keeps the editor on this site whatever the slug', async () => {
    const { GET } = createApiRouteHandlers({ config: { site, paths: { dataDir } }, collections })

    for (const slug of ['/evil.example', '\\evil.example', '..//evil.example']) {
      const response = await GET(
        get(`/api/preview?collection=pages&slug=${encodeURIComponent(slug)}`),
        context('preview'),
      )
      expect(response.headers.get('location')).toBe('http://localhost:4002/')
    }
  })

  it('passes a refusal through without draft mode', async () => {
    const { GET } = createApiRouteHandlers({ config: { site, paths: { dataDir } }, collections })

    const response = await GET(
      get('/api/preview?collection=globals&slug=navigation'),
      context('preview'),
    )

    expect(response.status).toBe(404)
    expect(draft.enable).not.toHaveBeenCalled()
  })

  it('sends the editor to the path the collection declares, and refuses one without pages', async () => {
    const directory = fileURLToPath(new URL('./fixtures/content/pages', import.meta.url))
    const schema = z.object({ title: z.string(), description: z.string() })
    const { GET } = createApiRouteHandlers({
      config: { site, paths: { dataDir } },
      collections: {
        docs: defineCollection({
          name: 'docs',
          source: 'filesystem',
          directory,
          schema,
          path: '/docs/:slug',
        }),
        snippets: defineCollection({
          name: 'snippets',
          source: 'filesystem',
          directory,
          schema,
          path: false,
        }),
      },
    })

    const docs = await GET(get('/api/preview?collection=docs&slug=about'), context('preview'))
    const index = await GET(get('/api/preview?collection=docs&slug=index'), context('preview'))
    expect(docs.headers.get('location')).toBe('http://localhost:4002/docs/about')
    expect(index.headers.get('location')).toBe('http://localhost:4002/docs')
    expect(draft.enable).toHaveBeenCalledTimes(2)

    const snippet = await GET(
      get('/api/preview?collection=snippets&slug=about'),
      context('preview'),
    )
    expect(snippet.status).toBe(400)
    expect(draft.enable).toHaveBeenCalledTimes(2)
  })

  it('leaves draft mode for a path on this site only', async () => {
    const { GET } = createApiRouteHandlers({ config: { site, paths: { dataDir } }, collections })
    draft.isEnabled = true

    const back = await GET(get('/api/preview/exit?path=/about'), context('preview', 'exit'))
    const elsewhere = [
      '//evil.example',
      '/\\evil.example',
      '/\\/evil.example',
      '/..//evil.example',
      '/../\\evil.example',
      'https://evil.example/',
      '/..//evil.example',
      '/../\\evil.example',
      '/a/../..//evil.example',
      'http://[',
    ]
    const away = await Promise.all(
      elsewhere.map((path) =>
        GET(get(`/api/preview/exit?path=${encodeURIComponent(path)}`), context('preview', 'exit')),
      ),
    )

    expect(draft.disable).toHaveBeenCalledTimes(1 + elsewhere.length)
    expect(back.headers.get('location')).toBe('http://localhost:4002/about')
    for (const response of away) {
      expect(response.headers.get('location')).toBe('http://localhost:4002/')
    }
  })
})

describe('the previewing notice', () => {
  it('belongs on an editor’s preview, and on nothing else', async () => {
    expect(await showPreviewBanner()).toBe(false)
    draft.isEnabled = true
    expect(await showPreviewBanner()).toBe(true)
  })

  it('is left out when a frame shows the page, as Studio’s Live mode does', async () => {
    draft.isEnabled = true
    requestHeaders.set('sec-fetch-dest', 'iframe')
    expect(await showPreviewBanner()).toBe(false)
    requestHeaders.set('sec-fetch-dest', 'document')
    expect(await showPreviewBanner()).toBe(true)
  })
})
