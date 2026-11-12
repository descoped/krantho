import { describe, expect, it } from 'vitest'
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from '../src/oidc.js'
import { OIDC_STATE_TTL_SEC, openOidcState, sealOidcState } from '../src/oidc-state.js'

describe('PKCE', () => {
  describe('generateCodeVerifier', () => {
    it('generates a base64url string', () => {
      const verifier = generateCodeVerifier()
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(verifier.length).toBeGreaterThanOrEqual(32)
    })

    it('generates unique verifiers', () => {
      const v1 = generateCodeVerifier()
      const v2 = generateCodeVerifier()
      expect(v1).not.toBe(v2)
    })
  })

  describe('computeCodeChallenge', () => {
    it('produces a base64url SHA-256 hash', () => {
      const verifier = 'test-verifier'
      const challenge = computeCodeChallenge(verifier)
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('is deterministic', () => {
      const verifier = 'same-verifier'
      const c1 = computeCodeChallenge(verifier)
      const c2 = computeCodeChallenge(verifier)
      expect(c1).toBe(c2)
    })

    it('differs for different verifiers', () => {
      const c1 = computeCodeChallenge('verifier-a')
      const c2 = computeCodeChallenge('verifier-b')
      expect(c1).not.toBe(c2)
    })
  })

  describe('generateState', () => {
    it('generates a hex string', () => {
      const state = generateState()
      expect(state).toMatch(/^[0-9a-f]+$/)
    })
  })
})

describe('generateNonce', () => {
  it('generates unique base64url nonces', () => {
    const n1 = generateNonce()
    expect(n1).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(n1).not.toBe(generateNonce())
  })
})

describe('sealed OIDC state', () => {
  const SECRET = 'state-secret-for-tests'
  const pending = {
    state: 'state-1',
    codeVerifier: 'verifier-1',
    nonce: 'nonce-1',
    returnTo: '/studio/pages',
  }

  it('round-trips a pending sign-in', () => {
    expect(openOidcState(sealOidcState(pending, SECRET), SECRET)).toEqual(pending)
  })

  it('hides the verifier and nonce from the browser', () => {
    const sealed = sealOidcState(pending, SECRET)
    const decoded = Buffer.from(sealed, 'base64url').toString('latin1')
    expect(decoded).not.toContain('verifier-1')
    expect(decoded).not.toContain('nonce-1')
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('rejects a value sealed under another secret', () => {
    expect(openOidcState(sealOidcState(pending, 'other-secret'), SECRET)).toBeNull()
  })

  it('rejects a tampered value', () => {
    const raw = Buffer.from(sealOidcState(pending, SECRET), 'base64url')
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff
    expect(openOidcState(raw.toString('base64url'), SECRET)).toBeNull()
  })

  it('rejects a missing, truncated or garbage value', () => {
    expect(openOidcState(undefined, SECRET)).toBeNull()
    expect(openOidcState('', SECRET)).toBeNull()
    expect(openOidcState('abc', SECRET)).toBeNull()
    expect(openOidcState('not base64 at all!', SECRET)).toBeNull()
  })

  it('expires after the TTL', () => {
    const sealedAt = Date.now()
    const sealed = sealOidcState(pending, SECRET, sealedAt)
    const justBefore = sealedAt + OIDC_STATE_TTL_SEC * 1000 - 1
    expect(openOidcState(sealed, SECRET, justBefore)).toEqual(pending)
    expect(openOidcState(sealed, SECRET, justBefore + 1)).toBeNull()
  })
})
