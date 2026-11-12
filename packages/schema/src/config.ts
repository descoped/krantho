import type { ZodObject, ZodRawShape } from 'zod'
import { compileContentContract } from './archetypes.js'
import type { Collection } from './collection.js'

/**
 * Input to defineConfig — a record of named collections.
 */
export interface ContentConfigInput {
  collections: Record<string, Collection<ZodObject<ZodRawShape>>>
}

/**
 * Resolved content configuration. Carries the full collection map
 * for use by the content engine and validation functions.
 */
export interface ContentConfig {
  readonly collections: ReadonlyMap<string, Collection<ZodObject<ZodRawShape>>>
}

/**
 * Define the project-level content configuration.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   collections: { pages, blog },
 * })
 * ```
 */
export function defineConfig(input: ContentConfigInput): ContentConfig {
  const entries = Object.entries(input.collections)

  if (entries.length === 0) {
    throw new Error('defineConfig requires at least one collection')
  }

  const definitions = new Map<string, string>()
  const register = (id: string, revision: string): void => {
    const existing = definitions.get(id)
    if (existing !== undefined && existing !== revision)
      throw new Error(
        `Archetype "${id}" has incompatible definitions; give each variant its own identity`,
      )
    definitions.set(id, revision)
  }

  // Verify collection names match their record keys
  for (const [key, collection] of entries) {
    const contract = compileContentContract(collection.archetype)
    register(contract.id, contract.revision)
    for (const group of Object.values(contract.metadata)) register(group.id, group.revision)
    if (key !== collection.name) {
      throw new Error(`Collection key "${key}" does not match collection name "${collection.name}"`)
    }
  }

  return {
    collections: new Map(entries),
  }
}
