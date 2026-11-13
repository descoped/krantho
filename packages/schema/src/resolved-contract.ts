import type { ContentContract, RuntimeSchemaDefinition } from '@krantho/persistence'
import {
  assertAuthorProperty,
  compileContentContract,
  type DocumentArchetype,
  defineMetadataArchetype,
  type MetadataSlot,
} from './archetypes.js'
import type { Collection } from './collection.js'
import { fromPortableJsonSchema } from './portable-schema.js'
import { mergeSchemas } from './runtime-schema.js'

/** Runtime additions produce a complete new contract; saved contracts never change. */
export function resolveCollectionContract(
  collection: Collection,
  runtime: RuntimeSchemaDefinition | null,
): ContentContract {
  const metadata: Record<string, MetadataSlot> = { ...collection.archetype.metadata }
  for (const group of runtime?.metadata ?? []) {
    assertAuthorProperty(group.slot)
    if (Object.hasOwn(metadata, group.slot))
      throw new Error(`Metadata slot "${group.slot}" is already defined`)
    if (group.schema.type !== 'object' || !group.schema.properties)
      throw new Error('Metadata groups require named properties')
    const schema = fromPortableJsonSchema(group.schema)
    metadata[group.slot] = {
      required: group.required,
      archetype: defineMetadataArchetype({
        id: group.id,
        label: group.label,
        schema,
      }),
    }
  }
  for (const field of runtime?.fields ?? []) assertAuthorProperty(field.name)
  const archetype: DocumentArchetype = { ...collection.archetype, metadata }
  return compileContentContract(archetype, mergeSchemas(collection.schema, runtime?.fields ?? []))
}
