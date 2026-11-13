import type { AuthSection } from '@krantho/config'
import type { Role } from '@krantho/persistence'
import { accessCookieName } from '../cookies.js'
import { verifyJwt } from '../jwt.js'
import type { ApiRequest, ApiResponse, AuthenticatedUser } from '../types.js'
import { parseCookie } from '../validators.js'

/** Result of auth check */
export type AuthResult =
  | { isAuthenticated: true; user: AuthenticatedUser }
  | { isAuthenticated: false; response: ApiResponse }

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

/** The token of an `Authorization: Bearer <token>` header, when the request carries one */
export function bearerToken(req: ApiRequest): string | undefined {
  const authHeader = req.headers?.authorization ?? req.headers?.Authorization
  if (!authHeader) return undefined
  const parts = authHeader.split(' ')
  return parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : undefined
}

/**
 * Check authentication for a request.
 *
 * In none mode: always passes with anonymous identity.
 * In token/oidc mode: extracts JWT from cookie or Bearer header,
 * verifies signature, checks expiry, and returns user with roles.
 */
export function checkAuth(req: ApiRequest, config: AuthSection): AuthResult {
  // No-auth mode: always pass through
  if (config.mode === 'none') {
    return {
      isAuthenticated: true,
      user: {
        id: 'anonymous',
        email: 'anonymous',
        name: 'Anonymous',
        roles: ['admin'] as Role[],
        mode: 'none',
      },
    }
  }

  // Extract token: cookie first (browser sessions), then Bearer header (API clients)
  let token = parseCookie(req.headers?.cookie, accessCookieName(config.session))

  token ||= bearerToken(req)

  const isWrite = WRITE_METHODS.has(req.method.toUpperCase())

  // No token present: reads may be public, writes require auth
  if (!token) {
    if (!isWrite && !config.requireAuthForReads) {
      return {
        isAuthenticated: true,
        user: {
          id: 'anonymous',
          email: 'anonymous',
          name: 'Anonymous',
          roles: ['viewer'] as Role[],
          mode: config.mode,
        },
      }
    }
    return {
      isAuthenticated: false,
      response: { status: 401, body: { error: 'Authentication required' } },
    }
  }

  // Verify JWT
  if (!config.jwtSecret) {
    return {
      isAuthenticated: false,
      response: { status: 500, body: { error: 'JWT secret not configured' } },
    }
  }

  const result = verifyJwt(token, config.jwtSecret)
  if (!result.valid) {
    return {
      isAuthenticated: false,
      response: { status: 401, body: { error: result.error } },
    }
  }

  return {
    isAuthenticated: true,
    user: {
      id: result.claims.sub,
      email: result.claims.email,
      name: result.claims.name,
      roles: result.claims.roles,
      mode: config.mode,
    },
  }
}
