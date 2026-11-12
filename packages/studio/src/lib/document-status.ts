/**
 * The status model every list, the site tree and the editor share. It comes from a
 * document's current version and its live version — never collapsed into one
 * "status" field.
 */

/** Live: the live version is the current one. Ahead: a newer draft is saved. Draft: nothing is live. */
export type DocumentStatus = 'live' | 'ahead' | 'draft'

/** What the status model reads of a document */
export interface VersionedMeta {
  version: number
  liveVersion: number | null
}

export function documentStatus(meta: VersionedMeta): DocumentStatus {
  if (meta.liveVersion === null) return 'draft'
  return meta.liveVersion >= meta.version ? 'live' : 'ahead'
}

/** The words a status reads as on a dot or a chip */
export const STATUS_LABELS: Readonly<Record<DocumentStatus, string>> = {
  live: 'Live',
  ahead: 'Unpublished changes',
  draft: 'Not published',
}
