import { describe, expect, it } from 'vitest'
import { seoIndexNowKey } from '../src/handlers/seo-indexnow.js'
import type { ApiContext, ApiRequest } from '../src/types.js'

function request(key: string): ApiRequest {
  return { method: 'GET', path: `/api/seo/indexnow/${key}`, params: { key }, query: {} }
}

function context(key: string | undefined): ApiContext {
  return { config: { seo: { indexNow: { key } } } } as unknown as ApiContext
}

describe('GET /api/seo/indexnow/:key', () => {
  it('answers the configured key as plain text', async () => {
    const res = await seoIndexNowKey(request('abcdef0123456789'), context('abcdef0123456789'))

    expect(res).toEqual({
      status: 200,
      body: 'abcdef0123456789',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  })

  it('answers 404 for any other key, and when no key is configured', async () => {
    expect(
      (await seoIndexNowKey(request('other-key-123'), context('abcdef0123456789'))).status,
    ).toBe(404)
    expect((await seoIndexNowKey(request('abcdef0123456789'), context(undefined))).status).toBe(404)
  })
})
