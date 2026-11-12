import { type Draft, sameDraft } from './editor-model.js'

/**
 * Unsaved work kept in this browser (`localStorage`), offered back the next
 * time the document — or a new document of the collection — opens.
 */

/** Unsaved work as kept */
export interface StoredDraft extends Draft {
  /** When it was kept, ISO 8601 */
  savedAt: string
  /** The saved version the work was made on; absent for a new document */
  baseVersion?: number | undefined
  /** A new document's slug, as typed */
  slug?: string | undefined
}

/** What is kept beside the draft */
export interface KeptContext {
  baseVersion?: number | undefined
  slug?: string | undefined
}

/** Where a document version's unsaved work is kept: `krantho-autosave-<collection>-<slug>-<locale>` */
export function autosaveKey(collection: string, slug: string, locale: string): string {
  return `krantho-autosave-${collection}-${slug}-${locale}`
}

/**
 * Where a new document's unsaved work is kept, one per collection and locale:
 * `krantho-autosave-new-<collection>`, with `-<locale>` when the address names one
 */
export function newDocumentKey(collection: string, locale: string | undefined): string {
  const key = `krantho-autosave-new-${collection}`
  return locale ? `${key}-${locale}` : key
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (value === null || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.savedAt === 'string' &&
    entry.metadata !== null &&
    typeof entry.metadata === 'object' &&
    !Array.isArray(entry.metadata) &&
    typeof entry.body === 'string' &&
    entry.fields !== null &&
    typeof entry.fields === 'object' &&
    !Array.isArray(entry.fields)
  )
}

/** The kept work under `key`; null when there is none, it cannot be read, or storage is blocked */
export function readAutosave(key: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isStoredDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Keep unsaved work; false when the browser keeps nothing (blocked or full storage) */
export function writeAutosave(
  key: string,
  draft: Draft,
  context: KeptContext = {},
  now: Date = new Date(),
): boolean {
  try {
    const entry: StoredDraft = { ...draft, ...context, savedAt: now.toISOString() }
    localStorage.setItem(key, JSON.stringify(entry))
    return true
  } catch {
    return false
  }
}

export function clearAutosave(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Blocked storage holds nothing to clear
  }
}

/** Whether this browser can keep work at all */
export function canKeepWork(): boolean {
  const probe = 'krantho-autosave-probe'
  try {
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * Kept work worth offering: it differs from what opened, or holds a typed
 * slug. Work on a saved document names the version it was made on; work
 * that does not cannot be saved against the right version, so it is not offered.
 */
export function worthOffering(
  kept: StoredDraft | null,
  opened: Draft,
  saved: boolean,
): kept is StoredDraft {
  if (!kept) return false
  if (saved && typeof kept.baseVersion !== 'number') return false
  return !sameDraft(kept, opened) || Boolean(kept.slug)
}

/** What the offer says the kept work was made on, against the version that is open now */
export function keptBasis(kept: StoredDraft, currentVersion: number | null): string | null {
  if (kept.baseVersion === undefined || currentVersion === null) return null
  if (kept.baseVersion === currentVersion) return `made on v${kept.baseVersion}`
  return `made on v${kept.baseVersion} — the document is now v${currentVersion}`
}

/** Whether work typed now is kept, and if not, why */
export type Keeping = 'kept' | 'offer-pending' | 'unavailable'

/** The leave confirmation's account of the unsaved work — true in every case */
export function leaveMessage(name: string, keeping: Keeping): string {
  const lead = `Your changes to ${name} are not saved.`
  if (keeping === 'kept') {
    return `${lead} They stay in this browser and are offered back when you open it again.`
  }
  if (keeping === 'offer-pending') {
    return `${lead} They are not kept: changes from an earlier visit wait to be restored or discarded, and leaving loses what you typed since.`
  }
  return `${lead} This browser cannot keep them, so leaving loses them.`
}
