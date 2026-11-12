import { toJSONSchema } from 'zod'
import type { Collection } from './collection.js'

/** JSON Schema representation of a collection's frontmatter */
export interface CollectionJsonSchema {
  name: string
  source: 'filesystem' | 'database'
  schema: Record<string, unknown>
}

/**
 * Convert a collection's Zod schema to JSON Schema format.
 * Used by Studio to auto-generate form fields.
 */
export function collectionToJsonSchema(collection: Collection): CollectionJsonSchema {
  return {
    name: collection.name,
    source: collection.source,
    schema: toJSONSchema(collection.schema) as Record<string, unknown>,
  }
}
