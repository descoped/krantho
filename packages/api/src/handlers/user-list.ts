import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'

/** GET /api/users — list all users (admin only) */
export const userList: ApiHandler = async (_req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.authAdapter) {
    return { status: 501, body: { error: 'User management not configured' } }
  }

  const users = await ctx.authAdapter.listUsers()
  return {
    status: 200,
    body: {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        roles: u.roles,
        isActive: u.isActive,
        oidcIssuer: u.oidcIssuer,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      total: users.length,
    },
  }
}
