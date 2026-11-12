import { createHmac, randomBytes } from 'node:crypto'
import type { AuthSection } from '@krantho/config'
import type { Role } from '@krantho/persistence'

/** Claims embedded in a krantho access token JWT */
export interface JwtClaims {
  /** User ID (UUID) */
  sub: string
  /** User email */
  email: string
  /** Display name */
  name: string
  /** Assigned roles */
  roles: Role[]
  /** Issued at (unix seconds) */
  iat: number
  /** Expires at (unix seconds) */
  exp: number
}

/** Result of verifying a JWT */
export type VerifyResult = { valid: true; claims: JwtClaims } | { valid: false; error: string }

/** Base64url encode a buffer */
function base64url(data: Buffer): string {
  return data.toString('base64url')
}

/** Base64url encode a string */
function base64urlStr(str: string): string {
  return base64url(Buffer.from(str, 'utf-8'))
}

/** Base64url decode to string */
function base64urlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8')
}

const JWT_HEADER = base64urlStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))

/**
 * Sign a JWT with HS256.
 *
 * @param claims - Token claims (sub, email, name, roles)
 * @param secret - HMAC secret (`config.auth.jwtSecret`)
 * @param expiresInSeconds - Token lifetime in seconds (default: 900 = 15 minutes)
 */
export function signJwt(
  claims: Omit<JwtClaims, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds = 900,
): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: JwtClaims = {
    ...claims,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const payloadEncoded = base64urlStr(JSON.stringify(payload))
  const data = `${JWT_HEADER}.${payloadEncoded}`
  const signature = createHmac('sha256', secret).update(data).digest()

  return `${data}.${base64url(signature)}`
}

/**
 * Verify a JWT signature and check expiry.
 *
 * @param token - The full JWT string
 * @param secret - HMAC secret (must match the signing secret)
 */
export function verifyJwt(token: string, secret: string): VerifyResult {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid JWT format' }
  }

  const [header, payload, signature] = parts as [string, string, string]

  // Verify signature
  const data = `${header}.${payload}`
  const expectedSignature = createHmac('sha256', secret).update(data).digest()
  const actualSignature = Buffer.from(signature, 'base64url')

  if (!expectedSignature.equals(actualSignature)) {
    return { valid: false, error: 'Invalid signature' }
  }

  // Decode and validate claims
  let claims: JwtClaims
  try {
    claims = JSON.parse(base64urlDecode(payload)) as JwtClaims
  } catch {
    return { valid: false, error: 'Invalid JWT payload' }
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp <= now) {
    return { valid: false, error: 'Token expired' }
  }

  // Validate required fields
  if (typeof claims.sub !== 'string' || !claims.sub) {
    return { valid: false, error: 'Missing sub claim' }
  }

  if (!Array.isArray(claims.roles) || claims.roles.length === 0) {
    return { valid: false, error: 'Missing roles claim' }
  }

  return { valid: true, claims }
}

/** Generate a cryptographically random refresh token (64 hex chars) */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

/** Hash a refresh token for database storage */
export function hashRefreshToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex')
}

/** Generate a random JWT secret (for dev mode when none is configured) */
export function generateJwtSecret(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Where the process keeps its ephemeral secret: on `globalThis`, so every copy
 * of this module a bundler may make (route handlers and pages) shares it
 */
const EPHEMERAL_SECRET = Symbol.for('krantho.ephemeralJwtSecret')

function processSecret(): { value?: string | undefined } {
  const store = globalThis as Record<symbol, { value?: string | undefined } | undefined>
  store[EPHEMERAL_SECRET] ??= {}
  return store[EPHEMERAL_SECRET]
}

/**
 * The effective signing secret: the configured one (KRANTHO_JWT_SECRET beats a
 * `jwtSecret` set in code, as the config tree resolves it), or, when neither is
 * set, one ephemeral secret for the whole process — generated with a warning —
 * so the API and the pages it serves (a signed preview link) agree on it.
 */
export function resolveJwtSecret(auth: Pick<AuthSection, 'jwtSecret'>): string {
  if (auth.jwtSecret) return auth.jwtSecret
  const secret = processSecret()
  if (secret.value) return secret.value

  // Dev mode: sessions and preview links do not survive restarts
  secret.value = generateJwtSecret()
  console.warn(
    '[krantho] No KRANTHO_JWT_SECRET set — using ephemeral secret. Sessions will not survive restarts.',
  )
  return secret.value
}
