import type { ContentLock } from './api-types.js'
import type { AuthUser } from './auth.js'

/** The lock identity the API records for a signed-in user: `<role>:<email>` */
export function ownLockIdentity(user: AuthUser | null): string | null {
  if (!user) return null
  return `${user.roles[0] ?? 'unknown'}:${user.email}`
}

/** The person holding a lock, as people read it: the email without the role prefix */
export function lockHolderName(lockedBy: string): string {
  return lockedBy.replace(/^(admin|editor|viewer|unknown):/, '')
}

/** The unexpired locks someone other than the viewer holds */
export function locksHeldByOthers(
  locks: readonly ContentLock[],
  user: AuthUser | null,
  now: number = Date.now(),
): ContentLock[] {
  const own = ownLockIdentity(user)
  return locks.filter((lock) => lock.lockedBy !== own && new Date(lock.expiresAt).getTime() > now)
}

/**
 * Unexpired locks held by someone other than the viewer, in one locale (every
 * locale when none is given), as `collection/slug` → the holder's name.
 */
export function foreignLocks(
  locks: readonly ContentLock[],
  locale: string | undefined,
  user: AuthUser | null,
  now: number = Date.now(),
): Map<string, string> {
  const held = new Map<string, string>()
  for (const lock of locksHeldByOthers(locks, user, now)) {
    if (locale && lock.locale !== locale) continue
    held.set(`${lock.collection}/${lock.slug}`, lockHolderName(lock.lockedBy))
  }
  return held
}
