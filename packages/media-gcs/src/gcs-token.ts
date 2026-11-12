import { createSign } from 'node:crypto'

/** Where Cloud Run, GKE and GCE hand out the attached service account's token */
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write'

/** Tokens are refreshed this long before they expire */
const REFRESH_MARGIN_MS = 5 * 60 * 1000
const JWT_LIFETIME_SECONDS = 3600

interface ServiceAccountKey {
  clientEmail: string
  privateKey: string
}

interface IssuedToken {
  accessToken: string
  expiresAt: number
}

/** Hands out a bearer token for the Cloud Storage JSON API */
export type AccessTokenSource = () => Promise<string>

function parseServiceAccountKey(credentials: string): ServiceAccountKey {
  let parsed: unknown
  try {
    parsed = JSON.parse(credentials)
  } catch {
    throw new Error('media.gcs.credentials: not valid JSON')
  }
  const key = (parsed ?? {}) as Record<string, unknown>
  if (typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
    throw new Error(
      'media.gcs.credentials: a service-account key needs client_email and private_key',
    )
  }
  return { clientEmail: key.client_email, privateKey: key.private_key }
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

/** An RS256-signed assertion for the service-account flow, valid for one hour */
function signServiceAccountJwt(key: ServiceAccountKey, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: key.clientEmail,
      scope: STORAGE_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + JWT_LIFETIME_SECONDS,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  return `${header}.${claims}.${base64url(signer.sign(key.privateKey))}`
}

async function readToken(response: Response, source: string): Promise<IssuedToken> {
  if (!response.ok) throw new Error(`${source} token request failed: ${response.status}`)
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
  if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
    throw new Error(`${source} token response has no access_token`)
  }
  return { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
}

async function metadataServerToken(): Promise<IssuedToken> {
  const response = await fetch(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } })
  return readToken(response, 'Metadata server')
}

async function serviceAccountToken(key: ServiceAccountKey): Promise<IssuedToken> {
  const assertion = signServiceAccountJwt(key, Math.floor(Date.now() / 1000))
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })
  return readToken(response, 'Service account')
}

/**
 * A service-account key when `credentials` is set, otherwise the metadata server.
 * Each token is reused until five minutes before it expires.
 */
export function createAccessTokenSource(credentials: string | undefined): AccessTokenSource {
  const key = credentials === undefined ? undefined : parseServiceAccountKey(credentials)
  let cached: IssuedToken | undefined

  return async () => {
    if (cached !== undefined && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
      return cached.accessToken
    }
    cached = key === undefined ? await metadataServerToken() : await serviceAccountToken(key)
    return cached.accessToken
  }
}
