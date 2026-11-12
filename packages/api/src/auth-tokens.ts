import type { AuthSection } from '@krantho/config'
import type { IAuthAdapter, Role } from '@krantho/persistence'
import { accessCookieName, buildCookie, isSecureRequest, refreshCookieName } from './cookies.js'
import { generateRefreshToken, hashRefreshToken, signJwt } from './jwt.js'

interface TokenUser {
  id: string
  email: string
  name: string
  roles: Role[]
}

interface IssueTokenPairOptions {
  user: TokenUser
  /** The effective signing secret (`config.auth.jwtSecret`) */
  jwtSecret: string
  /** The resolved auth section — session TTLs, cookie names and flags */
  auth: AuthSection
  headers: Record<string, string> | undefined
  authAdapter: IAuthAdapter | undefined
}

interface IssuedTokens {
  /** Set-Cookie values — access + optional refresh, one entry per cookie (RFC 6265). */
  cookies: string[]
}

/**
 * Issue JWT access token + refresh token pair, returning one Set-Cookie value
 * per cookie (access + optional refresh). Shared by auth-login, auth-callback,
 * and auth-refresh handlers.
 */
export async function issueTokenPair(options: IssueTokenPairOptions): Promise<IssuedTokens> {
  const { user, jwtSecret, auth, headers, authAdapter } = options
  const { accessTtlSec, refreshTtlSec, sameSite } = auth.session

  const accessToken = signJwt(
    { sub: user.id, email: user.email, name: user.name, roles: user.roles },
    jwtSecret,
    accessTtlSec,
  )

  const isSecure = isSecureRequest(headers, auth)
  const accessCookie = buildCookie(
    accessCookieName(auth.session),
    accessToken,
    accessTtlSec,
    isSecure,
    sameSite,
  )

  let refreshCookie = ''
  if (authAdapter) {
    const refreshToken = generateRefreshToken()
    const refreshHash = hashRefreshToken(refreshToken, jwtSecret)
    const expiresAt = new Date(Date.now() + refreshTtlSec * 1000).toISOString()
    await authAdapter.createRefreshToken(user.id, refreshHash, expiresAt)
    refreshCookie = buildCookie(
      refreshCookieName(auth.session),
      refreshToken,
      refreshTtlSec,
      isSecure,
      sameSite,
    )
  }

  return {
    cookies: refreshCookie ? [accessCookie, refreshCookie] : [accessCookie],
  }
}

/** Set-Cookie values that clear both session cookies */
export function clearSessionCookies(
  auth: AuthSection,
  headers: Record<string, string> | undefined,
): string[] {
  const isSecure = isSecureRequest(headers, auth)
  const { sameSite } = auth.session
  return [
    buildCookie(accessCookieName(auth.session), '', 0, isSecure, sameSite),
    buildCookie(refreshCookieName(auth.session), '', 0, isSecure, sameSite),
  ]
}
