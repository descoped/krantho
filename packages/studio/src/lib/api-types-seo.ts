import type { SeoConfigData, SeoConfigEntity } from '@krantho/seo-shared'

export type { SeoConfigData, SeoConfigEntity }

export interface EnrichJobResponse {
  jobId: string | null
  status: string
  type: string
  totalItems: number
  message?: string | undefined
}

export interface EnrichStatusResponse {
  jobId: string
  status: 'running' | 'complete' | 'error'
  type: string
  progress: {
    total: number
    completed: number
    skipped: number
    errors: number
    current: string | null
  }
  items: Array<{
    collection: string
    slug: string
    status: string
    result?: string | undefined
    error?: string | undefined
  }>
  summary?: { generated: number; skipped: number; errors: number } | undefined
  /** Tokens the provider reported for the job, and the model that served it */
  usage: { inputTokens: number; outputTokens: number; model: string | null }
}

export interface SeoConfig {
  id: string
  scope: 'site' | 'collection' | 'document' | 'route'
  config: SeoConfigData
  createdAt?: string | undefined
  updatedAt?: string | undefined
}

/** Editorial length limits, from the site's configuration */
export interface SeoLimits {
  metaDescription: { minChars: number; maxChars: number }
  title: { maxChars: number }
}

/** Whether a reader shows a search feature: offered, shown on conditions, withdrawn, or none */
export type FeatureStatus = 'active' | 'restricted' | 'retired' | 'none'

export interface CatalogType {
  type: string
  label: string
  description: string
  richResult: string | null
  richResultStatus: FeatureStatus
  docsUrl: string
  category: string
  siteLevel: boolean
  documentLevel: boolean
  /** Where the type stands in Schema.org; absent for a current type */
  lifecycle?: { status: 'pending' | 'superseded' | 'retired'; by?: string | undefined } | undefined
}

export interface PropertyDef {
  property: string
  label: string
  fieldType: 'text' | 'textarea' | 'url' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'array'
  importance: 'required' | 'recommended' | 'optional'
  source: 'auto' | 'manual' | 'computed' | 'site'
  autoMapField?: string | undefined
  hint?: string | undefined
}

/** One active reader's rule for a type, with the documentation it cites */
export interface ReaderRule {
  reader: string
  readerName: string
  type: string
  feature?: string | undefined
  status: FeatureStatus
  required?: readonly string[] | undefined
  oneOf?: ReadonlyArray<readonly string[]> | undefined
  recommended?: readonly string[] | undefined
  conditions?: readonly string[] | undefined
  source: string
  verifiedAt: string
}

export interface CatalogDetailResponse {
  type: CatalogType
  properties: readonly PropertyDef[]
  /** Each active reader's rule for the type */
  rules: readonly ReaderRule[]
}

/** Where a property's value comes from */
export type PropertySource = 'auto' | 'manual' | 'computed' | 'site'

/**
 * Where a value a page emits comes from (`scope` of `GET /api/seo/resolved`):
 * the site, the collection, a URL pattern (`route`) or the document itself;
 * computed from the page and its history; or linked — a reference to another entity
 */
export type ValueScope = 'site' | 'collection' | 'route' | 'document' | 'computed' | 'linked'

/** A property of an entity with its effective value and where it comes from */
export interface ResolvedPropertyView {
  property: string
  value: unknown
  source: PropertySource
  /** The site, collection, URL pattern or document that set the value; computed; or linked */
  scope: ValueScope
  /** Where the value was read, or how it was computed */
  origin: string
  /** Whether the SEO settings may set it */
  editable: boolean
}

/** An entity of a document's structured data with its resolved properties */
export interface ResolvedEntity {
  type: string
  id: string
  level: 'site' | 'document'
  properties: readonly ResolvedPropertyView[]
}
