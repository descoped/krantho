import type { DocumentMeta, VersionInfo } from '../../lib/api-types.js'
import type { Draft } from '../editor-model.js'

/**
 * The version history of one locale version, as Data mode lists it: newest
 * first, each version with the chips that say which is live and which is current.
 */

export interface VersionChips {
  live: boolean
  current: boolean
}

/** Which of the saved versions a version is: the live one, the current one, both or neither */
export function versionChips(
  version: number,
  saved: { version: number; liveVersion: number | null },
): VersionChips {
  return { live: version === saved.liveVersion, current: version === saved.version }
}

/** A version as the history lists it: its number, author and time — not its fields or body */
export type VersionEntry = Pick<DocumentMeta, 'version' | 'changedBy' | 'createdAt'>

/** The form's work as the newer side of a comparison, numbered after the newest saved version */
export function formAsVersion(versions: readonly VersionEntry[], draft: Draft): VersionInfo {
  return {
    version: (versions[0]?.version ?? 0) + 1,
    metadata: draft.metadata,
    contract: null,
    defaults: [],
    repositoryBasis: null,
    fields: draft.fields,
    body: draft.body,
    changedBy: null,
    createdAt: new Date().toISOString(),
  }
}

/** What a restore does and replaces: said in its confirmation */
export function restoreMessage(version: number, unsaved: boolean): string {
  const lead = `v${version} is saved again as the newest version; the versions in between stay, and the live page is unchanged until you publish.`
  return unsaved ? `${lead} Your unsaved changes in the form will be lost.` : lead
}

/** A restore the API refused: the version was not restored */
export function restoreFailed(version: number, reason: string): string {
  return `v${version} could not be restored: ${reason}`
}

/** A restore that worked, when reading the page again did not */
export function refreshFailed(version: number, restoredAs: number): string {
  return `v${version} was restored as v${restoredAs}, but the page could not be refreshed. Reload it to see the restored version.`
}
