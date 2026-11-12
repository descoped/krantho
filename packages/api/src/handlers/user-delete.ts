import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { requireParam } from '../validators.js'

/** DELETE /api/users/:id — delete user (admin only) */
export const userDelete: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.authAdapter) {
    return { status: 501, body: { error: 'User management not configured' } }
  }

  const idResult = requireParam(req.params, 'id')
  if (!idResult.isValid) return idResult.response
  const id = idResult.value

  // Prevent self-deletion
  if (ctx.auth && ctx.auth.id === id) {
    return { status: 400, body: { error: 'Cannot delete your own account' } }
  }

  const deleted = await ctx.authAdapter.deleteUser(id)
  if (!deleted) {
    return { status: 404, body: { error: 'User not found' } }
  }

  return { status: 200, body: { deleted: true, id } }
}
