import { documentPath } from '@krantho/core/cache-tags'
import type {
  CatalogType,
  CollectionInfo,
  CollectionSchema,
  JsonSchemaProperty,
  RuntimeFieldDefinition,
  SeoConfig,
} from '../lib/api.js'
import { fetchCollections, fetchSeoCatalog, fetchSeoConfigs } from '../lib/api.js'
import { isRecord } from '../lib/guards.js'
import { optionalSource, type Source } from '../lib/source.js'

/**
 * Setup › Collections & schema: each collection with where its documents
 * render and the Schema.org types its archetype gives them, and a
 * collection's fields — the code-defined ones, read-only, and the runtime ones
 * an admin adds here.
 */

/** What the tab reads: the collections, and — with SEO on — the stored archetypes and the catalog */
export interface CollectionSources {
  collections: CollectionInfo[]
  configs: Source<SeoConfig[]>
  catalog: Source<CatalogType[]>
}

export async function loadCollectionSources(seo: boolean): Promise<CollectionSources> {
  const [collections, configs, catalog] = await Promise.all([
    fetchCollections(),
    optionalSource(seo, fetchSeoConfigs),
    optionalSource(seo, async () => (await fetchSeoCatalog()).types),
  ])
  return { collections, configs, catalog }
}

export interface CollectionRow {
  collection: CollectionInfo
  /** The URL pattern its documents render at (`documentPath` of core); null without pages */
  rendersAt: string | null
  /** The Schema.org types of its archetype; null when SEO is off or its settings were not read */
  types: string[] | null
  /** The search features those types are eligible for, by the catalog; null when not read */
  richResults: string[] | null
}

function archetypeTypes(configs: Source<SeoConfig[]>, name: string): string[] | null {
  if (configs.state !== 'ok') return null
  const stored = configs.value.find((config) => config.id === `collection:${name}`)
  return stored?.config.entities.map((entity) => entity['@type']) ?? []
}

/** The features of the types that a reader still shows: never a retired one (§7) */
function featuresOf(catalog: Source<CatalogType[]>, types: string[] | null): string[] | null {
  if (catalog.state !== 'ok' || types === null) return null
  const features = catalog.value
    .filter((type) => types.includes(type.type) && type.richResult !== null)
    .filter((type) => type.richResultStatus === 'active' || type.richResultStatus === 'restricted')
    .map((type) => type.richResult ?? '')
  return [...new Set(features)]
}

export function collectionRows(sources: CollectionSources): CollectionRow[] {
  return sources.collections.map((collection) => {
    const types = collection.pages ? archetypeTypes(sources.configs, collection.name) : []
    return {
      collection,
      rendersAt: documentPath(collection, ':slug'),
      types,
      richResults: collection.pages ? featuresOf(sources.catalog, types) : [],
    }
  })
}

/** A field of a collection: defined in code (read-only) or added at runtime (editable) */
export interface SchemaField {
  name: string
  type: string
  required: boolean
  description: string | null
  /** The field's default, as the schema states it; null when it has none */
  defaultValue: string | null
  source: 'code' | 'runtime'
  /** The runtime definition, for a runtime field */
  runtime: RuntimeFieldDefinition | null
}

/** A default as the field table shows it: JSON for anything but a string; null when there is none */
export function defaultText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** A JSON Schema property's type as the field table names it */
export function fieldTypeLabel(prop: JsonSchemaProperty): string {
  if (prop.enum) return 'enum'
  if (prop.format === 'uri') return 'url'
  if (prop.format === 'email') return 'email'
  return String(prop.type ?? 'string')
}

/**
 * The fields: the code-defined ones from the merged JSON Schema (the API marks
 * the runtime ones `_runtime`), then the runtime definitions
 */
export function schemaFields(
  schema: CollectionSchema,
  runtime: readonly RuntimeFieldDefinition[],
): SchemaField[] {
  const required = new Set(schema.schema.required ?? [])
  const code = Object.entries(schema.schema.properties ?? {})
    .filter(([, prop]) => !(isRecord(prop) && prop._runtime))
    .map(([name, prop]) => ({
      name,
      type: fieldTypeLabel(prop),
      required: required.has(name),
      description: prop.description ?? null,
      defaultValue: defaultText(prop.default),
      source: 'code' as const,
      runtime: null,
    }))
  const added = runtime.map((field) => ({
    name: field.name,
    type: field.type,
    required: field.required,
    description: field.description ?? null,
    defaultValue: defaultText(field.default),
    source: 'runtime' as const,
    runtime: field,
  }))
  return [...code, ...added]
}
