import { createHash, createSign, generateKeyPairSync } from 'node:crypto'
import type { AuthSection } from '@krantho/config'
import type { CreateUserData, IAuthAdapter, UserRecord } from '@krantho/persistence'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyJwt } from '../src/jwt.js'
import type { ApiContext, ApiRequest, ApiResponse } from '../src/types.js'
import { authSection } from './auth-fixtures.js'

/*
 * The whole OIDC sign-in against a provider shaped like Sign in with Vercel
 * (endpoints from https://vercel.com/.well-known/openid-configuration). Login
 * and callback each run on a freshly imported module graph, the way two
 * serverless instances would: nothing but the browser's cookie connects them.
 */

const ISSUER = 'https://vercel.com'
const CLIENT_ID = 'cl_krantho_test'
const CLIENT_SECRET = 'vercel-client-secret'
const REDIRECT_URI = 'https://krantho.example/api/auth/callback'
const JWT_SECRET = 'x'.repeat(64)
const HTTPS = { 'x-forwarded-proto': 'https' }

const DISCOVERY = {
  issuer: ISSUER,
  authorization_endpoint: 'https://vercel.com/oauth/authorize',
  token_endpoint: 'https://api.vercel.com/login/oauth/token',
  userinfo_endpoint: 'https://api.vercel.com/login/oauth/userinfo',
  jwks_uri: 'https://vercel.com/.well-known/jwks',
  scopes_supported: ['openid', 'email', 'profile', 'offline_access'],
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: [
    'client_secret_basic',
    'client_secret_post',
    'client_secret_jwt',
    'private_key_jwt',
  ],
  id_token_signing_alg_values_supported: ['RS256'],
  code_challenge_methods_supported: ['S256'],
  claims_supported: ['sub', 'email', 'email_verified', 'name', 'preferred_username', 'picture'],
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWK = { ...(publicKey.export({ format: 'jwk' }) as object), kid: 'vercel-1', use: 'sig' }

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signIdToken(claims: Record<string, unknown>): string {
  const signingInput = `${b64({ alg: 'RS256', kid: 'vercel-1', typ: 'JWT' })}.${b64(claims)}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey)
  return `${signingInput}.${signature.toString('base64url')}`
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface ProviderOptions {
  /** The client authentication the Vercel app is set to */
  clientAuth: 'none' | 'client_secret_post'
  claims?: Record<string, unknown>
  /** Overrides the nonce echoed in the ID token */
  nonce?: string
  userinfo?: Record<string, unknown>
}

/** A Sign in with Vercel stand-in: authorize, token (with PKCE check), JWKS, userinfo */
class FakeVercel {
  readonly tokenRequests: URLSearchParams[] = []
  readonly userinfoRequests: RequestInit[] = []
  private readonly grants = new Map<string, { challenge: string; nonce: string }>()

  constructor(private readonly options: ProviderOptions) {}

  /** The browser visits the authorize URL; the provider hands back a code */
  authorize(location: string): string {
    const url = new URL(location)
    const code = `code-${this.grants.size + 1}`
    this.grants.set(code, {
      challenge: url.searchParams.get('code_challenge') ?? '',
      nonce: url.searchParams.get('nonce') ?? '',
    })
    return code
  }

  handle(url: string, init: RequestInit | undefined): Response {
    if (url === `${ISSUER}/.well-known/openid-configuration`) return json(DISCOVERY)
    if (url === DISCOVERY.jwks_uri) return json({ keys: [JWK] })
    if (url === DISCOVERY.token_endpoint) return this.token(new URLSearchParams(String(init?.body)))
    if (url === DISCOVERY.userinfo_endpoint) {
      this.userinfoRequests.push(init ?? {})
      return json(this.options.userinfo ?? {})
    }
    return json({ error: 'not_found' }, 404)
  }

  private token(body: URLSearchParams): Response {
    this.tokenRequests.push(body)
    const grant = this.grants.get(body.get('code') ?? '')
    const verifier = body.get('code_verifier') ?? ''
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    if (!grant || challenge !== grant.challenge) return json({ error: 'invalid_grant' }, 400)
    if (this.options.clientAuth === 'client_secret_post') {
      if (body.get('client_secret') !== CLIENT_SECRET) return json({ error: 'invalid_client' }, 401)
    }

    const now = Math.floor(Date.now() / 1000)
    const idToken = signIdToken({
      iss: ISSUER,
      sub: 'vercel-user-1',
      aud: CLIENT_ID,
      iat: now,
      exp: now + 300,
      nonce: this.options.nonce ?? grant.nonce,
      email: 'owner@example.com',
      email_verified: true,
      name: 'Site Owner',
      preferred_username: 'owner',
      ...this.options.claims,
    })
    return json({ access_token: 'vercel-access', token_type: 'Bearer', id_token: idToken })
  }
}

/** An in-memory user table */
function memoryAuthAdapter(): IAuthAdapter & { users: UserRecord[] } {
  const users: UserRecord[] = []
  const now = new Date().toISOString()
  return {
    users,
    async createUser(data: CreateUserData) {
      const user: UserRecord = {
        id: `user-${users.length + 1}`,
        email: data.email,
        name: data.name,
        roles: data.roles,
        oidcSubject: data.oidcSubject ?? null,
        oidcIssuer: data.oidcIssuer ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }
      users.push(user)
      return user
    },
    async getUser(id: string) {
      return users.find((u) => u.id === id) ?? null
    },
    async getUserByEmail(email: string) {
      return users.find((u) => u.email === email) ?? null
    },
    async getUserByOidc(issuer: string, subject: string) {
      return users.find((u) => u.oidcIssuer === issuer && u.oidcSubject === subject) ?? null
    },
    async updateUser(id: string, data: Partial<UserRecord>) {
      const user = users.find((u) => u.id === id)
      if (!user) return null
      Object.assign(user, data)
      return user
    },
    async createRefreshToken() {
      return 'refresh-id'
    },
  } as unknown as IAuthAdapter & { users: UserRecord[] }
}

function oidcAuth(oidc: Partial<AuthSection['oidc']> = {}): AuthSection {
  return authSection({
    mode: 'oidc',
    jwtSecret: JWT_SECRET,
    oidc: { issuer: ISSUER, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, ...oidc },
  })
}

function request(query: Record<string, string>, cookie?: string): ApiRequest {
  const headers: Record<string, string> = cookie ? { ...HTTPS, cookie } : { ...HTTPS }
  return { method: 'GET', path: '/api/auth', params: {}, query, headers }
}

/** Import the handlers on a fresh module graph — a new serverless instance */
async function freshInstance() {
  vi.resetModules()
  const { authOidcLogin } = await import('../src/handlers/auth-oidc-login.js')
  const { authCallback } = await import('../src/handlers/auth-callback.js')
  return { authOidcLogin, authCallback }
}

function location(res: ApiResponse): string {
  return res.headers?.['Location'] ?? ''
}

/** The `name=value` pair a browser sends back for a Set-Cookie value */
function cookiePair(setCookie: string): string {
  return setCookie.split('; ')[0] ?? ''
}

interface SignIn {
  login: ApiResponse
  callback: ApiResponse
  users: UserRecord[]
}

/** Run login on one instance and the callback on another */
async function signIn(
  provider: FakeVercel,
  auth: AuthSection,
  loginQuery: Record<string, string> = {},
): Promise<SignIn> {
  const authAdapter = memoryAuthAdapter()
  const ctx = { config: { auth }, authAdapter } as unknown as ApiContext

  const login = await (await freshInstance()).authOidcLogin(request(loginQuery), ctx)
  const state = new URL(location(login)).searchParams.get('state') ?? ''
  const code = provider.authorize(location(login))

  const callback = await (await freshInstance()).authCallback(
    request({ code, state }, cookiePair(login.cookies?.[0] ?? '')),
    ctx,
  )
  return { login, callback, users: authAdapter.users }
}

let provider: FakeVercel

function useProvider(options: ProviderOptions): void {
  provider = new FakeVercel(options)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => provider.handle(String(input), init)),
  )
}

beforeEach(() => useProvider({ clientAuth: 'none' }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OIDC login against Sign in with Vercel', () => {
  it('redirects to the authorize endpoint with PKCE, nonce and scopes', async () => {
    const { authOidcLogin } = await freshInstance()
    const res = await authOidcLogin(request({}), {
      config: { auth: oidcAuth() },
    } as unknown as ApiContext)

    expect(res.status).toBe(302)
    const url = new URL(location(res))
    expect(`${url.origin}${url.pathname}`).toBe(DISCOVERY.authorization_endpoint)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(url.searchParams.get('nonce')).toBeTruthy()
  })

  it('sets a short-lived HttpOnly Lax state cookie that reveals nothing', async () => {
    const { authOidcLogin } = await freshInstance()
    const res = await authOidcLogin(request({}), {
      config: { auth: oidcAuth() },
    } as unknown as ApiContext)

    const [setCookie] = res.cookies ?? []
    expect(setCookie).toMatch(/^krantho_oidc=[A-Za-z0-9_-]+; /)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('Max-Age=600')
    const nonce = new URL(location(res)).searchParams.get('nonce') ?? ''
    expect(setCookie).not.toContain(nonce)
  })
})

describe('OIDC callback on another instance', () => {
  it('signs in a public client without sending a client secret', async () => {
    const { callback, users } = await signIn(provider, oidcAuth({ signup: 'open' }))

    expect(location(callback)).toBe('/studio/')
    expect(provider.tokenRequests).toHaveLength(1)
    expect(provider.tokenRequests[0]?.has('client_secret')).toBe(false)
    expect(provider.tokenRequests[0]?.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(provider.userinfoRequests).toHaveLength(0)

    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({
      email: 'owner@example.com',
      name: 'Site Owner',
      oidcIssuer: ISSUER,
      oidcSubject: 'vercel-user-1',
      roles: ['viewer'],
    })

    const [clearState, access, refresh] = callback.cookies ?? []
    expect(clearState).toMatch(/^krantho_oidc=; .*Max-Age=0$/)
    expect(refresh).toMatch(/^krantho_refresh=/)
    const token = cookiePair(access ?? '').replace('krantho_access=', '')
    const verified = verifyJwt(token, JWT_SECRET)
    expect(verified.valid && verified.claims.email).toBe('owner@example.com')
  })

  it('sends the client secret as client_secret_post for a confidential client', async () => {
    useProvider({ clientAuth: 'client_secret_post' })
    const auth = oidcAuth({ signup: 'open', clientSecret: CLIENT_SECRET })

    const { callback } = await signIn(provider, auth)

    expect(provider.tokenRequests[0]?.get('client_secret')).toBe(CLIENT_SECRET)
    expect(location(callback)).toBe('/studio/')
    expect(callback.cookies?.some((c) => c.startsWith('krantho_access='))).toBe(true)
  })

  it('fails when the provider requires a secret the client does not send', async () => {
    useProvider({ clientAuth: 'client_secret_post' })

    const { callback, users } = await signIn(provider, oidcAuth({ signup: 'open' }))

    expect(location(callback)).toContain('error=')
    expect(decodeURIComponent(location(callback))).toContain('invalid_client')
    expect(users).toHaveLength(0)
  })

  it('rejects an ID token whose nonce does not match the sign-in', async () => {
    useProvider({ clientAuth: 'none', nonce: 'someone-elses-nonce' })

    const { callback, users } = await signIn(provider, oidcAuth({ signup: 'open' }))

    expect(decodeURIComponent(location(callback))).toContain('nonce mismatch')
    expect(callback.cookies).toEqual([expect.stringMatching(/^krantho_oidc=; /)])
    expect(users).toHaveLength(0)
  })

  it('rejects a callback without the state cookie, with a wrong state, or a forged cookie', async () => {
    const ctx = {
      config: { auth: oidcAuth({ signup: 'open' }) },
      authAdapter: memoryAuthAdapter(),
    } as unknown as ApiContext
    const { authOidcLogin, authCallback } = await freshInstance()
    const login = await authOidcLogin(request({}), ctx)
    const state = new URL(location(login)).searchParams.get('state') ?? ''
    const cookie = cookiePair(login.cookies?.[0] ?? '')

    const attempts = [
      request({ code: 'c', state }),
      request({ code: 'c', state: 'other-state' }, cookie),
      request({ code: 'c', state }, 'krantho_oidc=forged-value-forged-value-forged-value'),
    ]
    for (const attempt of attempts) {
      const res = await authCallback(attempt, ctx)
      expect(decodeURIComponent(location(res))).toContain('Invalid or expired state parameter')
    }
    expect(provider.tokenRequests).toHaveLength(0)
  })

  it('returns to the same-origin path the login named, and nowhere else', async () => {
    const auth = oidcAuth({ signup: 'open' })

    const kept = await signIn(provider, auth, { returnTo: '/studio/pages/about' })
    expect(location(kept.callback)).toBe('/studio/pages/about')

    for (const returnTo of ['//evil.example', 'https://evil.example', '/\\evil.example']) {
      const dropped = await signIn(provider, auth, { returnTo })
      expect(location(dropped.callback)).toBe('/studio/')
    }
  })

  it('falls back to userinfo with a Bearer GET only when the ID token has no email', async () => {
    useProvider({
      clientAuth: 'none',
      claims: { email: undefined, email_verified: undefined },
      userinfo: { email: 'owner@example.com', email_verified: true, name: 'From Userinfo' },
    })

    const { callback, users } = await signIn(provider, oidcAuth({ signup: 'open' }))

    expect(location(callback)).toBe('/studio/')
    expect(provider.userinfoRequests).toHaveLength(1)
    expect(provider.userinfoRequests[0]?.method).toBeUndefined()
    expect(provider.userinfoRequests[0]?.headers).toEqual({ Authorization: 'Bearer vercel-access' })
    expect(users[0]?.email).toBe('owner@example.com')
  })
})

describe('first admin on a closed signup', () => {
  it('creates an admin for a verified email listed in adminEmails', async () => {
    const auth = oidcAuth({ signup: 'closed', adminEmails: ['Owner@Example.com'] })

    const { callback, users } = await signIn(provider, auth)

    expect(location(callback)).toBe('/studio/')
    expect(users).toHaveLength(1)
    expect(users[0]?.roles).toEqual(['admin'])
  })

  it('creates Studio when the provider sends no email_verified claim', async () => {
    useProvider({ clientAuth: 'none', claims: { email_verified: undefined } })
    const auth = oidcAuth({ signup: 'closed', adminEmails: ['owner@example.com'] })

    const { users } = await signIn(provider, auth)

    expect(users[0]?.roles).toEqual(['admin'])
  })

  it('refuses a listed email the provider marks unverified', async () => {
    useProvider({ clientAuth: 'none', claims: { email_verified: false } })
    const auth = oidcAuth({ signup: 'closed', adminEmails: ['owner@example.com'] })

    const { callback, users } = await signIn(provider, auth)

    expect(decodeURIComponent(location(callback))).toContain('User not authorized')
    expect(users).toHaveLength(0)
  })

  it('still refuses everyone not listed', async () => {
    const auth = oidcAuth({ signup: 'closed', adminEmails: ['someone-else@example.com'] })

    const { callback, users } = await signIn(provider, auth)

    expect(decodeURIComponent(location(callback))).toContain('User not authorized')
    expect(callback.cookies?.some((c) => c.startsWith('krantho_access='))).toBe(false)
    expect(users).toHaveLength(0)
  })
})

describe('OIDC sign-in with Studio gated (studioEntry redirect)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers 404 instead of Studio error page when krantho refuses the user', async () => {
    const auth = oidcAuth({
      studioEntry: 'redirect',
      signup: 'closed',
      adminEmails: ['someone-else@example.com'],
    })

    const { callback, users } = await signIn(provider, auth)

    expect(callback.status).toBe(404)
    expect(location(callback)).toBe('')
    expect(callback.cookies?.some((c) => c.startsWith('krantho_access='))).toBe(false)
    expect(users).toHaveLength(0)
  })

  it('answers 404 when the provider denies access', async () => {
    const ctx = {
      config: { auth: oidcAuth({ studioEntry: 'redirect' }) },
      authAdapter: memoryAuthAdapter(),
    } as unknown as ApiContext

    const callback = await (await freshInstance()).authCallback(
      request({ error: 'access_denied', error_description: 'Not a member of the team' }),
      ctx,
    )

    expect(callback.status).toBe(404)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Not a member of the team'))
  })
})
