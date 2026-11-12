import { getVocabularyType, lifecycleOf } from '../vocabulary/index.js'
import type { TypeDefinition } from './definition.js'

const definitions = new Map<string, TypeDefinition>()

/**
 * Register how a Schema.org type is built. A site registers its own types the
 * same way krantho registers its built-ins; a later registration for a type
 * replaces the earlier one. Throws for a type the vocabulary does not have, or
 * one Schema.org has superseded or retired. Returns a function that restores
 * the previous registration.
 */
export function registerType(definition: TypeDefinition): () => void {
  if (!getVocabularyType(definition.type)) {
    throw new Error(`registerType: "${definition.type}" is not a Schema.org type.`)
  }
  const lifecycle = lifecycleOf(definition.type)
  if (lifecycle?.status === 'superseded' || lifecycle?.status === 'retired') {
    throw new Error(`registerType: "${definition.type}" is ${lifecycle.status} in Schema.org.`)
  }
  const previous = definitions.get(definition.type)
  definitions.set(definition.type, definition)
  return () => {
    if (definitions.get(definition.type) !== definition) return
    if (previous) definitions.set(definition.type, previous)
    else definitions.delete(definition.type)
  }
}

/** The definition registered for the type; undefined builds it generically */
export function getTypeDefinition(type: string): TypeDefinition | undefined {
  return definitions.get(type)
}

/** The types with a registered definition */
export function registeredTypes(): readonly string[] {
  return [...definitions.keys()]
}
