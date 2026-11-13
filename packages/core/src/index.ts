// Content engine

export type { CdnCacheHeaderOptions, CdnProvider } from './cache-headers.js'
export { cdnCacheHeaders, pageTagBudget, previewHeaders } from './cache-headers.js'
export type {
  CacheInvalidation,
  CollectionPath,
  InvalidationMode,
  PageCollection,
} from './cache-tags.js'
export {
  collectionBasePath,
  collectionTag,
  documentPath,
  documentReadTags,
  documentTag,
  invalidationsFor,
  jsonLdTags,
  listReadTags,
  pageCollection,
  rendersPages,
  SITE_TAG,
  seoReadTags,
  seoTag,
} from './cache-tags.js'

// Change events and the cache tag vocabulary
export type { ContentChange, ContentChangeListener } from './content-change.js'
export type { MarkdownProcessorOptions, RenderContentOptions } from './content-engine.js'
export {
  ContentEngine,
  ContentEngineFactory,
  ContentEngineUtils,
  MarkdownProcessor,
  renderContent,
} from './content-engine.js'
// Client loader
export { ClientFetchLoader } from './loaders/client-fetch-loader.js'
export type { KranthoMarks, MarkedDocument } from './marks.js'
// Preview-only Live marks — also browser-safe on its own as `@krantho/core/marks`
export {
  DOCUMENT_MARK,
  FIELD_MARK,
  kranthoField,
  kranthoSection,
  markAttributes,
  markBodySections,
  SECTION_MARK,
} from './marks.js'
export type { BodySection, SplitBody } from './sections.js'
// A body's sections — also browser-safe on its own as `@krantho/core/sections`
export {
  findSection,
  joinSections,
  LEAD_SECTION,
  replaceSection,
  splitSections,
} from './sections.js'
export { resolveSitePath } from './site-path.js'

// Server-only modules use node:fs and are NOT re-exported from the barrel, to keep
// client/browser bundles free of node:fs. Available via subpath exports:
//   import { createContentResolver } from '@krantho/core/content'  (Tier 1 resolver)
//   import { loadSeoJson, loadSeoText } from '@krantho/core/seo'

export { canonicalJson } from './canonical-json.js'
export type {
  CollectionItem,
  CollectionResult,
  ResolveContext,
  ResolvedPageContent,
  SectionItem,
  SectionsResult,
  SlugResult,
} from './composition/index.js'
// Page composition
export { resolvePageContent, resolveParams } from './composition/index.js'
export type {
  AuthoredMetadata,
  ContentContract,
  ContractReference,
  DefaultProvenance,
  MetadataGroupContract,
  RepositoryBasis,
  RepositoryDocument,
} from './content-contract.js'
export { authoredMetadata } from './content-contract.js'
// Frontmatter utilities
export { DEFAULT_FRONTMATTER_STATUS, splitFrontmatter } from './frontmatter-utils.js'
export type { AtNotationConfig } from './processors/at-notation-processor.js'
// Processors
export { processAtNotation } from './processors/at-notation-processor.js'
// Semantic style utilities
export { variantToTag } from './semantic-style-utils.js'
export type { ContentData } from './shared-types.js'
// Shared types (errors)
export { NetworkError } from './shared-types.js'
export { normalizeTimestamps, type TimestampSchema, toUtcTimestamp } from './timestamps.js'
// Core types
export type {
  CacheEntry,
  CacheStats,
  ContentEngineConfig,
  ContentError,
  ContentMetadata,
  ContentRef,
  ContentResult,
  IContentEngine,
  IContentLoader,
  IMarkdownProcessor,
  IPublishedContentLoader,
  IPublishedSeoLoader,
  PageStructure,
  PublishedContent,
  PublishedSummary,
  RenderedContent,
  SemanticStyle,
  TrailItem,
} from './types.js'
// Constants and config
export {
  DEFAULT_CONFIG,
  VALID_ALIGNS,
  VALID_COLORS,
  VALID_SIZES,
  VALID_VARIANTS,
  VALID_WEIGHTS,
} from './types.js'
