import { clearSessionCookies } from '../auth-tokens.js'
import { refreshCookieName } from '../cookies.js'
import { hashRefreshToken } from '../jwt.js'
import { getDiscovery } from '../oidc.js'
import type { ApiHandler } from '../types.js'
import { parseCookie } from '../validators.js'

/** POST /api/auth/logout — clear cookies, delete refresh token, return SSO logout URL */
export const authLogout: ApiHandler = async (req, ctx) => {
  const auth = ctx.config.auth

  // Delete refresh token from database if possible
  if (ctx.authAdapter) {
    const refreshToken = parseCookie(req.headers?.cookie, refreshCookieName(auth.session))
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken, auth.jwtSecret ?? '')
      const record = await ctx.authAdapter.getRefreshTokenByHash(tokenHash)
      if (record) {
        await ctx.authAdapter.deleteRefreshToken(record.id)
      }
    }
  }

  // Build OIDC end-session URL for SSO logout
  let ssoLogoutUrl: string | null = null
  if (auth.mode === 'oidc' && auth.oidc.issuer) {
    try {
      const discovery = await getDiscovery(auth.oidc.issuer)
      if (discovery.end_session_endpoint) {
        const params = new URLSearchParams({ post_logout_redirect_uri: auth.oidc.postLogoutUri })
        ssoLogoutUrl = `${discovery.end_session_endpoint}?${params.toString()}`
      }
    } catch {
      // Discovery failed — proceed without SSO logout
    }
  }

  return {
    status: 200,
    body: { message: 'Logged out', ssoLogoutUrl },
    cookies: clearSessionCookies(auth, req.headers),
  }
}
