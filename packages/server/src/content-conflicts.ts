import type { ContentConflict, IContentMigrationAdapter } from '@krantho/persistence'

/** A conflict as a deployment records it */
type NewConflict = Parameters<IContentMigrationAdapter['recordConflict']>[0]

/**
 * The document a conflict is about. Without a locale (a new file in the default locale, with
 * no document yet) it matches the document in any locale.
 */
export interface ConflictDocument {
  collection: string
  slug: string
  locale: string | undefined
}

function isConflictOf(conflict: ContentConflict, document: ConflictDocument): boolean {
  return (
    conflict.collection === document.collection &&
    conflict.slug === document.slug &&
    (document.locale === undefined || conflict.locale === document.locale)
  )
}

/** An imported document's open conflicts are settled: the repository's version now stands */
export async function resolveConflictsOf(
  migrationAdapter: IContentMigrationAdapter,
  open: readonly ContentConflict[],
  document: ConflictDocument,
): Promise<void> {
  for (const conflict of open) {
    if (isConflictOf(conflict, document)) {
      await migrationAdapter.resolveConflict(conflict.id, 'use_repo')
    }
  }
}

/** Record a conflict unless the same one is still open from an earlier deployment */
export async function recordNewConflict(
  migrationAdapter: IContentMigrationAdapter,
  open: readonly ContentConflict[],
  conflict: NewConflict,
): Promise<void> {
  const recorded = open.some(
    (o) =>
      isConflictOf(o, conflict) &&
      o.repoChecksum === conflict.repoChecksum &&
      o.dbChecksum === conflict.dbChecksum,
  )
  if (!recorded) await migrationAdapter.recordConflict(conflict)
}
