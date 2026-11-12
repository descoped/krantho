import { issueTokenPair } from '../auth-tokens.js'
import { assertRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'

/** POST /api/auth/login — validate token, create session with JWT + refresh token */
export const authLogin: ApiHandler = async (req, ctx) => {
  const auth = ctx.config.auth

  if (auth.mode === 'none') {
    return { status: 200, body: { identity: 'anonymous', mode: 'none' } }
  }

  const body = req.body as Record<string, unknown> | undefined
  const token = typeof body?.['token'] === 'string' ? body['token'] : undefined

  if (!token) {
    return { status: 400, body: { error: 'Token is required' } }
  }

  if (auth.mode === 'token') {
    if (token !== auth.token.secret) {
      return { status: 401, body: { error: 'Invalid token' } }
    }

    if (!auth.jwtSecret) {
      return { status: 500, body: { error: 'JWT secret not configured' } }
    }

    const tokenRole = assertRole(auth.token.role, 'auth.token.role')
    const tokenEmail = auth.token.email

    // Find or create the token mode user
    let user = ctx.authAdapter ? await ctx.authAdapter.getUserByEmail(tokenEmail) : null

    if (!user && ctx.authAdapter) {
      user = await ctx.authAdapter.createUser({
        email: tokenEmail,
        name: 'Token Admin',
        roles: [tokenRole],
      })
    }

    const userId = user?.id ?? 'token-user'
    const roles = user?.roles ?? [tokenRole]

    const tokenUser = {
      id: userId,
      email: tokenEmail,
      name: user?.name ?? 'Token Admin',
      roles,
    }
    const tokens = await issueTokenPair({
      user: tokenUser,
      jwtSecret: auth.jwtSecret,
      auth,
      headers: req.headers,
      authAdapter: ctx.authAdapter,
    })

    return {
      status: 200,
      body: {
        identity: tokenEmail,
        mode: 'token',
        roles,
        name: user?.name ?? 'Token Admin',
      },
      cookies: tokens.cookies,
    }
  }

  return { status: 400, body: { error: `Login not supported for mode: ${auth.mode}` } }
}
