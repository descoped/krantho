import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envNameFor, LEAVES } from '@krantho/config'
import type { ContentChange } from '@krantho/core'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

/**
 * Every committed write announces what it changed, through the API, the
 * startup import and the file watcher, so a host can refresh what it caches.
 */

const fixtures = fileURLToPath(new URL('./fixtures/content', import.meta.url))

const site = {
  domain: 'localhost',
  name: 'Changes',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(fixtures, 'pages'),
  schema: z.object({ title: z.string(), description: z.string() }),
})

const blog = defineCollection({
  name: 'blog',
  source: 'database',
  schema: z.object({ title: z.string() }),
})

let dataDir: string
let handler: KranthoHandler
let changes: ContentChange[]
const savedEnv: Record<string, string | undefined> = {}

async function start(onContentChange = (change: ContentChange) => void changes.push(change)) {
  handler = await createKranthoHandler({
    config: {
      site,
      paths: { dataDir },
      media: { provider: 'local', local: { dir: join(dataDir, 'uploads') } },
    },
    collections: { pages, blog },
    onContentChange,
  })
}

/** A one-pixel PNG */
const PIXEL = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

function pixelForm(): FormData {
  const form = new FormData()
  form.append('file', new Blob([PIXEL], { type: 'image/png' }), 'pixel.png')
  return form
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return handler.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}

/** The changes a request announced */
async function changesOf(method: string, path: string, body?: unknown): Promise<ContentChange[]> {
  changes = []
  const response = await call(method, path, body)
  expect(response.status, `${method} ${path}`).toBeLessThan(300)
  return changes
}

beforeEach(() => {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-changes-')), 'data')
  changes = []
})

afterEach(() => {
  handler?.close()
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('content changes', () => {
  it('announces the startup import as a site-wide change', async () => {
    await start()

    expect(changes).toEqual([{ kind: 'site' }])
  })

  it('marks a draft save as leaving the live page alone, and a publish as changing it', async () => {
    await start()

    expect(
      await changesOf('POST', '/api/content/blog', {
        slug: 'hello',
        fields: { title: 'Hello' },
        body: 'Hi',
      }),
    ).toEqual([{ kind: 'document', collection: 'blog', slug: 'hello', live: false }])
    expect(
      await changesOf('PUT', '/api/content/pages/home', {
        fields: { title: 'Home', description: 'd' },
        body: 'Draft',
      }),
    ).toEqual([{ kind: 'document', collection: 'pages', slug: 'home', live: false }])
    expect(
      await changesOf('POST', '/api/content/pages/home/publish', { status: 'published' }),
    ).toEqual([{ kind: 'document', collection: 'pages', slug: 'home', locale: 'en', live: true }])
    expect(await changesOf('POST', '/api/content/pages/home/publish', { status: 'draft' })).toEqual(
      [{ kind: 'document', collection: 'pages', slug: 'home', locale: 'en', live: true }],
    )
    expect(await changesOf('DELETE', '/api/content/blog/hello')).toEqual([
      { kind: 'document', collection: 'blog', slug: 'hello', live: true },
    ])
  })

  it('announces each document of a bulk publish and bulk delete, and a restore as a save', async () => {
    await start()

    expect(
      await changesOf('POST', '/api/content/pages/bulk-publish', { slugs: ['home', 'about'] }),
    ).toEqual([
      { kind: 'document', collection: 'pages', slug: 'home', locale: 'en', live: true },
      { kind: 'document', collection: 'pages', slug: 'about', locale: 'en', live: true },
    ])
    expect(await changesOf('POST', '/api/content/pages/home/restore/1')).toEqual([
      { kind: 'document', collection: 'pages', slug: 'home', live: false },
    ])
    expect(await changesOf('DELETE', '/api/content/pages/bulk', { slugs: ['about'] })).toEqual([
      { kind: 'document', collection: 'pages', slug: 'about', locale: 'en', live: true },
    ])
  })

  it('announces imports: each imported document as a draft save', async () => {
    await start()

    expect(
      await changesOf('POST', '/api/content/blog/import', {
        items: [
          {
            identity: { collection: 'blog', slug: 'a', locale: 'en' },
            contract: null,
            metadata: {},
            defaults: [],
            fields: { title: 'A' },
            body: '',
          },
        ],
      }),
    ).toEqual([{ kind: 'document', collection: 'blog', slug: 'a', locale: 'en', live: false }])
    expect(
      await changesOf('POST', '/api/import/bundle', {
        content: {
          blog: [
            {
              identity: { collection: 'blog', slug: 'b', locale: 'en' },
              contract: null,
              metadata: {},
              defaults: [],
              fields: { title: 'B' },
              body: '',
            },
          ],
        },
      }),
    ).toEqual([{ kind: 'document', collection: 'blog', slug: 'b', locale: 'en', live: false }])
  })

  it('announces SEO configuration changes and a checkpoint restore', async () => {
    await start()

    expect(
      await changesOf('PUT', '/api/seo/config/site', {
        entities: [{ '@type': 'Organization', properties: {} }],
      }),
    ).toEqual([{ kind: 'seo', configId: 'site' }])
    expect(await changesOf('DELETE', '/api/seo/config/site')).toEqual([
      { kind: 'seo', configId: 'site' },
    ])
    expect(await changesOf('DELETE', '/api/seo/config')).toEqual([{ kind: 'seo' }])

    const created = await call('POST', '/api/checkpoints', { name: 'before' })
    const checkpoint = (await created.json()) as { version: number }
    expect(await changesOf('POST', `/api/checkpoints/${checkpoint.version}/restore`)).toEqual([
      { kind: 'site' },
    ])
  })

  it('announces every change to a media asset', async () => {
    await start()
    const uploaded = await handler.handle(
      new Request('http://localhost/api/media/upload', { method: 'POST', body: pixelForm() }),
    )
    expect(uploaded.status).toBeLessThan(300)
    const { id } = (await uploaded.json()) as { id: string }
    const media = { kind: 'media', id }

    expect(await changesOf('PUT', `/api/media/${id}`, { altText: 'A pixel' })).toEqual([media])
    expect(await changesOf('PUT', '/api/media/bulk', { ids: [id], altText: 'Pixel' })).toEqual([
      media,
    ])

    changes = []
    const replaced = await handler.handle(
      new Request(`http://localhost/api/media/${id}/replace`, {
        method: 'POST',
        body: pixelForm(),
      }),
    )
    expect(replaced.status).toBeLessThan(300)
    expect(changes).toEqual([media])

    expect(await changesOf('DELETE', `/api/media/${id}`)).toEqual([media])
  })

  it('reads a document fresh after a write, so a status toggle follows the last change', async () => {
    await start()
    const toggle = async () =>
      (
        (await (await call('POST', '/api/content/pages/home/publish', {})).json()) as {
          status: string
        }
      ).status

    // The imported page is live; a stale read would see it live again and unpublish twice
    expect(await toggle()).toBe('draft')
    expect(await toggle()).toBe('published')
  })

  it('never fails a write when a listener throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await start(() => {
      throw new Error('listener down')
    })

    const response = await call('POST', '/api/content/pages/home/publish', { status: 'published' })

    expect(response.status).toBe(200)
    expect(warn).toHaveBeenCalledWith(
      '[krantho] content change listener failed:',
      expect.any(Error),
    )
  })
})
