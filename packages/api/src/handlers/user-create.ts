import type { Role } from '@krantho/persistence'
import { requireRole, VALID_ROLES } from '../permissions.js'
import type { ApiHandler } from '../types.js'

/** POST /api/users — create a user (admin only, pre-approval mode) */
export const userCreate: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.authAdapter) {
    return { status: 501, body: { error: 'User management not configured' } }
  }

  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') {
    return { status: 400, body: { error: 'Request body is required' } }
  }

  const email = typeof body.email === 'string' ? body.email : undefined
  const name = typeof body.name === 'string' ? body.name : undefined
  const role = typeof body.role === 'string' ? body.role : 'viewer'

  if (!email) {
    return { status: 400, body: { error: 'Email is required' } }
  }

  if (!VALID_ROLES.includes(role as Role)) {
    return {
      status: 400,
      body: { error: `Invalid role: ${role}. Must be: ${VALID_ROLES.join(', ')}` },
    }
  }

  // Check for duplicate email
  const existing = await ctx.authAdapter.getUserByEmail(email)
  if (existing) {
    return { status: 409, body: { error: `User with email ${email} already exists` } }
  }

  const user = await ctx.authAdapter.createUser({
    email,
    name: name ?? null,
    roles: [role as Role],
  })

  return { status: 201, body: user }
}
