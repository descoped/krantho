import type { CatalogType } from './api-types.js'

/**
 * Whether a type picker offers the type: not when the reader retired its
 * feature — the type stays valid Schema.org, but it is no rich-result target —
 * unless it is already chosen, so it can be seen and removed
 */
export function isOffered(type: CatalogType, chosen: boolean): boolean {
  return chosen || type.richResultStatus !== 'retired'
}

/** What a picker tags the type with: pending in Schema.org, or its feature's restriction or retirement */
export function catalogTag(type: CatalogType): 'pending' | 'restricted' | 'retired' | null {
  if (type.lifecycle?.status === 'pending') return 'pending'
  if (type.richResultStatus === 'restricted' || type.richResultStatus === 'retired') {
    return type.richResultStatus
  }
  return null
}
