import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KranthoConfigInput } from '@krantho/config'
import { envNameFor, LEAVES } from '@krantho/config'
import type { ContentChange } from '@krantho/core'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

/**
 * With a CDN configured, every committed write that changes live pages purges
 * the CDN in the background: by tag under `pages: 'cdn'`, every path under
 * `pages: 'next-isr'`. A draft save purges nothing, and a purge never fails or
 * holds up the write.
 */

const invalidator = vi.hoisted(() => ({
  purgeTags: vi.fn<(tags: readonly string[], mode: string) => Promise<void>>(),
  purgePaths: vi.fn<(paths: readonly string[], mode: string) => Promise<void>>(),
}))

vi.mock('../src/cdn/index.js', () => ({
  createCdnInvalidator: (cache: { cdn: { provider: string } }) =>
    cache.cdn.provider === 'none' ? null : invalidator,
}))

const fixtures = fileURLToPath(new URL('./fixtures/content', import.meta.url))

const site = {
  domain: 'localhost',
  name: 'CDN wiring',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

const collections = {
  pages: defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: join(fixtures, 'pages'),
    schema: z.object({ title: z.string(), description: z.string() }),
  }),
}

const cloudfront = { provider: 'cloudfront', cloudfront: { distributionId: 'E123' } } as const
const gcp = { provider: 'gcp', gcp: { project: 'p', urlMap: 'm', accessToken: 't' } } as const

let dataDir: string
let handler: KranthoHandler | undefined
let background: Promise<unknown>[]
const savedEnv: Record<string, string | undefined> = {}

async function start(
  cache: KranthoConfigInput['cache'],
  extra: {
    onContentChange?: (change: ContentChange) => void
    waitUntil?: (work: Promise<unknown>) => void
  } = {},
): Promise<void> {
  handler = await createKranthoHandler({
    config: { site, paths: { dataDir }, cache },
    collections,
    waitUntil: (work) => void background.push(work),
    ...extra,
  })
  await settle()
  invalidator.purgeTags.mockClear()
  invalidator.purgePaths.mockClear()
}

/** Let the background purges run */
async function settle(): Promise<void> {
  await Promise.all(background)
  await new Promise((resolve) => setImmediate(resolve))
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  if (!handler) throw new Error('handler not started')
  return handler.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}

async function publishAbout(): Promise<Response> {
  return call('POST', '/api/content/pages/about/publish', { status: 'published' })
}

async function saveAboutDraft(): Promise<Response> {
  return call('PUT', '/api/content/pages/about', {
    fields: { title: 'Draft about', description: 'A draft' },
    body: 'Draft',
  })
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
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-cdn-wiring-')), 'data')
  background = []
  invalidator.purgeTags.mockReset().mockResolvedValue(undefined)
  invalidator.purgePaths.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  handler?.close()
  handler = undefined
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe("pages: 'cdn'", () => {
  it('purges a published document by tag, one purge per mode', async () => {
    await start({ pages: 'cdn', cdn: cloudfront })

    expect((await publishAbout()).status).toBe(200)
    await settle()

    expect(invalidator.purgeTags).toHaveBeenCalledTimes(2)
    expect(invalidator.purgeTags).toHaveBeenCalledWith(['k:d:pages:about'], 'expire')
    expect(invalidator.purgeTags).toHaveBeenCalledWith(['k:c:pages'], 'stale')
    expect(invalidator.purgePaths).not.toHaveBeenCalled()
  })

  it('purges the site tag on a site-wide change and SEO tags on an SEO change', async () => {
    await start({ pages: 'cdn', cdn: gcp })

    const seo = await call('PUT', '/api/seo/config/site', {
      entities: [{ '@type': 'Organization', properties: {} }],
    })
    expect(seo.status).toBeLessThan(300)
    await settle()

    expect(invalidator.purgeTags.mock.calls).toEqual([[['k:seo:site'], 'stale']])
  })

  it('purges nothing on a draft save', async () => {
    await start({ pages: 'cdn', cdn: cloudfront })

    expect((await saveAboutDraft()).status).toBe(200)
    await settle()

    expect(invalidator.purgeTags).not.toHaveBeenCalled()
    expect(invalidator.purgePaths).not.toHaveBeenCalled()
  })
})

describe("pages: 'next-isr' with a CDN in front", () => {
  it.each([
    ['cloudfront', cloudfront],
    ['gcp', gcp],
  ] as const)(
    'purges every path on a publish on %s (list pages show it too)',
    async (_name, cdn) => {
      await start({ pages: 'next-isr', cdn })

      expect((await publishAbout()).status).toBe(200)
      await settle()

      expect(invalidator.purgePaths.mock.calls).toEqual([[['/*'], 'expire']])
      expect(invalidator.purgeTags).not.toHaveBeenCalled()
    },
  )

  it('purges every path, stale, on a broad SEO change', async () => {
    await start({ pages: 'next-isr', cdn: cloudfront })

    expect((await call('DELETE', '/api/seo/config')).status).toBeLessThan(300)
    await settle()

    expect(invalidator.purgePaths.mock.calls).toEqual([[['/*'], 'stale']])
  })

  it('purges every path at startup when the content import changed the site', async () => {
    handler = await createKranthoHandler({
      config: { site, paths: { dataDir }, cache: { pages: 'next-isr', cdn: cloudfront } },
      collections,
      waitUntil: (work) => void background.push(work),
    })
    await settle()

    expect(invalidator.purgePaths.mock.calls).toEqual([[['/*'], 'stale']])
  })

  it('purges nothing on a draft save', async () => {
    await start({ pages: 'next-isr', cdn: gcp })

    expect((await saveAboutDraft()).status).toBe(200)
    await settle()

    expect(invalidator.purgePaths).not.toHaveBeenCalled()
  })
})

describe('no CDN listener', () => {
  it.each([
    ["'next-isr' on vercel (revalidateTag purges Vercel's edge)", 'next-isr', 'vercel'],
    ["'none' with a provider", 'none', 'cloudfront'],
  ] as const)('%s', async (_name, pages, provider) => {
    const cdn = provider === 'vercel' ? { provider } : cloudfront
    await start({ pages, cdn })

    expect((await publishAbout()).status).toBe(200)
    await settle()

    expect(invalidator.purgeTags).not.toHaveBeenCalled()
    expect(invalidator.purgePaths).not.toHaveBeenCalled()
  })
})

describe('alongside the host', () => {
  it("keeps the host's change listener and hands the purge to its waitUntil", async () => {
    const changes: ContentChange[] = []
    await start(
      { pages: 'cdn', cdn: cloudfront },
      { onContentChange: (change) => void changes.push(change) },
    )
    changes.length = 0
    background.length = 0

    await publishAbout()

    expect(changes).toEqual([
      { kind: 'document', collection: 'pages', slug: 'about', locale: 'en', live: true },
    ])
    expect(background).toHaveLength(1)
    await settle()
    expect(invalidator.purgeTags).toHaveBeenCalledTimes(2)
  })

  it("purges even when the host's listener throws", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await start(
      { pages: 'cdn', cdn: cloudfront },
      {
        onContentChange: () => {
          throw new Error('host listener failed')
        },
      },
    )

    expect((await publishAbout()).status).toBe(200)
    await settle()

    expect(invalidator.purgeTags).toHaveBeenCalledTimes(2)
  })
})

describe('a purge never fails or holds up the write', () => {
  it('answers the write while the purge is still running', async () => {
    await start({ pages: 'cdn', cdn: cloudfront })
    invalidator.purgeTags.mockReturnValue(new Promise(() => undefined))

    expect((await publishAbout()).status).toBe(200)
  })

  it('answers the write when the purge rejects, throws, or waitUntil throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await start(
      { pages: 'next-isr', cdn: cloudfront },
      {
        waitUntil: () => {
          throw new Error('outside a request scope')
        },
      },
    )
    invalidator.purgePaths.mockImplementation(() => {
      throw new Error('purge threw')
    })

    expect((await publishAbout()).status).toBe(200)
    expect((await saveAboutDraft()).status).toBe(200)
    await new Promise((resolve) => setImmediate(resolve))

    invalidator.purgePaths.mockRejectedValue(new Error('purge rejected'))
    expect((await publishAbout()).status).toBe(200)
    await new Promise((resolve) => setImmediate(resolve))

    expect(invalidator.purgePaths).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledWith('[cdn] purge failed:', expect.any(Error))
  })

  it('purges fire-and-forget when the host gives no waitUntil', async () => {
    handler = await createKranthoHandler({
      config: { site, paths: { dataDir }, cache: { pages: 'cdn', cdn: cloudfront } },
      collections,
    })
    await new Promise((resolve) => setImmediate(resolve))
    invalidator.purgeTags.mockClear()

    expect((await publishAbout()).status).toBe(200)
    await new Promise((resolve) => setImmediate(resolve))

    expect(invalidator.purgeTags).toHaveBeenCalledTimes(2)
  })
})
