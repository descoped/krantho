import type { AuthSection } from '@krantho/config'
import { describe, expect, it } from 'vitest'
import { authLogout } from '../src/handlers/auth-logout.js'
import { signJwt } from '../src/jwt.js'
import { checkAuth } from '../src/middleware/auth.js'
import type { ApiContext, ApiRequest } from '../src/types.js'
import { authSection } from './auth-fixtures.js'

const TEST_SECRET = 'test-jwt-secret-for-auth-tests'

function req(method: string, headers?: Record<string, string>): ApiRequest {
  return { method, path: '/api/content/blog', params: {}, query: {}, headers }
}

describe('checkAuth', () => {
  describe('no-auth mode', () => {
    const config = authSection({ mode: 'none' })

    it('allows all requests without any headers', () => {
      const result = checkAuth(req('GET'), config)
      expect(result.isAuthenticated).toBe(true)
      if (result.isAuthenticated) {
        expect(result.user.email).toBe('anonymous')
        expect(result.user.mode).toBe('none')
        expect(result.user.roles).toContain('admin')
      }
    })

    it('allows write requests without auth', () => {
      const result = checkAuth(req('POST'), config)
      expect(result.isAuthenticated).toBe(true)
    })
  })

  describe('token mode', () => {
    const config = authSection({
      mode: 'token',
      token: { secret: 'secret-123' },
      jwtSecret: TEST_SECRET,
    })

    it('allows read requests without auth when reads are public', () => {
      const result = checkAuth(req('GET'), config)
      expect(result.isAuthenticated).toBe(true)
      if (result.isAuthenticated) {
        expect(result.user.roles).toContain('viewer')
      }
    })

    it('blocks read requests when requireAuthForReads is true', () => {
      const strictConfig: AuthSection = { ...config, requireAuthForReads: true }
      const result = checkAuth(req('GET'), strictConfig)
      expect(result.isAuthenticated).toBe(false)
      if (!result.isAuthenticated) {
        expect(result.response.status).toBe(401)
      }
    })

    it('blocks write requests without auth', () => {
      const result = checkAuth(req('POST'), config)
      expect(result.isAuthenticated).toBe(false)
      if (!result.isAuthenticated) {
        expect(result.response.status).toBe(401)
      }
    })

    it('allows write requests with valid JWT', () => {
      const jwt = signJwt(
        { sub: 'user-1', email: 'test@example.com', name: 'Test', roles: ['editor'] },
        TEST_SECRET,
      )
      const result = checkAuth(req('POST', { authorization: `Bearer ${jwt}` }), config)
      expect(result.isAuthenticated).toBe(true)
      if (result.isAuthenticated) {
        expect(result.user.email).toBe('test@example.com')
        expect(result.user.roles).toContain('editor')
      }
    })

    it('rejects invalid token', () => {
      const result = checkAuth(req('POST', { authorization: 'Bearer wrong-token' }), config)
      expect(result.isAuthenticated).toBe(false)
      if (!result.isAuthenticated) {
        expect(result.response.status).toBe(401)
      }
    })

    it('rejects expired JWT', () => {
      const jwt = signJwt(
        { sub: 'user-1', email: 'test@example.com', name: 'Test', roles: ['admin'] },
        TEST_SECRET,
        -10, // expired 10 seconds ago
      )
      const result = checkAuth(req('POST', { authorization: `Bearer ${jwt}` }), config)
      expect(result.isAuthenticated).toBe(false)
      if (!result.isAuthenticated) {
        expect(result.response.body).toEqual({ error: 'Token expired' })
      }
    })

    it('rejects JWT with wrong secret', () => {
      const jwt = signJwt(
        { sub: 'user-1', email: 'test@example.com', name: 'Test', roles: ['admin'] },
        'wrong-secret',
      )
      const result = checkAuth(req('POST', { authorization: `Bearer ${jwt}` }), config)
      expect(result.isAuthenticated).toBe(false)
      if (!result.isAuthenticated) {
        expect(result.response.body).toEqual({ error: 'Invalid signature' })
      }
    })

    it('rejects malformed authorization header', () => {
      const result = checkAuth(req('POST', { authorization: 'Basic abc123' }), config)
      expect(result.isAuthenticated).toBe(false)
    })
  })

  describe('oidc mode', () => {
    const config = authSection({
      mode: 'oidc',
      oidc: { issuer: 'https://accounts.google.com' },
      jwtSecret: TEST_SECRET,
    })

    it('allows valid JWT in oidc mode', () => {
      const jwt = signJwt(
        { sub: 'oidc-user', email: 'user@google.com', name: 'Google User', roles: ['editor'] },
        TEST_SECRET,
      )
      const result = checkAuth(req('POST', { authorization: `Bearer ${jwt}` }), config)
      expect(result.isAuthenticated).toBe(true)
      if (result.isAuthenticated) {
        expect(result.user.email).toBe('user@google.com')
        expect(result.user.mode).toBe('oidc')
      }
    })

    it('rejects invalid JWT in oidc mode', () => {
      const result = checkAuth(req('POST', { authorization: 'Bearer invalid-jwt' }), config)
      expect(result.isAuthenticated).toBe(false)
      if (!result.isAuthenticated) {
        expect(result.response.status).toBe(401)
      }
    })
  })
})

describe('authLogout', () => {
  it('clears both cookies as separate Set-Cookie values, not folded into headers', async () => {
    const ctx = {
      config: { auth: authSection({ mode: 'token', jwtSecret: TEST_SECRET }) },
      authAdapter: undefined,
    } as unknown as ApiContext

    const res = await authLogout(req('POST'), ctx)

    expect(res.cookies).toHaveLength(2)
    expect(res.cookies?.[0]).toContain('krantho_access=')
    expect(res.cookies?.[1]).toContain('krantho_refresh=')
    // both expire immediately
    expect(res.cookies?.every((c) => c.includes('Max-Age=0'))).toBe(true)
    // cookies must not ride on the single-valued headers map
    expect(res.headers?.['Set-Cookie']).toBeUndefined()
  })
})
