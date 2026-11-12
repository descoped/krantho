import { lockOwner } from '../content-locks.js'
import { changedByFromAuth, hasRole, requireRole } from '../permissions.js'
import type { ApiHandler, ApiResponse } from '../types.js'
import { parseLocaleParam, requireParam, validateCollectionParam } from '../validators.js'

function lockNotAvailable(): ApiResponse {
  return { status: 501, body: { error: 'Advisory locking requires a database adapter' } }
}

/** POST /api/content/:collection/:slug/lock — acquire advisory lock */
export const acquireLock: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value
  const locale = parseLocaleParam(req.query['locale']) ?? ctx.config.site.defaultLocale
  const lockedBy = changedByFromAuth(ctx.auth) ?? 'anonymous'

  if (!ctx.lockAdapter) return lockNotAvailable()

  const now = new Date()
  const expiresAt = new Date(now.getTime() + ctx.config.content.lock.leaseMs)

  const existing = await ctx.lockAdapter.getLock(validated.collection, slug, locale)

  if (existing) {
    if (new Date(existing.expiresAt) > now && existing.lockedBy !== lockedBy) {
      return {
        status: 423,
        body: {
          error: 'Content is locked by another user',
          lockedBy: existing.lockedBy,
          expiresAt: existing.expiresAt,
        },
      }
    }
  }

  await ctx.lockAdapter.acquireLock(
    validated.collection,
    slug,
    locale,
    lockedBy,
    expiresAt.toISOString(),
  )

  return {
    status: 200,
    body: { locked: true, lockedBy, expiresAt: expiresAt.toISOString() },
  }
}

/**
 * DELETE /api/content/:collection/:slug/lock — release a lock (editor): your
 * own, or anyone's as an admin (a stale lock someone left behind)
 */
export const releaseLock: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value
  const locale = parseLocaleParam(req.query['locale']) ?? ctx.config.site.defaultLocale

  if (!ctx.lockAdapter) return lockNotAvailable()

  const lock = await ctx.lockAdapter.getLock(validated.collection, slug, locale)
  const isAdmin = ctx.auth !== undefined && hasRole(ctx.auth, 'admin')
  if (lock && lock.lockedBy !== lockOwner(ctx) && !isAdmin) {
    return {
      status: 403,
      body: {
        error: 'Only the lock holder or an admin can release this lock',
        lockedBy: lock.lockedBy,
      },
    }
  }

  await ctx.lockAdapter.releaseLock(validated.collection, slug, locale)
  return { status: 200, body: { locked: false } }
}

/** GET /api/locks — every edit lock currently held (viewer) */
export const listLocks: ApiHandler = async (_req, ctx) => {
  const denied = requireRole(ctx.auth, 'viewer')
  if (denied) return denied
  const locks = (await ctx.lockAdapter?.listLocks()) ?? []
  return { status: 200, body: { locks } }
}

/** GET /api/content/:collection/:slug/lock — check lock status */
export const checkLock: ApiHandler = async (req, ctx) => {
  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value
  const locale = parseLocaleParam(req.query['locale']) ?? ctx.config.site.defaultLocale

  if (!ctx.lockAdapter) return { status: 200, body: { locked: false } }

  const lock = await ctx.lockAdapter.getLock(validated.collection, slug, locale)
  if (!lock) return { status: 200, body: { locked: false } }

  return {
    status: 200,
    body: {
      locked: true,
      lockedBy: lock.lockedBy,
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt,
    },
  }
}
