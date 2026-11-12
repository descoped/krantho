import type { AuthoredMetadata, ContentContract } from '@krantho/core'
/** Collection metadata from GET /api/collections */
export interface CollectionInfo {
  name: string
  source: 'filesystem' | 'database'
  directory: string | undefined
  /** Whether the collection's documents render as pages on the site */
  pages: boolean
  /** The URL pattern the collection declares, `false` for no pages; absent for the default rule */
  path?: string | false | undefined
  /** The `##` sections its page template designs, in order; empty when it designs none */
  sections: readonly string[]
}

/** Document metadata returned by the API */
export interface DocumentMeta {
  collection: string
  slug: string
  locale: string
  version: number
  /** The live version — what visitors see; null when nothing is live */
  liveVersion: number | null
  status: string
  source: string
  changedBy: string | null
  createdAt: string
}

/** Content document from GET /api/content/:collection/:slug */
export interface ContentItem extends AuthoredMetadata {
  meta: DocumentMeta
  fields: Record<string, unknown>
  body: string
  html: string
  sections: Record<string, string>
}

/** A document without its body, HTML or sections: a list row's meta and fields */
export type ContentSummaryItem = Pick<ContentItem, 'meta' | 'fields' | 'metadata'>

/** List response from GET /api/content/:collection?view=summary */
export interface SummaryListResult {
  items: ContentSummaryItem[]
  hasMore: boolean
}

/** A match from GET /api/content/search: a document's meta and fields, and the text around the match */
export interface SearchHit {
  meta: DocumentMeta
  fields: Record<string, unknown>
  snippet?: string | undefined
}

/** Search response from GET /api/content/search */
export interface SearchResult {
  items: SearchHit[]
  hasMore: boolean
}

/** Response from GET /api/content-tree: each collection's documents as meta, with no content */
export interface ContentTree {
  collections: Array<{ name: string; documents: DocumentMeta[] }>
}

/** JSON Schema for a collection's fields */
export interface CollectionSchema {
  contract: ContentContract
  name: string
  source: 'filesystem' | 'database'
  schema: JsonSchema
}

/** Subset of JSON Schema used for form generation */
export interface JsonSchema {
  type?: string | undefined
  properties?: Record<string, JsonSchemaProperty> | undefined
  required?: string[] | undefined
}

export interface JsonSchemaProperty {
  anyOf?: JsonSchemaProperty[] | undefined
  oneOf?: JsonSchemaProperty[] | undefined
  title?: string | undefined
  properties?: Record<string, JsonSchemaProperty> | undefined
  required?: string[] | undefined
  additionalProperties?: boolean | JsonSchemaProperty | undefined
  type?: string | undefined
  enum?: string[] | undefined
  default?: unknown | undefined
  format?: string | undefined
  items?: JsonSchemaProperty | undefined
  minLength?: number | undefined
  maxLength?: number | undefined
  minimum?: number | undefined
  maximum?: number | undefined
  pattern?: string | undefined
  description?: string | undefined
}

/** Version info */
export interface VersionInfo extends AuthoredMetadata {
  version: number
  fields: Record<string, unknown>
  body: string
  changedBy: string | null
  createdAt: string
}

/** Runtime field definition */
export interface RuntimeFieldDefinition {
  name: string
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'date'
    | 'enum'
    | 'url'
    | 'email'
    | 'textarea'
    | 'color'
    | 'reference'
  required: boolean
  default?: unknown | undefined
  description?: string | undefined
  enumValues?: string[] | undefined
  refCollection?: string | undefined
  min?: number | undefined
  max?: number | undefined
  pattern?: string | undefined
}

/** Runtime schema for a collection */
export interface RuntimeSchemaResponse {
  collection: string
  fields: RuntimeFieldDefinition[]
  updatedAt: string | null
}

/** An edit lock someone holds on a document, from GET /api/locks */
export interface ContentLock {
  collection: string
  slug: string
  locale: string
  /** The holder, as the API records it (`<role>:<email>` for a signed-in user) */
  lockedBy: string
  lockedAt: string
  expiresAt: string
}

/** Translation status per item */
export interface TranslationItem {
  slug: string
  locales: string[]
  missing: string[]
}

/** Translation status per collection */
export interface CollectionTranslationStatus {
  collection: string
  total: number
  items: TranslationItem[]
}
