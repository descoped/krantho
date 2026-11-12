import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { AuthSection } from '@krantho/config'
import { buildCookie, isSecureRequest } from './cookies.js'

/**
 * A pending OIDC sign-in, carried by the browser between the redirect to the
 * provider and the callback.
 *
 * It lives in a short-lived cookie rather than server memory, so the callback
 * succeeds on whichever instance it lands — serverless functions and
 * horizontally scaled servers share nothing between requests. The cookie is
 * encrypted and authenticated (AES-256-GCM, keyed from the resolved signing
 * secret): the browser can neither read the PKCE verifier nor forge a state.
 */

/** How long a sign-in may take between the redirect and the callback */
export const OIDC_STATE_TTL_SEC = 600

/** What the login redirect hands the callback */
export interface OidcPendingLogin {
  /** CSRF token echoed back by the provider */
  state: string
  /** PKCE verifier for the token exchange */
  codeVerifier: string
  /** Must match the `nonce` claim of the ID token */
  nonce: string
  /** Same-origin path the browser lands on after a successful sign-in */
  returnTo: string
}

interface SealedPayload extends OidcPendingLogin {
  expiresAt: number
}

const IV_BYTES = 12
const TAG_BYTES = 16

function stateKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', 'krantho oidc state', 32))
}

/** Encrypt a pending sign-in into a cookie-safe value */
export function sealOidcState(
  login: OidcPendingLogin,
  secret: string,
  now: number = Date.now(),
): string {
  const payload: SealedPayload = { ...login, expiresAt: now + OIDC_STATE_TTL_SEC * 1000 }
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', stateKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

/**
 * Decrypt a sealed pending sign-in. Returns null when the value is missing,
 * tampered with, sealed under another secret, or expired.
 */
export function openOidcState(
  sealed: string | undefined,
  secret: string,
  now: number = Date.now(),
): OidcPendingLogin | null {
  if (!sealed) return null

  const raw = Buffer.from(sealed, 'base64url')
  if (raw.length <= IV_BYTES + TAG_BYTES) return null

  let payload: SealedPayload
  try {
    const decipher = createDecipheriv('aes-256-gcm', stateKey(secret), raw.subarray(0, IV_BYTES))
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    const plaintext = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ])
    payload = JSON.parse(plaintext.toString('utf8')) as SealedPayload
  } catch {
    return null
  }

  if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= now) return null
  const { state, codeVerifier, nonce, returnTo } = payload
  return { state, codeVerifier, nonce, returnTo }
}

/** Name of the cookie carrying the pending sign-in */
export function oidcStateCookieName(session: AuthSection['session']): string {
  return `${session.cookiePrefix}_oidc`
}

/**
 * Set-Cookie value for a pending sign-in. Always `SameSite=Lax`, whatever the
 * session cookies use: the callback is a top-level cross-site navigation from
 * the provider, which Lax admits and Strict would drop.
 */
export function oidcStateCookie(
  sealed: string,
  auth: AuthSection,
  headers: Record<string, string> | undefined,
): string {
  return buildCookie(
    oidcStateCookieName(auth.session),
    sealed,
    OIDC_STATE_TTL_SEC,
    isSecureRequest(headers, auth),
    'lax',
  )
}

/** Set-Cookie value that clears the pending sign-in */
export function clearOidcStateCookie(
  auth: AuthSection,
  headers: Record<string, string> | undefined,
): string {
  return buildCookie(
    oidcStateCookieName(auth.session),
    '',
    0,
    isSecureRequest(headers, auth),
    'lax',
  )
}
