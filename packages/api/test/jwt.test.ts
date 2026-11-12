import { describe, expect, it } from 'vitest'
import { generateRefreshToken, hashRefreshToken, signJwt, verifyJwt } from '../src/jwt.js'

const SECRET = 'test-secret-key-for-jwt-tests'

describe('signJwt / verifyJwt', () => {
  it('creates and verifies a valid JWT', () => {
    const token = signJwt(
      { sub: 'user-1', email: 'test@example.com', name: 'Test User', roles: ['admin'] },
      SECRET,
    )

    const result = verifyJwt(token, SECRET)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.claims.sub).toBe('user-1')
      expect(result.claims.email).toBe('test@example.com')
      expect(result.claims.roles).toEqual(['admin'])
      expect(result.claims.iat).toBeTypeOf('number')
      expect(result.claims.exp).toBeGreaterThan(result.claims.iat)
    }
  })

  it('rejects tokens signed with a different secret', () => {
    const token = signJwt(
      { sub: 'user-1', email: 'test@example.com', name: 'Test', roles: ['admin'] },
      SECRET,
    )

    const result = verifyJwt(token, 'wrong-secret')
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toBe('Invalid signature')
    }
  })

  it('rejects expired tokens', () => {
    const token = signJwt(
      { sub: 'user-1', email: 'test@example.com', name: 'Test', roles: ['admin'] },
      SECRET,
      -10, // expired 10 seconds ago
    )

    const result = verifyJwt(token, SECRET)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toBe('Token expired')
    }
  })

  it('rejects malformed tokens', () => {
    expect(verifyJwt('not-a-jwt', SECRET).valid).toBe(false)
    expect(verifyJwt('a.b', SECRET).valid).toBe(false)
    expect(verifyJwt('', SECRET).valid).toBe(false)
  })

  it('rejects tokens with missing sub', () => {
    // Manually craft a token with empty sub
    const token = signJwt(
      { sub: '', email: 'test@example.com', name: 'Test', roles: ['admin'] },
      SECRET,
    )
    const result = verifyJwt(token, SECRET)
    expect(result.valid).toBe(false)
  })

  it('rejects tokens with missing roles', () => {
    const token = signJwt(
      { sub: 'user-1', email: 'test@example.com', name: 'Test', roles: [] },
      SECRET,
    )
    const result = verifyJwt(token, SECRET)
    expect(result.valid).toBe(false)
  })

  it('respects custom expiry', () => {
    const token = signJwt(
      { sub: 'user-1', email: 'test@example.com', name: 'Test', roles: ['viewer'] },
      SECRET,
      3600, // 1 hour
    )

    const result = verifyJwt(token, SECRET)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.claims.exp - result.claims.iat).toBe(3600)
    }
  })
})

describe('generateRefreshToken', () => {
  it('generates a 64-char hex string', () => {
    const token = generateRefreshToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates unique tokens', () => {
    const t1 = generateRefreshToken()
    const t2 = generateRefreshToken()
    expect(t1).not.toBe(t2)
  })
})

describe('hashRefreshToken', () => {
  it('returns consistent hash for same input', () => {
    const h1 = hashRefreshToken('test-token', SECRET)
    const h2 = hashRefreshToken('test-token', SECRET)
    expect(h1).toBe(h2)
  })

  it('returns different hash for different input', () => {
    const h1 = hashRefreshToken('token-a', SECRET)
    const h2 = hashRefreshToken('token-b', SECRET)
    expect(h1).not.toBe(h2)
  })

  it('returns a hex string', () => {
    const hash = hashRefreshToken('test', SECRET)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('returns different hash for different secret', () => {
    const h1 = hashRefreshToken('test-token', 'secret-a')
    const h2 = hashRefreshToken('test-token', 'secret-b')
    expect(h1).not.toBe(h2)
  })
})
