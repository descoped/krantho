import type { AuthSection } from '@krantho/config'

type SessionConfig = AuthSection['session']

/** Name of the cookie carrying the access token */
export function accessCookieName(session: SessionConfig): string {
  return `${session.cookiePrefix}_access`
}

/** Name of the cookie carrying the refresh token */
export function refreshCookieName(session: SessionConfig): string {
  return `${session.cookiePrefix}_refresh`
}

const SAME_SITE_ATTRIBUTE: Record<SessionConfig['sameSite'], string> = {
  lax: 'Lax',
  strict: 'Strict',
  none: 'None',
}

/** Build a HttpOnly session cookie string */
export function buildCookie(
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
  sameSite: SessionConfig['sameSite'],
): string {
  return [
    `${name}=${value}`,
    'HttpOnly',
    `SameSite=${SAME_SITE_ATTRIBUTE[sameSite]}`,
    'Path=/',
    secure ? 'Secure' : '',
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join('; ')
}

/**
 * Decide whether session cookies carry `Secure`.
 *
 * `always` and `never` force the flag. `auto` infers it from the request: a
 * verbatim `x-forwarded-proto: https` always counts, and `auth.trustProxy`
 * widens that to the other headers a terminating proxy may send instead — a
 * proxy-chain list, `x-forwarded-ssl`, and RFC 7239 `Forwarded`.
 */
export function isSecureRequest(
  headers: Record<string, string> | undefined,
  auth: AuthSection,
): boolean {
  if (auth.session.secure === 'always') return true
  if (auth.session.secure === 'never') return false

  const forwardedProto = headers?.['x-forwarded-proto']
  if (forwardedProto === 'https') return true
  if (!auth.trustProxy) return false

  if (forwardedProto?.split(',')[0]?.trim().toLowerCase() === 'https') return true
  if (headers?.['x-forwarded-ssl']?.toLowerCase() === 'on') return true

  const forwarded = headers?.forwarded
  return forwarded !== undefined && /(?:^|[;,\s])proto="?https"?(?:$|[;,\s])/i.test(forwarded)
}
