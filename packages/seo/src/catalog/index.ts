export type { AutoMapping, SeoFieldMap } from './auto-mappings.js'
export {
  buildSeoFieldMap,
  DEFAULT_AUTO_MAPPINGS,
  resolveAutoMappings,
  resolveSeoField,
} from './auto-mappings.js'
export type { PropertyDef, PropertyImportance, PropertySource } from './properties.js'
export {
  getAutoMappableProperties,
  getRequiredProperties,
  getTypeProperties,
} from './properties.js'
export type { CatalogCategory, CatalogType } from './types.js'
export {
  CATEGORY_LABELS,
  getCatalogByCategory,
  getCatalogType,
  getDocumentLevelTypes,
  getSiteLevelTypes,
  SCHEMA_CATALOG,
} from './types.js'
