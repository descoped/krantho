import type { Role } from '@krantho/persistence'
import { issueTokenPair } from '../auth-tokens.js'
import { refreshCookieName } from '../cookies.js'
import { hashRefreshToken } from '../jwt.js'
import { safeReturnTo } from '../return-to.js'
import type { ApiContext, ApiHandler, ApiRequest, ApiResponse } from '../types.js'
import { parseCookie } from '../validators.js'

/** A refresh that issued a new token pair, or why it could not */
type Rotation =
  | {
      ok: true
      cookies: string[]
      user: { identity: string | null; roles: Role[]; name: string | null }
    }
  | { ok: false; status: 401 | 501; error: string }

/**
 * Exchange the refresh cookie for a new access and refresh token pair. The
 * refresh token is single-use: the stored one is deleted before the new pair
 * is issued, and an expired token or an inactive user's token is deleted too.
 */
async function rotateSession(req: ApiRequest, ctx: ApiContext): Promise<Rotation> {
  const auth = ctx.config.auth
  if (!ctx.authAdapter || !auth.jwtSecret) {
    return { ok: false, status: 501, error: 'Session management not configured' }
  }

  const refreshToken = parseCookie(req.headers?.['cookie'], refreshCookieName(auth.session))
  if (!refreshToken) return { ok: false, status: 401, error: 'No refresh token' }

  const tokenHash = hashRefreshToken(refreshToken, auth.jwtSecret)
  const tokenRecord = await ctx.authAdapter.getRefreshTokenByHash(tokenHash)
  if (!tokenRecord) return { ok: false, status: 401, error: 'Invalid refresh token' }

  if (new Date(tokenRecord.expiresAt) <= new Date()) {
    await ctx.authAdapter.deleteRefreshToken(tokenRecord.id)
    return { ok: false, status: 401, error: 'Refresh token expired' }
  }

  const user = await ctx.authAdapter.getUser(tokenRecord.userId)
  if (!user || !user.isActive) {
    await ctx.authAdapter.deleteRefreshToken(tokenRecord.id)
    return { ok: false, status: 401, error: 'User not found or deactivated' }
  }

  await ctx.authAdapter.deleteRefreshToken(tokenRecord.id)
  const tokens = await issueTokenPair({
    user: { id: user.id, email: user.email ?? '', name: user.name ?? '', roles: user.roles },
    jwtSecret: auth.jwtSecret,
    auth,
    headers: req.headers,
    authAdapter: ctx.authAdapter,
  })
  return {
    ok: true,
    cookies: tokens.cookies,
    user: { identity: user.email, roles: user.roles, name: user.name },
  }
}

/** POST /api/auth/refresh — rotate tokens, issue new JWT + refresh pair */
export const authRefresh: ApiHandler = async (req, ctx) => {
  const rotation = await rotateSession(req, ctx)
  if (!rotation.ok) return { status: rotation.status, body: { error: rotation.error } }
  return { status: 200, body: rotation.user, cookies: rotation.cookies }
}

/**
 * GET /api/auth/refresh?returnTo=<path> — the same rotation for a page
 * navigation, such as the Studio gate sending a browser whose access token
 * expired. A successful refresh returns the browser to `returnTo` with the new
 * cookies. A failed one starts a new sign-in: the OIDC sign-in in `oidc` mode,
 * otherwise `returnTo`, where Studio shows its own sign-in page. It leaves
 * the cookies alone — when two tabs refresh at once, the losing request holds
 * the token the winner just rotated, and clearing would undo the winner's new
 * session. A completed sign-in replaces the cookies anyway.
 */
export const authRefreshRedirect: ApiHandler = async (req, ctx) => {
  const returnTo = safeReturnTo(req.query['returnTo'])
  const rotation = await rotateSession(req, ctx)
  if (rotation.ok) return redirect(returnTo, rotation.cookies)

  const auth = ctx.config.auth
  const signIn =
    auth.mode === 'oidc'
      ? `/api/auth/login/oidc?returnTo=${encodeURIComponent(returnTo)}`
      : returnTo
  return redirect(signIn, [])
}

function redirect(location: string, cookies: string[]): ApiResponse {
  return {
    status: 302,
    body: null,
    headers: { Location: location, 'Cache-Control': 'no-store' },
    cookies,
  }
}
