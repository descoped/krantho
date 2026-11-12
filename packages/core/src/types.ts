/**
 * CMS Core Types - UI-Agnostic Content Management
 *
 * Objective: Zero UI coupling, pure content management types
 * Zero UI coupling. Pure TypeScript interfaces, semantic styling tokens,
 *
 */

/**
 * Content processing result with all extracted data.
 *
 * `fields` contains schema-validated structured content data.
 * System metadata (status, locale, version) is not included here —
 * it lives in DocumentMeta at the persistence layer.
 */
export interface ContentResult {
  fields: Record<string, unknown>
  content: string
  html: string
  sections: Record<string, string>
  metadata: ContentMetadata
  loading: boolean
  error: ContentError | null
}

/**
 * Metadata about content processing and caching
 */
export interface ContentMetadata {
  slug: string
  lastModified: Date
  size: number
  processingTime: number
}

/**
 * Single source of truth for semantic style values.
 * The interface, validation arrays, and union types all derive from these tuples.
 */
export const VALID_VARIANTS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'body1',
  'body2',
  'caption',
] as const
export const VALID_COLORS = [
  'primary',
  'secondary',
  'error',
  'warning',
  'info',
  'success',
  'inherit',
] as const
export const VALID_ALIGNS = ['left', 'center', 'right', 'justify'] as const
export const VALID_WEIGHTS = ['light', 'regular', 'medium', 'bold'] as const
export const VALID_SIZES = ['small', 'medium', 'large'] as const

/**
 * UI-agnostic semantic styling tokens
 * Can be translated to any UI framework (Material UI, Shadcn, etc.)
 */
export interface SemanticStyle {
  variant?: (typeof VALID_VARIANTS)[number] | undefined
  color?: (typeof VALID_COLORS)[number] | undefined
  align?: (typeof VALID_ALIGNS)[number] | undefined
  weight?: (typeof VALID_WEIGHTS)[number] | undefined
  size?: (typeof VALID_SIZES)[number] | undefined
}

/**
 * Content processing errors with structured information
 */
export interface ContentError {
  code: 'NOT_FOUND' | 'PARSE_ERROR' | 'NETWORK_ERROR' | 'CACHE_ERROR' | 'VALIDATION_ERROR'
  message: string
  details?: Record<string, unknown>
}

/**
 * Configuration for content engine behavior
 */
export interface ContentEngineConfig {
  contentPath: string
  cacheEnabled: boolean
  cacheTTL: number
  maxCacheSize: number
  enableAtNotation: boolean
}

/**
 * Cache entry structure for content caching
 */
export interface CacheEntry {
  data: ContentResult
  timestamp: number
}

/**
 * Content engine interface for dependency injection
 */
export interface IContentEngine {
  loadContent(slug: string): Promise<ContentResult>
  getConfig(): ContentEngineConfig
  clearCache(): void
  getCacheStats(): CacheStats
}

/**
 * Cache statistics for monitoring and debugging
 */
export interface CacheStats {
  size: number
  hitRate: number
  totalRequests: number
  totalHits: number
  totalMisses: number
}

/**
 * Content loader interface for filesystem abstraction
 */
export interface IContentLoader {
  exists(slug: string): Promise<boolean>
  read(slug: string): Promise<string>
  getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>>
  listSlugs?(): Promise<string[]>
}

/** Identifies one document */
export interface ContentRef {
  collection: string
  slug: string
  /** Omitted: the site's default locale */
  locale?: string | undefined
}

/** A step of the trail a page renders; a relative URL resolves against the site's base URL */
export interface TrailItem {
  name: string
  /** Omitted for the page itself */
  url?: string | undefined
}

/**
 * The structure a page renders — facts its template knows — which its
 * structured data states: where the page sits, its place in an ordered set,
 * and what kind of page it is.
 */
export interface PageStructure {
  /** The trail the page renders, root first, the page last */
  trail?: readonly TrailItem[] | undefined
  /** Its place in an ordered set, such as a docs area or a series */
  sequence?: { partOf: { name: string; url: string }; position: number } | undefined
  /** What kind of page it is: `item`, `collection`, `about`, `faq`, `profile`, or a Schema.org WebPage type */
  kind?: string | undefined
}

/** A document's live (published) version, as server-rendered pages read it */
export interface PublishedContent {
  metadata: Record<string, Record<string, unknown>>
  collection: string
  slug: string
  locale: string
  fields: Record<string, unknown>
  /** Raw markdown body */
  body: string
  /** When the live version was written */
  publishedAt: Date
}

/** A document's live version without its body: what a page that only lists documents reads */
export type PublishedSummary = Omit<PublishedContent, 'body'>

/** The published content server-rendered pages read */
export interface IPublishedContentLoader {
  /** The live version of a document, or null when nothing is live */
  getPublished(ref: ContentRef): Promise<PublishedContent | null>
  /** The live version of every document in a collection that has one */
  listPublished(collection: string, locale?: string | undefined): Promise<PublishedContent[]>
  /** The live version of every document in a collection that has one, without the body */
  listPublishedSummaries(
    collection: string,
    locale?: string | undefined,
  ): Promise<PublishedSummary[]>
  /**
   * Whether the current render is an editor's preview, reading current
   * versions; always false for visitors and for a render a cache keeps
   */
  isPreview(): Promise<boolean>
}

/**
 * The SEO data server-rendered pages read, composed from the published version
 * of each document. Plain data: the CMS does not depend on the SEO packages.
 */
export interface IPublishedSeoLoader {
  /**
   * The primary entity's properties of an SEO configuration (`site`,
   * `doc:<collection>/<slug>`, …); empty when none. For `site`, the site's
   * identity from configuration, with the SEO settings' own values winning.
   */
  seoProperties(configId: string, locale?: string | undefined): Promise<Record<string, unknown>>
  /**
   * A page's JSON-LD graph, or null when the document has no published
   * version. The structure is what the page's template renders — its trail,
   * its place in a sequence, its kind — so the graph states what the page shows.
   */
  jsonLd(
    ref: ContentRef,
    structure?: PageStructure | undefined,
  ): Promise<Record<string, unknown> | null>
}

/** A markdown body rendered for display */
export interface RenderedContent {
  /** The body after @-notation substitution */
  content: string
  html: string
  /** h2 sections, keyed by heading */
  sections: Record<string, string>
}

/**
 * Markdown processor interface for content transformation
 */
export interface IMarkdownProcessor {
  parse(content: string): Promise<string>
  extractSections(content: string): Promise<Record<string, string>>
  processAtNotation(content: string, fields: Record<string, unknown>): string
}
/**
 * Default configuration values
 * Cache is disabled in development so content file edits are reflected immediately.
 */
export const DEFAULT_CONFIG: ContentEngineConfig = {
  contentPath: '/content/',
  cacheEnabled: process.env.NODE_ENV === 'production',
  cacheTTL: 300000, // 5 minutes
  maxCacheSize: 100,
  enableAtNotation: true,
}

// All types are exported via their interface declarations above
// No need for redundant type exports
