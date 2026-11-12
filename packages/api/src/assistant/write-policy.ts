import { isOverwrite } from './document-change.js'
import type { DocumentChange, DocumentRef } from './protocol.js'

/** Whether a write happens now or waits for the user's confirmation */
export type WriteDecision = 'write' | 'confirm'

/** `collection/slug@locale` */
export function documentKey(ref: DocumentRef): string {
  return `${ref.collection}/${ref.slug}@${ref.locale}`
}

/**
 * The write policy of one chat request: one document may be written at once —
 * a new one, or empty values filled in an existing one — and a document created
 * in this request may be written again. Everything else is shown first: text
 * that replaces or removes a value, and any further document.
 */
export class WritePolicy {
  private readonly written = new Set<string>()
  private readonly created = new Set<string>()

  /** Decide for one document's change in this request */
  decide(change: DocumentChange): WriteDecision {
    const key = documentKey(change.ref)
    if (this.created.has(key)) return 'write'
    if (this.written.size > 0 && !this.written.has(key)) return 'confirm'
    return isOverwrite(change) ? 'confirm' : 'write'
  }

  /** Record an immediate write */
  recordWrite(change: DocumentChange): void {
    const key = documentKey(change.ref)
    this.written.add(key)
    if (change.baseVersion === 0) this.created.add(key)
  }
}
