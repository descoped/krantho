import { createHash, randomBytes } from 'node:crypto'

/**
 * OIDC authentication module.
 *
 * Discovery documents and JWKS keys are cached per process — a cold instance
 * simply fetches them again. Nothing a sign-in depends on lives here: the
 * pending state, PKCE verifier and nonce travel in a sealed cookie
 * (`oidc-state.ts`), so login and callback may land on different instances.
 */

// --- OIDC Discovery ---

/** OpenID Connect discovery document (subset of fields we use) */
export interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  end_session_endpoint?: string | undefined
  userinfo_endpoint?: string | undefined
}

/** Cached discovery documents with expiry, one per issuer */
const discoveryCache = new Map<string, { doc: OidcDiscovery; expiresAt: number }>()

/** Fetch and cache the OIDC discovery document */
export async function getDiscovery(issuerUrl: string): Promise<OidcDiscovery> {
  const now = Date.now()
  const cached = discoveryCache.get(issuerUrl)
  if (cached && cached.expiresAt > now) {
    return cached.doc
  }

  const url = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: ${res.status} from ${url}`)
  }

  const doc = (await res.json()) as OidcDiscovery
  // Cache for 1 hour
  discoveryCache.set(issuerUrl, { doc, expiresAt: now + 3600_000 })
  return doc
}

/** Clear the discovery cache (for testing) */
export function clearDiscoveryCache(): void {
  discoveryCache.clear()
}

// --- JWKS ---

/** A JSON Web Key (RSA public key) */
interface Jwk {
  kty: string
  kid: string
  use?: string | undefined
  n: string
  e: string
}

/** JWKS response */
interface JwksResponse {
  keys: Jwk[]
}

/** Cached JWKS with expiry, one per key set URI */
const jwksCache = new Map<string, { keys: Jwk[]; expiresAt: number }>()

/** Fetch and cache JWKS public keys */
async function getJwks(jwksUri: string): Promise<Jwk[]> {
  const now = Date.now()
  const cached = jwksCache.get(jwksUri)
  if (cached && cached.expiresAt > now) {
    return cached.keys
  }

  const res = await fetch(jwksUri)
  if (!res.ok) {
    throw new Error(`JWKS fetch failed: ${res.status} from ${jwksUri}`)
  }

  const data = (await res.json()) as JwksResponse
  // Cache for 1 hour
  jwksCache.set(jwksUri, { keys: data.keys, expiresAt: now + 3600_000 })
  return data.keys
}

/**
 * When each key set was last refetched because a token named a key it did not hold. A token's
 * `kid` is attacker-chosen, so an unknown one may force a refetch only once a minute per key set:
 * rotation is picked up, and a stream of bogus tokens neither reaches the issuer nor evicts the keys.
 */
const forcedRefetchAt = new Map<string, number>()
const FORCED_REFETCH_COOLDOWN_MS = 60_000

/** Whether an unknown `kid` may force a refetch of this key set now, recording that it did */
function mayForceRefetch(jwksUri: string): boolean {
  const now = Date.now()
  const last = forcedRefetchAt.get(jwksUri)
  if (last !== undefined && now - last < FORCED_REFETCH_COOLDOWN_MS) return false
  forcedRefetchAt.set(jwksUri, now)
  return true
}

/** Clear one key set from the JWKS cache, or all of them (for testing) */
export function clearJwksCache(jwksUri?: string): void {
  if (jwksUri === undefined) {
    jwksCache.clear()
    forcedRefetchAt.clear()
  } else {
    jwksCache.delete(jwksUri)
    forcedRefetchAt.delete(jwksUri)
  }
}

// --- ID Token Verification ---

/** Decoded ID token claims */
export interface IdTokenClaims {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat: number
  nonce?: string | undefined
  email?: string | undefined
  email_verified?: boolean | undefined
  name?: string | undefined
  picture?: string | undefined
}

/** What an ID token is checked against */
export interface IdTokenExpectations {
  issuerUrl: string
  clientId: string
  jwksUri: string
  /** The nonce sent on the authorize request */
  nonce: string
}

/**
 * Verify the RS256 signature of a JWT against a JWKS and return its claims.
 *
 * Only RS256 is accepted, so a token signed with a symmetric algorithm (or none)
 * never gets as far as a key. The key is picked by `kid`; an unknown `kid`
 * refetches the key set, for key rotation, at most once a minute per key set. The caller checks the claims.
 */
export async function verifySignedJwt(
  token: string,
  jwksUri: string,
): Promise<Record<string, unknown>> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  // Decode header to get kid
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as {
    alg: string
    kid?: string
  } | null

  if (header?.alg !== 'RS256') {
    throw new Error(`Unsupported algorithm: ${header?.alg}. Only RS256 is supported.`)
  }

  // Fetch JWKS and find matching key
  let keys = await getJwks(jwksUri)
  let key = keys.find((k) => k.kid === header.kid && k.kty === 'RSA')

  // If key not found, fetch the key set again, at most once a minute (key rotation)
  if (!key && mayForceRefetch(jwksUri)) {
    jwksCache.delete(jwksUri)
    keys = await getJwks(jwksUri)
    key = keys.find((k) => k.kid === header.kid && k.kty === 'RSA')
  }

  if (!key) {
    throw new Error(`No matching RSA key found for kid: ${header.kid}`)
  }

  // Verify RS256 signature using Node crypto
  const { createVerify } = await import('node:crypto')
  const pem = jwkToPem(key)
  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${headerB64}.${payloadB64}`)
  const signatureBuffer = Buffer.from(signatureB64, 'base64url')

  if (!verifier.verify(pem, signatureBuffer)) {
    throw new Error('JWT signature verification failed')
  }

  const claims: unknown = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
  if (claims === null || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new Error('Invalid token claims')
  }
  return claims as Record<string, unknown>
}

/**
 * Verify an OIDC ID token.
 *
 * Checks: signature (RS256 via JWKS), expiry, issuer, audience, nonce.
 * Returns decoded claims on success.
 */
export async function verifyIdToken(
  idToken: string,
  expected: IdTokenExpectations,
): Promise<IdTokenClaims> {
  const { issuerUrl, clientId, jwksUri } = expected
  const claims = (await verifySignedJwt(idToken, jwksUri)) as unknown as IdTokenClaims

  // Validate issuer
  const normalizedIssuer = issuerUrl.replace(/\/$/, '')
  const claimIssuer = claims.iss.replace(/\/$/, '')
  if (claimIssuer !== normalizedIssuer) {
    throw new Error(`Issuer mismatch: expected ${normalizedIssuer}, got ${claimIssuer}`)
  }

  // Validate audience
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.includes(clientId)) {
    throw new Error(`Audience mismatch: ${clientId} not in ${audiences.join(', ')}`)
  }

  // Validate expiry
  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp <= now) {
    throw new Error('ID token expired')
  }

  // Validate nonce — binds the token to this browser's sign-in
  if (claims.nonce !== expected.nonce) {
    throw new Error('ID token nonce mismatch')
  }

  return claims
}

// --- PKCE ---

/** Generate a PKCE code verifier (43-128 char random string) */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

/** Compute S256 code challenge from verifier */
export function computeCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/** Generate a random state parameter for CSRF protection */
export function generateState(): string {
  return randomBytes(16).toString('hex')
}

/** Generate a random nonce binding the ID token to one sign-in */
export function generateNonce(): string {
  return randomBytes(16).toString('base64url')
}

// --- Token Exchange ---

/** The authorization-code grant sent to the token endpoint */
export interface CodeExchange {
  code: string
  redirectUri: string
  clientId: string
  /** Confidential clients only — sent as `client_secret_post`. Omitted for a public client. */
  clientSecret?: string | undefined
  codeVerifier: string
}

/** Exchange an authorization code for tokens at the provider's token endpoint */
export async function exchangeCode(
  tokenEndpoint: string,
  grant: CodeExchange,
): Promise<{ access_token: string; id_token: string; refresh_token?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: grant.code,
    redirect_uri: grant.redirectUri,
    client_id: grant.clientId,
    code_verifier: grant.codeVerifier,
  })
  if (grant.clientSecret) body.set('client_secret', grant.clientSecret)

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} — ${text}`)
  }

  return res.json() as Promise<{ access_token: string; id_token: string; refresh_token?: string }>
}

// --- Helpers ---

/** Convert a JWK RSA public key to PEM format */
function jwkToPem(jwk: Jwk): string {
  const n = Buffer.from(jwk.n, 'base64url')
  const e = Buffer.from(jwk.e, 'base64url')

  // Build DER-encoded RSA public key
  const nEncoded = encodeUnsignedInteger(n)
  const eEncoded = encodeUnsignedInteger(e)
  const sequenceContent = Buffer.concat([nEncoded, eEncoded])
  const rsaPublicKey = encodeSequence(sequenceContent)

  // Wrap in SubjectPublicKeyInfo
  const algorithmOid = Buffer.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ])
  const bitString = Buffer.concat([
    Buffer.from([0x03, ...encodeLength(rsaPublicKey.length + 1), 0x00]),
    rsaPublicKey,
  ])
  const spki = encodeSequence(Buffer.concat([algorithmOid, bitString]))

  const base64 = spki.toString('base64')
  const lines = base64.match(/.{1,64}/g) ?? []
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

function encodeLength(length: number): Buffer {
  if (length < 128) return Buffer.from([length])
  if (length < 256) return Buffer.from([0x81, length])
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff])
}

function encodeUnsignedInteger(data: Buffer): Buffer {
  if (data.length === 0) throw new Error('Cannot encode empty buffer as ASN.1 integer')
  // Add leading zero if high bit is set (to keep it positive)
  const needsPadding = data[0]! >= 0x80 // safe: length checked above
  const payload = needsPadding ? Buffer.concat([Buffer.from([0x00]), data]) : data
  return Buffer.concat([Buffer.from([0x02, ...encodeLength(payload.length)]), payload])
}

function encodeSequence(content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x30, ...encodeLength(content.length)]), content])
}
