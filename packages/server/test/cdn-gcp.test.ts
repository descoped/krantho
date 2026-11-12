import type { CacheSection } from '@krantho/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCdnInvalidator } from '../src/cdn/index.js'

/**
 * Cloud CDN purges through the URL map's `invalidateCache`: tags in chunks of
 * ten to the beta endpoint, one v1 request per path. The bearer token is the
 * configured one, or a metadata-server token reused until it expires.
 */

const BETA_URL =
  'https://compute.googleapis.com/compute/beta/projects/demo-project/global/urlMaps/site-map/invalidateCache'
const V1_URL =
  'https://compute.googleapis.com/compute/v1/projects/demo-project/global/urlMaps/site-map/invalidateCache'
const METADATA_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'

function gcpCache(accessToken?: string): CacheSection {
  return {
    pages: 'cdn',
    cdn: {
      provider: 'gcp',
      sMaxAgeSec: 86400,
      staleWhileRevalidateSec: 604800,
      tagHeader: 'x-krantho-cache-tag',
      cloudfront: {},
      gcp: { project: 'demo-project', urlMap: 'site-map', accessToken },
    },
    shared: 'none',
  }
}

type FetchArgs = [url: string, init?: RequestInit]

let fetchMock: ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>
let invalidateStatus: number

beforeEach(() => {
  invalidateStatus = 200
  fetchMock = vi.fn(async (url: string) => {
    if (url === METADATA_URL) {
      return Response.json({
        access_token: 'metadata-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
    }
    return new Response('{}', { status: invalidateStatus })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function invalidateCalls(): { url: string; body: unknown; headers: Record<string, string> }[] {
  return fetchMock.mock.calls
    .filter(([url]) => url !== METADATA_URL)
    .map(([url, init]) => ({
      url,
      body: JSON.parse(String(init?.body)),
      headers: init?.headers as Record<string, string>,
    }))
}

function metadataCalls(): FetchArgs[] {
  return fetchMock.mock.calls.filter(([url]) => url === METADATA_URL)
}

describe('Cloud CDN invalidator', () => {
  it('sends tags to the beta endpoint in chunks of ten', async () => {
    const tags = Array.from({ length: 23 }, (_, i) => `k:d:pages:p${i}`)
    await createCdnInvalidator(gcpCache('configured-token'))?.purgeTags(tags, 'expire')

    const calls = invalidateCalls()
    expect(calls.map((call) => call.url)).toEqual([BETA_URL, BETA_URL, BETA_URL])
    expect(calls.map((call) => call.body)).toEqual([
      { cacheTags: tags.slice(0, 10) },
      { cacheTags: tags.slice(10, 20) },
      { cacheTags: tags.slice(20) },
    ])
    for (const [, init] of fetchMock.mock.calls) expect(init?.method).toBe('POST')
  })

  it('sends one v1 request per path', async () => {
    await createCdnInvalidator(gcpCache('configured-token'))?.purgePaths(
      ['/about', '/about*'],
      'stale',
    )

    const calls = invalidateCalls()
    expect(calls.map((call) => call.url)).toEqual([V1_URL, V1_URL])
    expect(calls.map((call) => call.body)).toEqual([{ path: '/about' }, { path: '/about*' }])
  })

  it('uses the configured access token and never asks the metadata server', async () => {
    await createCdnInvalidator(gcpCache('configured-token'))?.purgeTags(['k:site'], 'expire')

    expect(invalidateCalls()[0]?.headers.Authorization).toBe('Bearer configured-token')
    expect(metadataCalls()).toHaveLength(0)
  })

  it('fetches a metadata-server token without a configured one', async () => {
    await createCdnInvalidator(gcpCache())?.purgeTags(['k:site'], 'expire')

    const [metadata] = metadataCalls()
    expect(metadata?.[1]?.headers).toEqual({ 'Metadata-Flavor': 'Google' })
    expect(invalidateCalls()[0]?.headers.Authorization).toBe('Bearer metadata-token')
  })

  it('reuses the metadata token until it expires', async () => {
    vi.useFakeTimers()
    const invalidator = createCdnInvalidator(gcpCache())
    await invalidator?.purgeTags(['k:site'], 'expire')
    await invalidator?.purgePaths(['/*'], 'stale')
    expect(metadataCalls()).toHaveLength(1)

    vi.advanceTimersByTime(3600 * 1000)
    await invalidator?.purgeTags(['k:site'], 'expire')
    expect(metadataCalls()).toHaveLength(2)
  })

  it('keeps the metadata token per invalidator', async () => {
    await createCdnInvalidator(gcpCache())?.purgeTags(['k:site'], 'expire')
    await createCdnInvalidator(gcpCache())?.purgeTags(['k:site'], 'expire')

    expect(metadataCalls()).toHaveLength(2)
  })

  it('retries a failed request once, then logs without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    invalidateStatus = 503

    await expect(
      createCdnInvalidator(gcpCache('configured-token'))?.purgeTags(['k:site'], 'expire'),
    ).resolves.toBeUndefined()
    expect(invalidateCalls()).toHaveLength(2)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('carries on with the next chunk after a failed one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let calls = 0
    fetchMock.mockImplementation(async () => {
      calls += 1
      return new Response('{}', { status: calls <= 2 ? 500 : 200 })
    })
    const tags = Array.from({ length: 11 }, (_, i) => `k:d:pages:p${i}`)

    await createCdnInvalidator(gcpCache('configured-token'))?.purgeTags(tags, 'expire')
    expect(invalidateCalls().map((call) => call.body)).toEqual([
      { cacheTags: tags.slice(0, 10) },
      { cacheTags: tags.slice(0, 10) },
      { cacheTags: tags.slice(10) },
    ])
  })
})
