import type { Role } from '@krantho/persistence'
import type { ApiResponse, AuthenticatedUser } from './types.js'
import { isOneOf } from './validators.js'

/** All valid roles in the permission system */
export const VALID_ROLES: readonly Role[] = ['admin', 'editor', 'viewer'] as const

/**
 * Per-collection permission overrides are stored in the auth adapters and
 * exposed via the user-permissions API, but resolution in requireRole is
 * deferred to the Zitadel deep integration (#99). The infrastructure is
 * wired up — the middleware just doesn't consult per-collection overrides yet.
 */

/** Type guard: check if a string is a valid Role */
export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && isOneOf(VALID_ROLES, value)
}

/**
 * Narrow a configured role string to a `Role`, naming the configuration path
 * when it is not one. Called once at startup so a bad value fails the boot
 * instead of minting tokens with a role every permission check rejects.
 */
export function assertRole(value: string, configPath: string): Role {
  if (!isValidRole(value)) {
    throw new Error(
      `[krantho] ${configPath}: "${value}" is not a valid role (${VALID_ROLES.join(', ')})`,
    )
  }
  return value
}

/** Role hierarchy: admin > editor > viewer */
const ROLE_LEVEL: Record<Role, number> = {
  admin: 3,
  editor: 2,
  viewer: 1,
}

/** Check if a user's highest role meets or exceeds the required role */
export function hasRole(user: AuthenticatedUser, required: Role): boolean {
  return user.roles.some((r) => (ROLE_LEVEL[r] ?? 0) >= ROLE_LEVEL[required])
}

/**
 * Check if the authenticated user has sufficient permissions.
 * Returns null if authorized, or a 403 response if not.
 *
 * Usage in handlers:
 * ```ts
 * const denied = requireRole(ctx.auth, 'editor')
 * if (denied) return denied
 * ```
 */
export function requireRole(
  user: AuthenticatedUser | undefined,
  required: Role,
): ApiResponse | null {
  if (!user) {
    return { status: 401, body: { error: 'Authentication required' } }
  }

  if (!hasRole(user, required)) {
    return {
      status: 403,
      body: {
        error: `Insufficient permissions. Required: ${required}, have: ${user.roles.join(', ')}`,
      },
    }
  }

  return null
}

/**
 * Build a changedBy string from the authenticated user.
 * Format: "role:email" (e.g., "admin:user@example.com")
 */
export function changedByFromAuth(user: AuthenticatedUser | undefined): string {
  if (!user) return 'api'
  const role = user.roles[0] ?? 'unknown'
  return `${role}:${user.email}`
}
