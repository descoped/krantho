export { exportContractAsZod } from './contract-codegen.js'
// Collection and config APIs

export type { DocumentArchetype, MetadataArchetype, MetadataSlot } from './archetypes.js'
export {
  assertAuthorProperty,
  compileContentContract,
  contentDigest,
  defineDocumentArchetype,
  defineMetadataArchetype,
  documentChecksum,
} from './archetypes.js'
export type { Collection, CollectionConfig } from './collection.js'
export { defineCollection } from './collection.js'
export type { ContentConfig, ContentConfigInput } from './config.js'
export { defineConfig } from './config.js'
export {
  blogContent,
  classificationMetadata,
  editorialMetadata,
  publicationMetadata,
  sharingMetadata,
  structuredDataMetadata,
  websiteContent,
} from './content-archetypes.js'
export type { ValidationError, ValidationResult } from './errors.js'
export { ContentValidationError } from './errors.js'
export type { AppliedDefaults } from './metadata-defaults.js'
export { applyMetadataDefaults, retainDefaultProvenance } from './metadata-defaults.js'
export type {
  CollectionOptions,
  CollectionRef,
  ContentRef,
  PageDefinition,
  SectionsRef,
  SlugRef,
} from './page/index.js'
// Page composition
export { collection, definePage, sections, slug } from './page/index.js'
export { fromPortableJsonSchema } from './portable-schema.js'
export type { ParsedRepositoryContent } from './repository-content.js'
export { parseRepositoryContent } from './repository-content.js'
export { resolveCollectionContract } from './resolved-contract.js'
// Runtime schema — merge code + runtime fields, export as Zod code
export {
  exportSchemaAsZod,
  mergeSchemas,
} from './runtime-schema.js'
export type { CollectionJsonSchema } from './schema-export.js'
// Schema export (JSON Schema)
export { collectionToJsonSchema } from './schema-export.js'
export type { ValidateOptions } from './validate-content.js'
// Content validation (Zod-based)
export { validateAllContent, validateFields } from './validate-content.js'
export type { DocumentValues } from './validate-document.js'
export { documentSchema, validateDocument } from './validate-document.js'
