import { DEFAULTS, type KranthoConfig } from '@krantho/config'
import { describe, expect, it, vi } from 'vitest'
import {
  changedUrlsFor,
  describeSubmission,
  INDEXNOW_ENDPOINT,
  indexNowChangeListener,
  submitIndexNow,
} from '../src/indexnow.js'

const site = { baseUrl: 'https://example.com', key: 'abcdef0123456789' }

/** A fetch that records each request body and answers `status` */
function recordingFetch(status = 200) {
  const bodies: unknown[] = []
  const urls: string[] = []
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    urls.push(String(input))
    bodies.push(JSON.parse(String(init?.body)))
    return new Response(null, { status })
  }) as unknown as typeof fetch
  return { fetchFn, bodies, urls }
}

function config(baseUrl: string, key?: string): KranthoConfig {
  return {
    ...DEFAULTS,
    site: { ...DEFAULTS.site, domain: new URL(baseUrl).host, name: 'Example', baseUrl },
    seo: { ...DEFAULTS.seo, indexNow: { key } },
  } as unknown as KranthoConfig
}

describe('submitIndexNow', () => {
  it('posts the URLs with the host, key and key location, and answers the status', async () => {
    const { fetchFn, bodies, urls } = recordingFetch(202)
    const statuses = await submitIndexNow(
      site,
      ['https://example.com/', 'https://example.com/docs'],
      fetchFn,
    )

    expect(statuses).toEqual([202])
    expect(urls).toEqual([INDEXNOW_ENDPOINT])
    expect(bodies).toEqual([
      {
        host: 'example.com',
        key: 'abcdef0123456789',
        keyLocation: 'https://example.com/abcdef0123456789.txt',
        urlList: ['https://example.com/', 'https://example.com/docs'],
      },
    ])
  })

  it('splits more URLs than one submission takes', async () => {
    const { fetchFn, bodies } = recordingFetch()
    const many = Array.from({ length: 10_001 }, (_, i) => `https://example.com/p/${i}`)
    await submitIndexNow(site, many, fetchFn)

    expect(bodies.map((body) => (body as { urlList: string[] }).urlList.length)).toEqual([
      10_000, 1,
    ])
  })

  it('describes a submission with its count, the answer and every URL', () => {
    expect(describeSubmission(['https://example.com/', 'https://example.com/a'], [200])).toBe(
      'IndexNow: submitted 2 URLs, HTTP 200\n  https://example.com/\n  https://example.com/a',
    )
  })

  it('throws when IndexNow rejects the submission', async () => {
    const { fetchFn } = recordingFetch(403)
    await expect(submitIndexNow(site, ['https://example.com/'], fetchFn)).rejects.toThrow(
      'HTTP 403',
    )
  })
})

describe('changedUrlsFor', () => {
  const urlsFor = changedUrlsFor(
    'https://example.com/',
    { docs: { name: 'docs', path: '/docs/:slug' }, globals: { name: 'globals' } },
    async () => ['https://example.com/', 'https://example.com/docs/install'],
  )

  it('names a document’s page when its published version changed', async () => {
    const change = { kind: 'document', collection: 'docs', slug: 'install', live: true } as const
    expect(await urlsFor(change)).toEqual(['https://example.com/docs/install'])
  })

  it('names no page for a draft save, a collection without pages, or a media change', async () => {
    const draft = { kind: 'document', collection: 'docs', slug: 'install', live: false } as const
    const global = { kind: 'document', collection: 'globals', slug: 'footer', live: true } as const
    expect(await urlsFor(draft)).toEqual([])
    expect(await urlsFor(global)).toEqual([])
    expect(await urlsFor({ kind: 'media', id: 'm1' })).toEqual([])
  })

  it('names every page in the sitemap after a site-wide change', async () => {
    expect(await urlsFor({ kind: 'site' })).toEqual([
      'https://example.com/',
      'https://example.com/docs/install',
    ])
  })
})

describe('indexNowChangeListener', () => {
  const change = { kind: 'document', collection: 'docs', slug: 'install', live: true } as const
  const urls = async (): Promise<string[]> => ['https://example.com/docs/install']

  it('is off without a key, and for a site on a local host', () => {
    expect(indexNowChangeListener(config('https://example.com'), 'production', urls)).toBeNull()
    expect(
      indexNowChangeListener(
        config('http://localhost:3000', 'abcdef0123456789'),
        'production',
        urls,
      ),
    ).toBeNull()
  })

  it('is off outside production, so a development server never announces pages', () => {
    for (const nodeEnv of ['development', 'test', undefined]) {
      expect(
        indexNowChangeListener(config('https://example.com', 'abcdef0123456789'), nodeEnv, urls),
      ).toBeNull()
    }
  })

  it('submits the changed pages alongside the response', async () => {
    const { fetchFn, bodies } = recordingFetch()
    const pending: Promise<unknown>[] = []
    const listener = indexNowChangeListener(
      config('https://example.com', 'abcdef0123456789'),
      'production',
      urls,
      (work) => pending.push(work),
      fetchFn,
    )

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await listener?.(change)
    await Promise.all(pending)
    expect(log).toHaveBeenCalledWith(
      '[indexnow] IndexNow: submitted 1 URL, HTTP 200\n  https://example.com/docs/install',
    )
    log.mockRestore()
    expect(bodies).toHaveLength(1)
    expect((bodies[0] as { urlList: string[] }).urlList).toEqual([
      'https://example.com/docs/install',
    ])
  })

  it('logs a rejected submission instead of failing the write', async () => {
    const { fetchFn } = recordingFetch(500)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const pending: Promise<unknown>[] = []
    const listener = indexNowChangeListener(
      config('https://example.com', 'abcdef0123456789'),
      'production',
      urls,
      (work) => pending.push(work),
      fetchFn,
    )

    await expect(Promise.resolve(listener?.(change))).resolves.toBeUndefined()
    await Promise.all(pending)
    expect(error).toHaveBeenCalledWith('[indexnow] notification failed:', expect.any(Error))
    error.mockRestore()
  })
})
