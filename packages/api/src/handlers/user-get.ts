import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { requireParam } from '../validators.js'

/** GET /api/users/:id — get user details (admin only) */
export const userGet: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.authAdapter) {
    return { status: 501, body: { error: 'User management not configured' } }
  }

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  const user = await ctx.authAdapter.getUser(id)
  if (!user) {
    return { status: 404, body: { error: 'User not found' } }
  }

  const permissions = await ctx.authAdapter.getUserPermissions(id)

  return { status: 200, body: { ...user, permissions } }
}
