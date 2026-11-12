import { describe, expect, it } from 'vitest'
import {
  accessCookieName,
  buildCookie,
  isSecureRequest,
  refreshCookieName,
} from '../src/cookies.js'
import { authSection } from './auth-fixtures.js'

describe('cookie names', () => {
  it('derive from the session prefix', () => {
    const { session } = authSection()
    expect(accessCookieName(session)).toBe('krantho_access')
    expect(refreshCookieName(session)).toBe('krantho_refresh')
  })
})

describe('buildCookie', () => {
  it('omits Secure when the request is not secure', () => {
    expect(buildCookie('k', 'v', 900, false, 'lax')).toBe(
      'k=v; HttpOnly; SameSite=Lax; Path=/; Max-Age=900',
    )
  })

  it('adds Secure and maps the SameSite attribute', () => {
    expect(buildCookie('k', 'v', 900, true, 'none')).toBe(
      'k=v; HttpOnly; SameSite=None; Path=/; Secure; Max-Age=900',
    )
  })
})

describe('isSecureRequest', () => {
  const auto = authSection()

  it('trusts a verbatim x-forwarded-proto: https without trustProxy', () => {
    expect(isSecureRequest({ 'x-forwarded-proto': 'https' }, auto)).toBe(true)
  })

  it('is false without any proxy header', () => {
    expect(isSecureRequest(undefined, auto)).toBe(false)
    expect(isSecureRequest({ 'x-forwarded-proto': 'http' }, auto)).toBe(false)
  })

  it('ignores the wider proxy headers unless trustProxy is set', () => {
    expect(isSecureRequest({ 'x-forwarded-proto': 'https, http' }, auto)).toBe(false)
    expect(isSecureRequest({ 'x-forwarded-ssl': 'on' }, auto)).toBe(false)
    expect(isSecureRequest({ forwarded: 'for=1.2.3.4;proto=https' }, auto)).toBe(false)
  })

  it('accepts the wider proxy headers when trustProxy is set', () => {
    const trusting = authSection({ trustProxy: true })
    expect(isSecureRequest({ 'x-forwarded-proto': 'https, http' }, trusting)).toBe(true)
    expect(isSecureRequest({ 'x-forwarded-ssl': 'on' }, trusting)).toBe(true)
    expect(isSecureRequest({ forwarded: 'for=1.2.3.4;proto=https' }, trusting)).toBe(true)
    expect(isSecureRequest({ forwarded: 'for=1.2.3.4;proto=http' }, trusting)).toBe(false)
  })

  it('always and never override the request', () => {
    expect(isSecureRequest(undefined, authSection({ session: { secure: 'always' } }))).toBe(true)
    expect(
      isSecureRequest(
        { 'x-forwarded-proto': 'https' },
        authSection({ session: { secure: 'never' } }),
      ),
    ).toBe(false)
  })
})
