/**
 * Content reference types for page composition.
 *
 * Three reference types describe what content a page needs:
 * - SlugRef: single document (full frontmatter + body + sections)
 * - SectionsRef: specific ## heading sections from a document
 * - CollectionRef: multiple articles from a named collection
 */

/** Reference to a single content document */
export interface SlugRef {
  readonly collection: string
  readonly locale?: string | undefined
  readonly type: 'slug'
  readonly slug: string
}

/** Reference to specific ## sections from a content document */
export interface SectionsRef {
  readonly collection: string
  readonly locale?: string | undefined
  readonly type: 'sections'
  readonly slug: string
  /** Named sections to extract, or '*' for all sections */
  readonly names: readonly string[] | '*'
}

/** Options for collection queries */
export interface CollectionOptions {
  /** Sort expression, e.g., 'date:desc', 'title:asc' */
  sort?: string | undefined
  /** Maximum number of results */
  limit?: number | undefined
  /** Pagination offset */
  offset?: number | undefined
  /** Slug to exclude — ':slug' resolves to current dynamic slug */
  exclude?: string | undefined
}

/** Reference to multiple articles from a collection */
export interface CollectionRef {
  readonly locale?: string | undefined
  readonly type: 'collection'
  readonly collection: string
  readonly options: CollectionOptions
}

/** Union of all content reference types */
export type ContentRef = SlugRef | SectionsRef | CollectionRef

/** Declares a page's route and content requirements */
export interface PageDefinition {
  readonly route: string
  readonly content: Readonly<Record<string, ContentRef>>
}
