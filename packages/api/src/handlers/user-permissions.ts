import type { Role } from '@krantho/persistence'
import { requireRole, VALID_ROLES } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { requireParam } from '../validators.js'

/** GET /api/users/:id/permissions — get per-collection overrides (admin only) */
export const userPermissionsGet: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.authAdapter) {
    return { status: 501, body: { error: 'User management not configured' } }
  }

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const permissions = await ctx.authAdapter.getUserPermissions(id)
  return { status: 200, body: { permissions } }
}

/** PUT /api/users/:id/permissions — set per-collection overrides (admin only) */
export const userPermissionsSet: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.authAdapter) {
    return { status: 501, body: { error: 'User management not configured' } }
  }

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const body = req.body as Record<string, unknown> | undefined
  const collection = typeof body?.collection === 'string' ? body.collection : undefined
  const role = typeof body?.role === 'string' ? body.role : undefined

  if (!collection || !role) {
    return { status: 400, body: { error: 'collection and role are required' } }
  }

  if (!VALID_ROLES.includes(role as Role)) {
    return { status: 400, body: { error: `Invalid role: ${role}` } }
  }

  await ctx.authAdapter.setUserPermission(id, collection, role as Role)
  return { status: 200, body: { userId: id, collection, role } }
}
