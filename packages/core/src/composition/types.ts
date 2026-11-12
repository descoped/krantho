/**
 * Resolved data shapes for page content references.
 */

/** Result of resolving a slug() reference */
export interface SlugResult {
  fields: Record<string, unknown>
  metadata: Record<string, Record<string, unknown>>
  html: string
  sections: Record<string, string>
}

/** A single resolved section from a sections() reference */
export interface SectionItem {
  name: string
  title: string
  html: string
}

/** Result of resolving a sections() reference */
export type SectionsResult = readonly SectionItem[]

/** A single item from a collection() reference */
export interface CollectionItem {
  slug: string
  fields: Record<string, unknown>
  metadata: Record<string, Record<string, unknown>>
  html: string
  excerpt?: string | undefined
}

/** Result of resolving a collection() reference */
export type CollectionResult = readonly CollectionItem[]

/**
 * Resolved page content — a record mapping content keys to their resolved values.
 */
export type ResolvedPageContent = Record<
  string,
  SlugResult | SectionsResult | CollectionResult | null
>
