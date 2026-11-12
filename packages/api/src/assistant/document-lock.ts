import type { HeldLock } from '../content-locks.js'

/** `HH:MM UTC` of an ISO timestamp */
function clockTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(11, 16)} UTC`
}

/**
 * What the assistant says about a lock — to the model and in Studio alike. It
 * never names the holder (D16): Studio sends its conversation back to the
 * model, so text shown to the user reaches the provider too. The editor shows
 * who holds the lock when the user opens the document.
 */
export function lockMessage(ref: { collection: string; slug: string }, lock: HeldLock): string {
  return `${ref.collection}/${ref.slug} is being edited by another user until ${clockTime(lock.expiresAt)}; try again later.`
}
