import type { Role } from '@krantho/persistence'
import { requireRole, VALID_ROLES } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { requireParam } from '../validators.js'

/** PUT /api/users/:id — update user (admin only) */
export const userUpdate: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.authAdapter) {
    return { status: 501, body: { error: 'User management not configured' } }
  }

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') {
    return { status: 400, body: { error: 'Request body is required' } }
  }

  if (typeof body['isActive'] === 'boolean' && !body['isActive'] && ctx.auth?.id === id) {
    return { status: 400, body: { error: 'Cannot deactivate your own account' } }
  }

  const updates: Record<string, unknown> = {}

  if (typeof body['name'] === 'string') {
    updates['name'] = body['name']
  }

  if (typeof body['role'] === 'string') {
    if (!VALID_ROLES.includes(body['role'] as Role)) {
      return { status: 400, body: { error: `Invalid role: ${body['role']}` } }
    }
    updates['roles'] = [body['role'] as Role]
  }

  if (Array.isArray(body['roles'])) {
    const roles = body['roles'] as string[]
    for (const r of roles) {
      if (!VALID_ROLES.includes(r as Role)) {
        return { status: 400, body: { error: `Invalid role: ${r}` } }
      }
    }
    updates['roles'] = roles
  }

  if (typeof body['isActive'] === 'boolean') {
    updates['isActive'] = body['isActive']
    // Deactivating a user: clear their refresh tokens
    if (!body['isActive']) {
      await ctx.authAdapter.deleteUserRefreshTokens(id)
    }
  }

  const user = await ctx.authAdapter.updateUser(id, updates)
  if (!user) {
    return { status: 404, body: { error: 'User not found' } }
  }

  return { status: 200, body: user }
}
