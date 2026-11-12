/**
 * CMS SEO module — structured data components and graph composition.
 */

export { DOCUMENT_SEO_METADATA_SCHEMA } from '@krantho/seo-shared'
export type { Archetype, ArchetypeConfig, SchemaType } from './archetypes/index.js'
// Archetypes
export {
  aboutPageArchetype,
  blogPostArchetype,
  coursePageArchetype,
  defineArchetype,
  eventPageArchetype,
  homePageArchetype,
  howToPageArchetype,
  jobPostingPageArchetype,
  recipePageArchetype,
  servicePageArchetype,
  videoPageArchetype,
} from './archetypes/index.js'
export type {
  AutoMapping,
  CatalogCategory,
  CatalogType,
  PropertyDef,
  PropertyImportance,
  PropertySource,
  SeoFieldMap,
} from './catalog/index.js'
// Schema.org type catalog
export {
  buildSeoFieldMap,
  CATEGORY_LABELS,
  DEFAULT_AUTO_MAPPINGS,
  getAutoMappableProperties,
  getCatalogByCategory,
  getCatalogType,
  getDocumentLevelTypes,
  getRequiredProperties,
  getSiteLevelTypes,
  getTypeProperties,
  resolveAutoMappings,
  resolveSeoField,
  SCHEMA_CATALOG,
} from './catalog/index.js'
export type { ConfigurationFinding, Seo, SeoSettings } from './create-seo.js'
// The SEO subsystem of a site
export { createSeo, SeoConfigurationError } from './create-seo.js'
export type { Decorator, PageContext, ResolvedStructure } from './decorators/index.js'
// Page-structure decorators
export {
  BUILT_IN_DECORATORS,
  breadcrumbDecorator,
  pageDecorator,
  pageTypeFor,
  registerDecorator,
  registeredDecorators,
  sequenceDecorator,
} from './decorators/index.js'
export type { SeoExtensions } from './define-seo.js'
// A site's own types, readers and decorators
export { defineSeo } from './define-seo.js'
export type {
  ComposeFromConfigOptions,
  ComposeGraphOptions,
  ConfigScope,
  DocumentMeta,
  EffectiveSeoConfig,
  EffectiveSeoEntity,
  JsonLdGraph,
  ResolvedEntity,
  ResolvedPropertyView,
  SeoConfigChain,
  SeoGraphConfig,
  ValueScope,
} from './graph/index.js'
// Graph composition
export {
  composeFromConfig,
  composeGraph,
  resolveEffectiveConfig,
  resolvePageEntities,
} from './graph/index.js'
// Components
export { JsonLd } from './json-ld.js'
export type {
  FeatureEligibility,
  FeatureStatus,
  ProfileRule,
  ReaderProfile,
} from './profiles/index.js'
// Reader profiles
export {
  BUILT_IN_PROFILES,
  bingProfile,
  featureEligibility,
  getProfile,
  googleProfile,
  registeredProfiles,
  registerProfile,
  ruleFor,
} from './profiles/index.js'
export type { SEOGraphProps } from './seo-graph.js'
// SEOGraph component
export { SEOGraph } from './seo-graph.js'
export type {
  BuildContext,
  EntityLevel,
  ReferenceRule,
  ResolvedProperty,
  TypeDefinition,
} from './types/index.js'
// Type definitions
export { BUILT_IN_TYPES, getTypeDefinition, registeredTypes, registerType } from './types/index.js'
export type {
  Finding,
  FindingCode,
  FindingSeverity,
  ValidateGraphOptions,
} from './validate/index.js'
// Validation
export { validateGraph } from './validate/index.js'
export type { Lifecycle } from './vocabulary/index.js'
// Schema.org vocabulary
export {
  getVocabularyProperty,
  getVocabularyType,
  isPropertyOfType,
  isSubtypeOf,
  lifecycleOf,
  propertiesOf,
  SCHEMAORG_RELEASE,
} from './vocabulary/index.js'
