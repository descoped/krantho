import type { AuthSection } from '@krantho/config'
import type { IAuthAdapter, RefreshTokenRecord, UserRecord } from '@krantho/persistence'
import { describe, expect, it } from 'vitest'
import { authRefresh, authRefreshRedirect } from '../src/handlers/auth-refresh.js'
import { hashRefreshToken } from '../src/jwt.js'
import type { ApiContext, ApiRequest } from '../src/types.js'
import { authSection } from './auth-fixtures.js'

const JWT_SECRET = 'refresh-test-secret-refresh-test-secret'
const REFRESH_TOKEN = 'opaque-refresh-token'
const HOUR_MS = 3_600_000

const oidcAuth = authSection({
  mode: 'oidc',
  jwtSecret: JWT_SECRET,
  oidc: {
    issuer: 'https://vercel.com',
    clientId: 'cl_test',
    redirectUri: 'https://example.com/cb',
  },
})

const admin: UserRecord = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'Admin',
  roles: ['admin'],
  oidcSubject: 'sub-1',
  oidcIssuer: 'https://vercel.com',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

/** An auth adapter holding one refresh token, recording what the handler does to it */
function store(options: { expiresInMs?: number; user?: UserRecord | null } = {}) {
  const record: RefreshTokenRecord = {
    id: 'refresh-1',
    userId: admin.id,
    tokenHash: hashRefreshToken(REFRESH_TOKEN, JWT_SECRET),
    expiresAt: new Date(Date.now() + (options.expiresInMs ?? HOUR_MS)).toISOString(),
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  const user = options.user === undefined ? admin : options.user
  const deleted: string[] = []
  const created: string[] = []
  const adapter = {
    getRefreshTokenByHash: async (hash: string) => (hash === record.tokenHash ? record : null),
    deleteRefreshToken: async (id: string) => {
      deleted.push(id)
    },
    getUser: async (id: string) => (user && id === user.id ? user : null),
    createRefreshToken: async (userId: string) => {
      created.push(userId)
      return 'refresh-2'
    },
  } as unknown as IAuthAdapter
  return { adapter, deleted, created }
}

function context(auth: AuthSection, authAdapter: IAuthAdapter | undefined): ApiContext {
  return { config: { auth }, authAdapter } as unknown as ApiContext
}

function request(method: string, cookie?: string, returnTo?: string): ApiRequest {
  return {
    method,
    path: '/api/auth/refresh',
    params: {},
    query: returnTo === undefined ? {} : { returnTo },
    headers: cookie === undefined ? {} : { cookie },
  }
}

const withToken = `krantho_refresh=${REFRESH_TOKEN}`

describe('GET /api/auth/refresh', () => {
  it('issues a new token pair and returns the browser to returnTo', async () => {
    const { adapter, deleted, created } = store()
    const res = await authRefreshRedirect(
      request('GET', withToken, '/studio/pages?tab=seo'),
      context(oidcAuth, adapter),
    )

    expect(res.status).toBe(302)
    expect(res.headers?.Location).toBe('/studio/pages?tab=seo')
    expect(res.headers?.['Cache-Control']).toBe('no-store')
    expect(res.cookies?.[0]).toMatch(/^krantho_access=[^;]+\./)
    expect(res.cookies?.[1]).toMatch(/^krantho_refresh=[^;]+;/)
    expect(deleted).toEqual(['refresh-1'])
    expect(created).toEqual(['user-1'])
  })

  it('returns to Studio when returnTo could leave the site', async () => {
    for (const returnTo of ['//evil.example', 'https://evil.example/', '/\\evil.example']) {
      const res = await authRefreshRedirect(
        request('GET', withToken, returnTo),
        context(oidcAuth, store().adapter),
      )
      expect(res.headers?.Location).toBe('/studio/')
    }
  })

  it('starts an OIDC sign-in without a usable refresh token, leaving the cookies alone', async () => {
    const cases = [
      { cookie: undefined, state: store() },
      { cookie: 'krantho_refresh=unknown-token', state: store() },
      { cookie: withToken, state: store({ expiresInMs: -HOUR_MS }) },
      { cookie: withToken, state: store({ user: { ...admin, isActive: false } }) },
      { cookie: withToken, state: store({ user: null }) },
    ]
    for (const { cookie, state } of cases) {
      const res = await authRefreshRedirect(
        request('GET', cookie, '/studio/media'),
        context(oidcAuth, state.adapter),
      )
      expect(res.status).toBe(302)
      expect(res.headers?.Location).toBe(
        `/api/auth/login/oidc?returnTo=${encodeURIComponent('/studio/media')}`,
      )
      expect(res.cookies).toEqual([])
      expect(state.created).toEqual([])
    }
  })

  it('deletes an expired or orphaned refresh token it was handed', async () => {
    const expired = store({ expiresInMs: -HOUR_MS })
    await authRefreshRedirect(request('GET', withToken), context(oidcAuth, expired.adapter))
    const inactive = store({ user: { ...admin, isActive: false } })
    await authRefreshRedirect(request('GET', withToken), context(oidcAuth, inactive.adapter))

    expect(expired.deleted).toEqual(['refresh-1'])
    expect(inactive.deleted).toEqual(['refresh-1'])
  })

  it('returns to returnTo, where Studio shows its sign-in page, outside OIDC mode', async () => {
    const tokenAuth = authSection({ mode: 'token', jwtSecret: JWT_SECRET })
    const res = await authRefreshRedirect(
      request('GET', undefined, '/studio/'),
      context(tokenAuth, store().adapter),
    )

    expect(res.status).toBe(302)
    expect(res.headers?.Location).toBe('/studio/')
  })

  it('starts a sign-in when sessions are not stored', async () => {
    const res = await authRefreshRedirect(request('GET', withToken), context(oidcAuth, undefined))

    expect(res.status).toBe(302)
    expect(res.headers?.Location).toBe(
      `/api/auth/login/oidc?returnTo=${encodeURIComponent('/studio/')}`,
    )
  })
})

describe('POST /api/auth/refresh', () => {
  it('answers the user and a new token pair', async () => {
    const res = await authRefresh(request('POST', withToken), context(oidcAuth, store().adapter))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ identity: 'admin@example.com', roles: ['admin'], name: 'Admin' })
    expect(res.cookies).toHaveLength(2)
  })

  it('answers 401 without a usable refresh token and 501 without session storage', async () => {
    const missing = await authRefresh(request('POST'), context(oidcAuth, store().adapter))
    const unstored = await authRefresh(request('POST', withToken), context(oidcAuth, undefined))

    expect(missing).toEqual({ status: 401, body: { error: 'No refresh token' } })
    expect(unstored).toEqual({ status: 501, body: { error: 'Session management not configured' } })
  })
})
