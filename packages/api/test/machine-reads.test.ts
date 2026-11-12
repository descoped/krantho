import { describe, expect, it } from 'vitest'
import { asUser, testApi, testConfig, testStores } from './assistant/fixtures.js'

/**
 * A site that answers signed-in people only (`auth.requireAuthForReads`) still serves crawlers
 * and search engines: robots.txt, the sitemap, llms.txt and the IndexNow key publish what
 * visitors can read.
 */
const strict = () => testConfig({ auth: { requireAuthForReads: true } })

describe('machine reads on a site that requires sign-in for reads', () => {
  it('serves robots.txt, the sitemap, llms.txt and the IndexNow key without sign-in', async () => {
    const api = testApi(testStores(), strict())
    for (const path of ['/api/seo/robots.txt', '/api/seo/sitemap', '/api/seo/llms.txt']) {
      const response = await api.handle(asUser(undefined, 'GET', path))
      expect(response.status, path).not.toBe(401)
      expect(response.status, path).not.toBe(403)
    }
    const key = await api.handle(asUser(undefined, 'GET', '/api/seo/indexnow/not-the-key'))
    expect(key.status).not.toBe(401)
  })

  it('still refuses every other unsigned read', async () => {
    const api = testApi(testStores(), strict())
    for (const path of [
      '/api/content/pages',
      '/api/checkpoints',
      '/api/media',
      '/api/seo/config',
      '/api/migrations/status',
      '/api/settings/llm',
    ]) {
      expect((await api.handle(asUser(undefined, 'GET', path))).status, path).toBe(401)
    }
  })

  it('keeps sign-in and the capabilities open', async () => {
    const api = testApi(testStores(), strict())
    expect((await api.handle(asUser(undefined, 'GET', '/api/capabilities'))).status).toBe(200)
    expect((await api.handle(asUser(undefined, 'GET', '/api/auth/capabilities'))).status).toBe(200)
  })

  it('does not open a write on a machine path', async () => {
    const api = testApi(testStores(), strict())
    const response = await api.handle(asUser(undefined, 'POST', '/api/seo/sitemap'))
    expect([401, 404, 405]).toContain(response.status)
  })
})
