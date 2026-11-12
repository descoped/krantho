import { ApiError, localeQuery, request } from './api-client.js'
import type { ContentLock } from './api-types.js'

/** The answer to taking a document's edit lock */
export interface LockResult {
  locked: boolean
  lockedBy?: string | undefined
  expiresAt?: string | undefined
  error?: string | undefined
  /** The HTTP status of a refusal: 423 when someone else holds it, 501 when the store has no locks */
  status?: number | undefined
}

/** Take (or renew) a document's edit lock in a locale (the site's default locale when absent) */
export async function acquireContentLock(
  collection: string,
  slug: string,
  locale?: string | undefined,
): Promise<LockResult> {
  try {
    return await request(`/content/${collection}/${slug}/lock${localeQuery(locale)}`, {
      method: 'POST',
    })
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      const lockedBy = typeof err.body.lockedBy === 'string' ? err.body.lockedBy : null
      const expiresAt = typeof err.body.expiresAt === 'string' ? err.body.expiresAt : null
      return {
        locked: false,
        error: err.message,
        status: err.status,
        ...(lockedBy ? { lockedBy } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      }
    }
    return { locked: false, error: err instanceof Error ? err.message : 'Failed to acquire lock' }
  }
}

/** Release a document's edit lock in a locale (the site's default locale when absent) */
export async function releaseContentLock(
  collection: string,
  slug: string,
  locale?: string | undefined,
): Promise<void> {
  try {
    await request(`/content/${collection}/${slug}/lock${localeQuery(locale)}`, {
      method: 'DELETE',
    })
  } catch {
    // Best-effort release
  }
}

/** Every edit lock currently held */
export async function fetchLocks(): Promise<ContentLock[]> {
  const result = await request<{ locks: ContentLock[] }>('/locks')
  return result.locks
}
