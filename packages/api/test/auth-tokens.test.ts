import type { IAuthAdapter } from '@krantho/persistence'
import { describe, expect, it, vi } from 'vitest'
import { clearSessionCookies, issueTokenPair } from '../src/auth-tokens.js'
import { authSection } from './auth-fixtures.js'

const TEST_SECRET = 'test-jwt-secret-for-token-tests'
const USER = { id: 'u1', email: 'admin@example.com', name: 'Admin', roles: ['admin'] as const }

function issue(auth = authSection(), authAdapter?: IAuthAdapter, headers?: Record<string, string>) {
  return issueTokenPair({ user: USER, jwtSecret: TEST_SECRET, auth, headers, authAdapter })
}

describe('issueTokenPair', () => {
  it('returns access and refresh as two distinct cookies when an auth adapter is present', async () => {
    const createRefreshToken = vi.fn<IAuthAdapter['createRefreshToken']>(async () => 'refresh-id')
    const authAdapter = { createRefreshToken } as unknown as IAuthAdapter

    const { cookies } = await issue(authSection(), authAdapter)

    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toMatch(/^krantho_access=/)
    expect(cookies[1]).toMatch(/^krantho_refresh=/)
    // Never folded — no single value carries both cookies
    expect(cookies.some((c) => c.includes('krantho_access') && c.includes('krantho_refresh'))).toBe(
      false,
    )
    expect(createRefreshToken).toHaveBeenCalledOnce()
  })

  it('returns only the access cookie when no auth adapter is present', async () => {
    const { cookies } = await issue()

    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toMatch(/^krantho_access=/)
  })

  it('carries the default session TTL and flags', async () => {
    const { cookies } = await issue()

    expect(cookies[0]).toContain('Max-Age=900')
    expect(cookies[0]).toContain('HttpOnly')
    expect(cookies[0]).toContain('SameSite=Lax')
    expect(cookies[0]).toContain('Path=/')
    expect(cookies[0]).not.toContain('Secure')
  })

  it('takes cookie names from the session prefix and TTLs from the session config', async () => {
    const createRefreshToken = vi.fn<IAuthAdapter['createRefreshToken']>(async () => 'refresh-id')
    const authAdapter = { createRefreshToken } as unknown as IAuthAdapter
    const auth = authSection({
      session: { cookiePrefix: 'acme', accessTtlSec: 60, refreshTtlSec: 120, sameSite: 'strict' },
    })

    const { cookies } = await issue(auth, authAdapter)

    expect(cookies[0]).toMatch(/^acme_access=/)
    expect(cookies[0]).toContain('Max-Age=60')
    expect(cookies[0]).toContain('SameSite=Strict')
    expect(cookies[1]).toMatch(/^acme_refresh=/)
    expect(cookies[1]).toContain('Max-Age=120')
  })
})

describe('clearSessionCookies', () => {
  it('expires both cookies with the default names', () => {
    const cookies = clearSessionCookies(authSection(), undefined)

    expect(cookies).toEqual([
      'krantho_access=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
      'krantho_refresh=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    ])
  })
})
