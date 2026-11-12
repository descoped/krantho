/**
 * Live-version rules shared by the adapters.
 *
 * A document has a current version (its newest row, what Studio edits) and
 * at most one live version (what visitors see). Every appended row records
 * `live_version`: the document's live version as of that row, or null when
 * nothing is live. Only publishing changes what visitors see — a save appends
 * a new current version and keeps the live one — and a document's publication
 * state is read from its live version alone (see {@link statusOf}).
 */

import type { ContentStatus } from './index.js'

/** A write that changes what visitors see; a write without one is a save */
export type Publication = 'publish' | 'unpublish' | 'archive'

/** How an appended row's live version is set */
export type LiveDirective = 'self' | 'clear' | 'keep'

/** What a write does to the live version: publishing makes the new row live, unpublishing and archiving take the document offline, a save keeps it */
export function liveOnWrite(publication: Publication | undefined): LiveDirective {
  if (publication === 'publish') return 'self'
  if (publication === 'unpublish' || publication === 'archive') return 'clear'
  return 'keep'
}

/** The publication a file import makes: the file's status says whether the document is live */
export function publicationOfFile(status: string): Publication {
  if (status === 'published') return 'publish'
  return status === 'archived' ? 'archive' : 'unpublish'
}

/** The live version an appended row records */
export function resolveLiveVersion(
  directive: LiveDirective,
  version: number,
  previous: number | null,
): number | null {
  if (directive === 'self') return version
  if (directive === 'clear') return null
  return previous
}

/**
 * The status an appended row stores, consistent with how it is read: archived
 * when archived (a save keeps an archived document archived), published while
 * a version is live, draft otherwise.
 */
export function storedStatus(
  publication: Publication | undefined,
  liveVersion: number | null,
  previousStatus: string | undefined,
): ContentStatus {
  if (publication === 'archive') return 'archived'
  if (liveVersion !== null) return 'published'
  if (publication === undefined && previousStatus === 'archived') return 'archived'
  return 'draft'
}

/**
 * A row's publication state: a tombstone is deleted and an archived document
 * archived; otherwise published while a version is live, draft when none is.
 * Rows written before saves kept the live version read correctly too.
 */
export function statusOf(stored: string, liveVersion: number | null): ContentStatus {
  if (stored === 'deleted') return 'deleted'
  if (liveVersion !== null) return 'published'
  return stored === 'archived' ? 'archived' : 'draft'
}

/** Whether visitors see a document's current version — after a save, true only where saves are live (no history) */
export function currentIsLive(meta: { version: number; liveVersion: number | null }): boolean {
  return meta.liveVersion !== null && meta.liveVersion === meta.version
}

/**
 * The SQL condition that selects current rows by publication state, the same
 * on SQLite and Postgres (columns `status` and `live_version`).
 */
export function statusCondition(status: 'draft' | 'published' | 'archived'): string {
  if (status === 'published') return 'live_version IS NOT NULL'
  if (status === 'archived') return "live_version IS NULL AND status = 'archived'"
  return "live_version IS NULL AND status NOT IN ('archived', 'deleted')"
}
