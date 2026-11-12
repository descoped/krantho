import { createHmac, createSign, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDiscoveryCache, clearJwksCache } from '../src/oidc.js'
import { checkWorkloadAuth, WORKLOAD_PATHS } from '../src/workload-identity.js'
import { asUser, testApi, testConfig, testStores } from './assistant/fixtures.js'
import { authSection } from './auth-fixtures.js'

const ISSUER = 'https://token.actions.githubusercontent.com'
const JWKS_URI = `${ISSUER}/.well-known/jwks`
const DISCOVERY_URI = `${ISSUER}/.well-known/openid-configuration`
const AUDIENCE = 'https://example.com'
const ALLOWED_PATH = WORKLOAD_PATHS[0] ?? ''
const SUBJECT = 'repo:org/repo:ref:refs/heads/main'
const SUBJECTS = ['repo:org/repo:*', 'repo:org/exact:ref:refs/heads/main']

interface TestKey {
  kid: string
  privateKey: KeyObject
  publicPem: string
  jwk: Record<string, unknown>
}

function makeKey(kid: string): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' }
  const publicPem = publicKey.export({ format: 'pem', type: 'spki' }).toString()
  return { kid, privateKey, publicPem, jwk }
}

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')
const now = (): number => Math.floor(Date.now() / 1000)

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: SUBJECT,
    iat: now(),
    nbf: now(),
    exp: now() + 300,
    ...overrides,
  }
}

function signRs256(key: TestKey, payload: Record<string, unknown>, kid = key.kid): string {
  const signingInput = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode(payload)}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(key.privateKey)
  return `${signingInput}.${signature.toString('base64url')}`
}

/** The fake issuer: a discovery document and a key set, with switches to break each */
const issuer = {
  keys: [] as Record<string, unknown>[],
  jwksStatus: 200,
  discoveryStatus: 200,
  discoveryIssuer: ISSUER,
  fetched: [] as string[],
}

function respond(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status })
}

function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = input instanceof Request ? input.url : input.toString()
  issuer.fetched.push(url)
  if (url === DISCOVERY_URI) {
    return Promise.resolve(
      respond({ issuer: issuer.discoveryIssuer, jwks_uri: JWKS_URI }, issuer.discoveryStatus),
    )
  }
  if (url === JWKS_URI) return Promise.resolve(respond({ keys: issuer.keys }, issuer.jwksStatus))
  return Promise.resolve(respond({}, 404))
}

const jwksFetches = (): number => issuer.fetched.filter((url) => url === JWKS_URI).length

function workloadConfig() {
  return testConfig({
    auth: { workload: { issuer: ISSUER, audience: AUDIENCE, subjects: SUBJECTS } },
  })
}

function withBearer(path: string, token: string, method = 'GET') {
  const request = asUser(undefined, method, path)
  return { ...request, headers: { ...request.headers, authorization: `Bearer ${token}` } }
}

const key = makeKey('key-1')

beforeEach(() => {
  clearDiscoveryCache()
  clearJwksCache()
  issuer.keys = [key.jwk]
  issuer.jwksStatus = 200
  issuer.discoveryStatus = 200
  issuer.discoveryIssuer = ISSUER
  issuer.fetched = []
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function handle(token: string, path = ALLOWED_PATH, method = 'GET') {
  const api = testApi(testStores(), workloadConfig())
  return api.handle(withBearer(path, token, method))
}

function expectRefused(response: { status: number; body?: unknown }): void {
  expect(response.status).toBe(401)
  expect(response.body).toEqual({ error: 'Invalid workload token' })
}

describe('workload identity', () => {
  describe('a valid token', () => {
    it('is let through on the allowed path', async () => {
      const response = await handle(signRs256(key, claims()))
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it('is granted an editor named after its subject, for the allowed paths only', async () => {
      const result = await checkWorkloadAuth(
        withBearer(ALLOWED_PATH, signRs256(key, claims())),
        authSection({
          mode: 'oidc',
          workload: { issuer: ISSUER, audience: AUDIENCE, subjects: SUBJECTS },
        }),
      )
      expect(result).toEqual({
        isAuthenticated: true,
        user: {
          id: `workload:${SUBJECT}`,
          email: SUBJECT,
          name: 'CI workload',
          roles: ['editor'],
          mode: 'oidc',
        },
      })
    })

    it('may read the allowed path with HEAD', async () => {
      const response = await handle(signRs256(key, claims()), ALLOWED_PATH, 'HEAD')
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it('is accepted when the audience is one of several', async () => {
      const response = await handle(signRs256(key, claims({ aud: ['other', AUDIENCE] })))
      expect(response.status).not.toBe(401)
    })

    it('is accepted within the clock skew of its expiry', async () => {
      const response = await handle(signRs256(key, claims({ exp: now() - 30 })))
      expect(response.status).not.toBe(401)
    })

    it('is accepted for a subject that names the exact configured value', async () => {
      const response = await handle(
        signRs256(key, claims({ sub: 'repo:org/exact:ref:refs/heads/main' })),
      )
      expect(response.status).not.toBe(401)
    })

    it('is accepted for any subject under a wildcard prefix', async () => {
      const response = await handle(signRs256(key, claims({ sub: 'repo:org/repo:pull_request' })))
      expect(response.status).not.toBe(401)
    })
  })

  describe('a valid token outside its grant', () => {
    const message = { error: `This token may only read ${WORKLOAD_PATHS.join(', ')}` }

    it('is refused on another path', async () => {
      const response = await handle(signRs256(key, claims()), '/api/content/pages')
      expect(response.status).toBe(403)
      expect(response.body).toEqual(message)
    })

    it('reads the import conflicts, and may not resolve one', async () => {
      const read = await handle(signRs256(key, claims()), '/api/migrations/conflicts')
      expect([401, 403]).not.toContain(read.status)
      const resolve = await handle(
        signRs256(key, claims()),
        '/api/migrations/conflicts/1/resolve',
        'POST',
      )
      expect(resolve.status).toBe(403)
    })

    it('is refused on a path that merely starts with the allowed one', async () => {
      const response = await handle(signRs256(key, claims()), `${ALLOWED_PATH}/extra`)
      expect(response.status).toBe(403)
    })

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'is refused a %s on the allowed path',
      async (m) => {
        const response = await handle(signRs256(key, claims()), ALLOWED_PATH, m)
        expect(response.status).toBe(403)
        expect(response.body).toEqual(message)
      },
    )
  })

  describe('a token that is not accepted', () => {
    it('is refused for a wrong audience', async () => {
      expectRefused(await handle(signRs256(key, claims({ aud: 'https://evil.example' }))))
    })

    it('is refused when it has no audience', async () => {
      expectRefused(await handle(signRs256(key, claims({ aud: undefined }))))
    })

    it('is refused when expired', async () => {
      expectRefused(await handle(signRs256(key, claims({ exp: now() - 3600 }))))
    })

    it('is refused without an expiry', async () => {
      expectRefused(await handle(signRs256(key, claims({ exp: undefined }))))
    })

    it('is refused before its nbf', async () => {
      expectRefused(await handle(signRs256(key, claims({ nbf: now() + 3600 }))))
    })

    it('is refused when issued in the future', async () => {
      expectRefused(await handle(signRs256(key, claims({ iat: now() + 3600 }))))
    })

    it('is refused for a subject outside the configured patterns', async () => {
      expectRefused(await handle(signRs256(key, claims({ sub: 'repo:org/other:ref:main' }))))
    })

    it('is refused for a subject that only contains the prefix in the middle', async () => {
      expectRefused(await handle(signRs256(key, claims({ sub: 'x-repo:org/repo:ref:main' }))))
    })

    it('is refused for an exact subject with extra characters', async () => {
      const sub = 'repo:org/exact:ref:refs/heads/main-evil'
      expectRefused(await handle(signRs256(key, claims({ sub }))))
    })

    it('is refused without a subject', async () => {
      expectRefused(await handle(signRs256(key, claims({ sub: undefined }))))
    })

    it('is refused when the payload was tampered with', async () => {
      const [header, , signature] = signRs256(key, claims()).split('.')
      const forged = encode(claims({ sub: 'repo:org/repo:forged', exp: now() + 99999 }))
      expectRefused(await handle(`${header}.${forged}.${signature}`))
    })

    it('is refused when signed by a key the issuer does not publish', async () => {
      const stranger = makeKey('key-1')
      expectRefused(await handle(signRs256(stranger, claims())))
    })

    it('is refused when signed with HS256 using the public key as the secret', async () => {
      const signingInput = `${encode({ alg: 'HS256', typ: 'JWT', kid: key.kid })}.${encode(claims())}`
      const mac = createHmac('sha256', key.publicPem).update(signingInput).digest('base64url')
      expectRefused(await handle(`${signingInput}.${mac}`))
    })

    it('is refused with alg none', async () => {
      const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims())}.`
      expectRefused(await handle(token))
    })

    it('is refused when the issuer publishes a discovery document for another issuer', async () => {
      issuer.discoveryIssuer = 'https://elsewhere.example.com'
      expectRefused(await handle(signRs256(key, claims())))
    })

    it('is refused when the token is not a JWT at all', async () => {
      expectRefused(await handle(`garbage.${encode({ iss: ISSUER })}.garbage`))
    })
  })

  describe('the issuer key set', () => {
    it('is refetched once for an unknown kid, then the token is refused', async () => {
      expectRefused(await handle(signRs256(key, claims(), 'unknown-kid')))
      expect(jwksFetches()).toBe(2)
    })

    it('is refetched for an unknown kid at most once a minute, so bogus tokens cannot hammer the issuer', async () => {
      vi.useFakeTimers()
      try {
        const bogus = signRs256(key, claims(), 'unknown-kid')
        await handle(bogus)
        await handle(bogus)
        await handle(bogus)
        expect(jwksFetches()).toBe(2)

        vi.advanceTimersByTime(61_000)
        await handle(bogus)
        expect(jwksFetches()).toBe(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it('picks up a rotated key on the refetch', async () => {
      const api = testApi(testStores(), workloadConfig())
      const first = await api.handle(withBearer(ALLOWED_PATH, signRs256(key, claims())))
      expect(first.status).not.toBe(401)

      const rotated = makeKey('key-2')
      issuer.keys = [key.jwk, rotated.jwk]
      const second = await api.handle(withBearer(ALLOWED_PATH, signRs256(rotated, claims())))
      expect(second.status).not.toBe(401)
      expect(jwksFetches()).toBe(2)
    })

    it('is cached between requests', async () => {
      const api = testApi(testStores(), workloadConfig())
      await api.handle(withBearer(ALLOWED_PATH, signRs256(key, claims())))
      await api.handle(withBearer(ALLOWED_PATH, signRs256(key, claims())))
      expect(jwksFetches()).toBe(1)
    })

    it('answers 401, not 500, when the key set cannot be fetched', async () => {
      issuer.jwksStatus = 503
      expectRefused(await handle(signRs256(key, claims())))
    })

    it('answers 401, not 500, when the discovery document cannot be fetched', async () => {
      issuer.discoveryStatus = 500
      expectRefused(await handle(signRs256(key, claims())))
    })

    it('answers 401, not 500, when the network fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('connection refused'))),
      )
      expectRefused(await handle(signRs256(key, claims())))
    })

    it('is looked up through the configured issuer, never the token', async () => {
      const token = signRs256(key, claims({ iss: 'https://evil.example.com' }))
      const response = await handle(token)
      expect(response.status).toBe(401)
      expect(response.body).not.toEqual({ error: 'Invalid workload token' })
      expect(issuer.fetched).toEqual([])
    })
  })

  describe('a token from another issuer', () => {
    it('flows through the normal checks and is refused as a session token', async () => {
      const response = await handle(signRs256(key, claims({ iss: 'https://other.example.com' })))
      expect(response.status).toBe(401)
      expect(response.body).not.toEqual({ error: 'Invalid workload token' })
    })
  })

  describe('with the feature off', () => {
    it('treats a token naming the issuer as an invalid session token', async () => {
      const api = testApi(testStores(), testConfig())
      const response = await api.handle(withBearer(ALLOWED_PATH, signRs256(key, claims())))
      expect(response.status).toBe(401)
      expect(response.body).not.toEqual({ error: 'Invalid workload token' })
      expect(issuer.fetched).toEqual([])
    })

    it('stays off when the site has no authentication', async () => {
      const result = await checkWorkloadAuth(
        withBearer(ALLOWED_PATH, signRs256(key, claims())),
        authSection({
          mode: 'none',
          workload: { issuer: ISSUER, audience: AUDIENCE, subjects: SUBJECTS },
        }),
      )
      expect(result).toBeNull()
    })
  })

  describe('with the feature on', () => {
    it('leaves session tokens working unchanged', async () => {
      const api = testApi(testStores(), workloadConfig())
      const admin = { id: 'u1', email: 'a@example.com', name: 'A', roles: ['admin' as const] }
      const response = await api.handle(
        asUser({ ...admin, mode: 'token' }, 'GET', '/api/content/pages'),
      )
      expect(response.status).toBe(200)
      expect(issuer.fetched).toEqual([])
    })

    it('still refuses an unsigned write', async () => {
      const api = testApi(testStores(), workloadConfig())
      const response = await api.handle(asUser(undefined, 'POST', '/api/content/pages'))
      expect(response.status).toBe(401)
    })

    it('keeps the public routes open to a workload token', async () => {
      const api = testApi(testStores(), workloadConfig())
      const response = await api.handle(
        withBearer('/api/capabilities', signRs256(key, claims({ sub: 'repo:other/repo:x' }))),
      )
      expect(response.status).toBe(200)
    })
  })
})
