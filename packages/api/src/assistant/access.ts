import { requireRole } from '../permissions.js'
import type { ApiContext, ApiRequest, ApiResponse, AuthenticatedUser } from '../types.js'

/**
 * The signed-in user the assistant acts for, or the refusal: 401 without a
 * user, or for the anonymous reader of a site with sign-in (who must not learn
 * the provider or drive the model); 403 below `assistant.role`.
 */
export function requireAssistantUser(
  ctx: ApiContext,
): { ok: true; user: AuthenticatedUser } | { ok: false; response: ApiResponse } {
  const user = ctx.auth
  if (!user || (ctx.config.auth.mode !== 'none' && user.id === 'anonymous')) {
    return { ok: false, response: { status: 401, body: { error: 'Authentication required' } } }
  }
  const denied = requireRole(user, ctx.config.assistant.role)
  if (denied) return { ok: false, response: denied }
  return { ok: true, user }
}

/**
 * 415 unless the request body is declared JSON. Any body is parsed as JSON on
 * the way in, so without this a cross-site `text/plain` form post would reach
 * the handler; a JSON request from another site needs a CORS preflight the API
 * never grants.
 */
export function requireJsonBody(req: ApiRequest): ApiResponse | null {
  const contentType = req.headers?.['content-type'] ?? ''
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase()
  if (mediaType === 'application/json') return null
  return { status: 415, body: { error: 'Content-Type must be application/json' } }
}

const ROLE_ORDER = ['admin', 'editor', 'viewer'] as const

/** The user's highest role — the only thing about the user the model is told */
export function highestRole(user: AuthenticatedUser): (typeof ROLE_ORDER)[number] {
  return ROLE_ORDER.find((role) => user.roles.includes(role)) ?? 'viewer'
}
