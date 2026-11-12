import { hasRuntimeSchema, type IPersistenceAdapter } from '@krantho/persistence'
import type { Collection } from '@krantho/schema'
import { mergeSchemas, resolveCollectionContract } from '@krantho/schema'
import type { ZodObject, ZodRawShape } from 'zod'

/**
 * Get the merged schema (code + runtime fields) for validation.
 * Falls back to code-only schema if adapter doesn't support runtime schemas.
 */
export async function getMergedSchema(
  collectionDef: Collection<ZodObject<ZodRawShape>>,
  adapter: IPersistenceAdapter,
): Promise<ZodObject<ZodRawShape>> {
  if (!hasRuntimeSchema(adapter)) return collectionDef.schema

  const runtimeSchema = await adapter.getRuntimeSchema(collectionDef.name)
  if (!runtimeSchema || runtimeSchema.fields.length === 0) {
    return collectionDef.schema
  }

  const merged = mergeSchemas(collectionDef.schema, runtimeSchema.fields)
  return merged
}

export async function getActiveContract(
  collection: Collection,
  adapter: IPersistenceAdapter,
): Promise<import('@krantho/persistence').ContentContract> {
  const runtime = hasRuntimeSchema(adapter) ? await adapter.getRuntimeSchema(collection.name) : null
  return resolveCollectionContract(collection, runtime)
}
