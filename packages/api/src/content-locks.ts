import { changedByFromAuth } from './permissions.js'
import type { ApiContext, ApiResponse } from './types.js'

/** An edit lock someone else holds on a document */
export interface HeldLock {
  lockedBy: string
  expiresAt: string
}

/** One document, addressed by collection, slug and locale (the site's default locale when absent) */
export interface LockTarget {
  collection: string
  slug: string
  locale?: string | undefined
}

/** Who the signed-in caller is to the lock table */
export function lockOwner(ctx: ApiContext): string {
  return changedByFromAuth(ctx.auth)
}

/**
 * The unexpired edit lock on a document held by someone other than the
 * signed-in user, or null when the document is free or the lock is theirs.
 */
export async function lockHolder(ctx: ApiContext, target: LockTarget): Promise<HeldLock | null> {
  const locale = target.locale ?? ctx.config.site.defaultLocale
  const lock = await ctx.lockAdapter?.getLock(target.collection, target.slug, locale)
  if (!lock) return null
  if (new Date(lock.expiresAt).getTime() <= Date.now()) return null
  if (lock.lockedBy === lockOwner(ctx)) return null
  return { lockedBy: lock.lockedBy, expiresAt: lock.expiresAt }
}

/**
 * 423 when someone else holds the document's edit lock, else null: saving,
 * publishing, unpublishing, restoring and deleting wait until the lock is
 * released or expires. The holder is named in `lockedBy`, never in `error` —
 * the assistant passes an error's text on to its model provider.
 */
export async function lockedByOther(
  ctx: ApiContext,
  target: LockTarget,
): Promise<ApiResponse | null> {
  const held = await lockHolder(ctx, target)
  if (!held) return null
  return {
    status: 423,
    body: {
      error: `${target.collection}/${target.slug} is being edited by another user`,
      lockedBy: held.lockedBy,
      expiresAt: held.expiresAt,
    },
  }
}
