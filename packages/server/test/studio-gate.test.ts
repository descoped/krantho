import { createHmac } from 'node:crypto'
import { readdirSync } from 'node:fs'
import type { KranthoConfigInput } from '@krantho/config'
import { describe, expect, it } from 'vitest'
import { createStudioServer } from '../src/studio-gate.js'

const JWT_SECRET = 'gate-test-secret-gate-test-secret-0123'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

const oidc = {
  issuer: 'https://vercel.com',
  clientId: 'cl_test',
  redirectUri: 'https://example.com/api/auth/callback',
}

function gatedConfig(): KranthoConfigInput {
  return {
    site,
    auth: { mode: 'oidc', jwtSecret: JWT_SECRET, oidc: { ...oidc, studioEntry: 'redirect' } },
  }
}

/** An access token in the shape the API issues, signed with `secret` */
function accessToken(secret: string, expiresInSec = 900): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({
    sub: 'user-1',
    email: 'admin@example.com',
    roles: ['admin'],
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
  })
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

/** A JS chunk the workspace's Studio build emitted */
function buildAsset(): string {
  const assets = readdirSync(new URL('../../studio/dist/assets/', import.meta.url))
  const chunk = assets.find((name) => name.endsWith('.js'))
  if (!chunk) throw new Error('Build @krantho/studio first')
  return chunk
}

function get(
  serve: ReturnType<typeof createStudioServer>,
  path: string,
  cookie?: string,
): Response {
  return serve({ url: new URL(path, 'https://example.com'), cookie })
}

describe('admin server', () => {
  it('serves the Studio SPA without configuration', async () => {
    const response = get(createStudioServer(), '/studio/')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html')
  })

  it('serves the Studio SPA when studioEntry is login, the default', () => {
    const serve = createStudioServer({ site, auth: { mode: 'oidc', jwtSecret: JWT_SECRET, oidc } })

    expect(get(serve, '/studio/').status).toBe(200)
  })
})

describe('Studio gate (studioEntry redirect)', () => {
  it('sends a visitor without a session to the OIDC sign-in and back', () => {
    const response = get(createStudioServer(gatedConfig()), '/studio/pages?tab=seo')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      `/api/auth/login/oidc?returnTo=${encodeURIComponent('/studio/pages?tab=seo')}`,
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('sends a visitor with a refresh token but no valid access token to the refresh', () => {
    const serve = createStudioServer(gatedConfig())
    const expired = `krantho_access=${accessToken(JWT_SECRET, -60)}; krantho_refresh=opaque-token`
    const location = `/api/auth/refresh?returnTo=${encodeURIComponent('/studio/pages?tab=seo')}`

    for (const cookie of ['krantho_refresh=opaque-token', expired]) {
      const response = get(serve, '/studio/pages?tab=seo', cookie)
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe(location)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('refreshes when the access token is signed with another secret', () => {
    const cookie = `krantho_access=${accessToken('another-secret')}; krantho_refresh=opaque-token`
    const response = get(createStudioServer(gatedConfig()), '/studio/', cookie)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/api/auth/refresh?returnTo=%2Fstudio%2F')
  })

  it('treats an empty refresh cookie as no refresh token', () => {
    const response = get(createStudioServer(gatedConfig()), '/studio/', 'krantho_refresh=')

    expect(response.headers.get('location')).toMatch(/^\/api\/auth\/login\/oidc\?/)
  })

  it('serves Studio to a valid session, cacheable by the browser only', () => {
    const cookie = `krantho_access=${accessToken(JWT_SECRET)}; krantho_refresh=opaque-token`
    const response = get(createStudioServer(gatedConfig()), '/studio/', cookie)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('treats an expired or foreign token as no session', () => {
    const serve = createStudioServer(gatedConfig())

    expect(get(serve, '/studio/', `krantho_access=${accessToken(JWT_SECRET, -60)}`).status).toBe(
      302,
    )
    expect(get(serve, '/studio/', `krantho_access=${accessToken('another-secret')}`).status).toBe(
      302,
    )
  })

  it('serves build assets without a session, cacheable as immutable', () => {
    const response = get(createStudioServer(gatedConfig()), `/studio/assets/${buildAsset()}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/javascript')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('answers 404 for a missing build asset, never the SPA or a redirect', async () => {
    const response = get(createStudioServer(gatedConfig()), '/studio/assets/Gone-0000abcd.js')

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })

  it('refuses to start without a JWT secret the API also verifies with', () => {
    const serve = createStudioServer({
      site,
      auth: { mode: 'oidc', oidc: { ...oidc, studioEntry: 'redirect' } },
    })

    expect(() => get(serve, '/studio/')).toThrow('auth.jwtSecret')
  })
})
