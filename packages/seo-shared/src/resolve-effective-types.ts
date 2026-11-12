/**
 * Resolve the effective Schema.org types for a document by cascading
 * through the scope hierarchy: document → collection → site.
 *
 * The first scope with configured entity types wins. If no scope has
 * types, returns an empty array.
 */
export interface ScopeWithEntities {
  readonly entities: readonly { readonly '@type': string }[]
}

export function resolveEffectiveTypes(
  document: ScopeWithEntities | null,
  collection: ScopeWithEntities | null,
  site: ScopeWithEntities | null,
): readonly string[] {
  const docTypes = document?.entities.map((e) => e['@type']) ?? []
  if (docTypes.length > 0) return docTypes
  const colTypes = collection?.entities.map((e) => e['@type']) ?? []
  if (colTypes.length > 0) return colTypes
  const siteTypes = site?.entities.map((e) => e['@type']) ?? []
  if (siteTypes.length > 0) return siteTypes
  return []
}
