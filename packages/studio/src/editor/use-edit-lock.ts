import { useEffect, useState } from 'react'
import type { LockResult } from '../lib/api.js'
import { acquireContentLock, releaseContentLock } from '../lib/api.js'
import { lockHolderName } from '../lib/locks.js'

/** The edit lock as the editor sees it */
export type EditLock =
  /** Not asked for (a new document, a role that cannot edit) or not answered yet */
  | { state: 'none' }
  /** The viewer holds it: the editor is theirs */
  | { state: 'held'; expiresAt: string | null }
  /** Someone else holds it: the editor is read-only */
  | { state: 'foreign'; holder: string; expiresAt: string | null }
  /** The store keeps no edit locks (501): editing is not guarded */
  | { state: 'unavailable' }

/** Renew no sooner than this, however short the lease */
const MIN_RENEW_MS = 5 * 1000
/** Renew this often when the server names no expiry */
const DEFAULT_RENEW_MS = 60 * 1000
/** Ask again this often while someone else holds it, so the editor opens up once they leave */
const RETRY_MS = 30 * 1000
/** After a failed ask (the network, the server), wait this long, doubling up to the cap */
const FAILED_FIRST_MS = 5 * 1000
const FAILED_CAP_MS = 60 * 1000

/** The lock the answer says, or null when the ask failed and says nothing about the lock */
function lockState(result: LockResult): EditLock | null {
  if (result.locked) return { state: 'held', expiresAt: result.expiresAt ?? null }
  if (result.status === 423 && result.lockedBy) {
    return {
      state: 'foreign',
      holder: lockHolderName(result.lockedBy),
      expiresAt: result.expiresAt ?? null,
    }
  }
  if (result.status === 501) return { state: 'unavailable' }
  return null
}

/** How long to wait after the `failures`-th failed ask in a row: 5s, 10s, 20s, … up to a minute */
export function retryAfter(failures: number): number {
  return Math.min(FAILED_CAP_MS, FAILED_FIRST_MS * 2 ** Math.max(0, failures - 1))
}

/**
 * When to ask again: a held lock at half its remaining lease (the server's
 * `expiresAt`), so a renewal lands well before it lapses; a foreign one every
 * half minute
 */
export function nextAsk(lock: EditLock, now: number = Date.now()): number | null {
  if (lock.state === 'foreign') return RETRY_MS
  if (lock.state !== 'held') return null
  if (!lock.expiresAt) return DEFAULT_RENEW_MS
  const remaining = new Date(lock.expiresAt).getTime() - now
  return Math.max(MIN_RENEW_MS, Math.floor(remaining / 2))
}

export interface EditLockTarget {
  collection: string
  slug: string
  locale: string
}

/**
 * Keeps asking for one document's lock — renewing a held one, retrying a
 * foreign one or a failed ask — and reports each answer. The returned stop
 * releases the lock once any request still in flight has answered, so neither
 * a first take nor a renewal re-takes a lock the editor has let go.
 */
function keepLock(target: EditLockTarget, report: (lock: EditLock) => void): () => void {
  const { collection, slug, locale } = target
  let active = true
  let held = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null
  // A failed ask says nothing about the lock: what was known stands, and it asks again
  const answered = (next: EditLock | null): number | null => {
    failures = next ? 0 : failures + 1
    if (!next) return retryAfter(failures)
    held = next.state === 'held'
    if (active) report(next)
    return nextAsk(next)
  }
  const ask = (): void => {
    inFlight = acquireContentLock(collection, slug, locale).then((result) => {
      inFlight = null
      const wait = answered(lockState(result))
      if (active && wait !== null) timer = setTimeout(ask, wait)
    })
  }
  ask()
  return () => {
    active = false
    if (timer) clearTimeout(timer)
    const release = (): void => {
      if (held) void releaseContentLock(collection, slug, locale)
    }
    if (inFlight) void inFlight.then(release)
    else release()
  }
}

/** Takes the document's edit lock while the editor is open, renews it, and releases it on leaving */
export function useEditLock(target: EditLockTarget | null): EditLock {
  const [lock, setLock] = useState<EditLock>({ state: 'none' })
  const collection = target?.collection
  const slug = target?.slug
  const locale = target?.locale
  useEffect(() => {
    if (!collection || !slug || !locale) return
    const stop = keepLock({ collection, slug, locale }, setLock)
    return () => {
      stop()
      setLock({ state: 'none' })
    }
  }, [collection, slug, locale])
  return lock
}
