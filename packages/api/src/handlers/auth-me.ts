import { accessCookieName } from '../cookies.js'
import { verifyJwt } from '../jwt.js'
import type { ApiHandler } from '../types.js'
import { parseCookie } from '../validators.js'

/** GET /api/auth/me — return current user from JWT cookie or Bearer token */
export const authMe: ApiHandler = async (req, ctx) => {
  const auth = ctx.config.auth

  if (auth.mode === 'none') {
    return {
      status: 200,
      body: { identity: 'anonymous', mode: 'none', roles: ['admin'], name: 'Anonymous' },
    }
  }

  const cookieToken = parseCookie(req.headers?.['cookie'], accessCookieName(auth.session))
  const authHeader = req.headers?.['authorization']
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  const token = cookieToken ?? bearerToken

  if (!token) {
    return { status: 401, body: { error: 'Not authenticated' } }
  }

  // Legacy token mode: raw shared secret. Neutral, domain-agnostic defaults
  // (no brand domain hardcoded in a published package); a deployment sets
  // auth.token.email / auth.token.role to override.
  if (auth.mode === 'token' && token === auth.token.secret) {
    return {
      status: 200,
      body: {
        identity: auth.token.email,
        mode: 'token',
        roles: [auth.token.role],
        name: 'Token Admin',
      },
    }
  }

  // JWT verification
  if (!auth.jwtSecret) {
    return { status: 500, body: { error: 'JWT secret not configured' } }
  }

  const result = verifyJwt(token, auth.jwtSecret)
  if (!result.valid) {
    return { status: 401, body: { error: result.error } }
  }

  return {
    status: 200,
    body: {
      id: result.claims.sub,
      identity: result.claims.email,
      email: result.claims.email,
      name: result.claims.name,
      mode: auth.mode,
      roles: result.claims.roles,
    },
  }
}
