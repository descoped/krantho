/**
 * Canonical SEO configuration types.
 *
 * These are the single source of truth for the entity/config shape used
 * across all packages: persistence adapters, SEO graph composition, the
 * Studio, and the API handlers.
 */

/** A single Schema.org entity in the SEO configuration. */
export interface SeoConfigEntity {
  readonly '@type': string
  readonly '@id'?: string | undefined
  readonly role?: string | undefined
  readonly properties: Readonly<Record<string, unknown>>
}

/**
 * The page structure a scope gives its pages when their template states none:
 * the trail above them, root first (the page itself is added), and their kind.
 */
export interface SeoStructureDefaults {
  readonly trail?:
    | ReadonlyArray<{ readonly name: string; readonly url?: string | undefined }>
    | undefined
  readonly kind?: string | undefined
}

/** SEO configuration data — the content stored per scope (site/collection/document/route). */
export interface SeoConfigData {
  readonly entities: readonly SeoConfigEntity[]
  readonly fieldMappings?: Readonly<Record<string, string>> | undefined
  readonly structure?: SeoStructureDefaults | undefined
  /**
   * Site scope only: a robots.txt body served verbatim in place of the
   * generated one. Kept beside the entities, never among them, so no page's
   * structured data states it.
   */
  readonly robotsTxt?: string | undefined
}

/** Infer SEO config scope from a config ID. */
export function inferSeoConfigScope(id: string): 'site' | 'collection' | 'document' | 'route' {
  if (id === 'site') return 'site'
  if (id.startsWith('collection:')) return 'collection'
  if (id.startsWith('route:')) return 'route'
  if (id.startsWith('doc:')) return 'document'
  return 'document'
}
