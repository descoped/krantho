import '../types/built-in/index.js'
import type { TrailItem } from '@krantho/core'
import type {
  BuildContext,
  EntityLevel,
  ReferenceRule,
  ResolvedProperty,
  TypeDefinition,
} from '../types/definition.js'
import { getTypeDefinition } from '../types/registry.js'
import { isEmpty } from '../types/values.js'
import { isPropertyOfType, isSubtypeOf } from '../vocabulary/index.js'
import { businessId, documentId } from './id-conventions.js'
import type { ComputedValues } from './resolve-properties.js'
import { resolveProperties } from './resolve-properties.js'
import { typedValue } from './typed-value.js'
import type { SchemaEntity, SeoGraphConfig } from './types.js'

/** What one entity is built from */
export interface EntityInput {
  readonly type: string
  readonly level: EntityLevel
  /** The entity's `@id` as configured; derived from its type when absent */
  readonly id?: string | undefined
  readonly configured: Readonly<Record<string, unknown>>
  readonly fields: Readonly<Record<string, unknown>>
  readonly fieldMappings?: Readonly<Record<string, string>> | undefined
  readonly computed: ComputedValues
  readonly site: SeoGraphConfig
  readonly path: string
  readonly title?: string | undefined
  readonly faq?: ReadonlyArray<{ question: string; answer: string }> | undefined
  readonly trail?: readonly TrailItem[] | undefined
}

/** A built entity with what the composer needs to finish the graph */
export interface ComposedNode {
  readonly entity: SchemaEntity
  readonly level: EntityLevel
  readonly references: Readonly<Record<string, ReferenceRule>>
}

/** The `@id` of an entity without a configured one */
function entityId(input: EntityInput, definition: TypeDefinition | undefined): string {
  const { baseUrl } = input.site
  const path = input.level === 'site' ? '' : input.path
  if (definition)
    return documentId(baseUrl, definition.scope === 'site' ? '' : path, definition.idFragment)
  if (input.level === 'site' && isSubtypeOf(input.type, 'Organization')) return businessId(baseUrl)
  return documentId(baseUrl, path, input.type.toLowerCase())
}

/** Whether a resolved value belongs on the entity the builder made */
export function carries(
  property: string,
  resolved: ResolvedProperty,
  type: string,
  definition: TypeDefinition | undefined,
): boolean {
  if (resolved.source === 'manual') return true
  if (
    resolved.source === 'computed' &&
    definition?.computed &&
    !definition.computed.includes(property)
  ) {
    return false
  }
  return isPropertyOfType(property, type)
}

/** An entity's definition, `@id` and resolved values — what building it starts from */
export function entityInputValues(input: EntityInput): {
  definition: TypeDefinition | undefined
  id: string
  values: Map<string, ResolvedProperty>
} {
  const definition = getTypeDefinition(input.type)
  const id = input.id ?? entityId(input, definition)
  return { definition, id, values: resolveProperties({ ...input, definition }) }
}

/**
 * Build one entity: resolve its property values, let the type's definition
 * shape it (a typed node with no properties when none is registered), then
 * carry every resolved value the builder left out and the type accepts — so
 * no builder can drop a configured or computed value. A nested node from
 * content gets the type its property names.
 */
export function buildEntity(input: EntityInput): ComposedNode {
  const { definition, id, values } = entityInputValues(input)
  const context: BuildContext = {
    type: input.type,
    id,
    level: input.level,
    site: input.site,
    path: input.level === 'site' ? '/' : input.path,
    values,
    title: input.title,
    faq: input.faq,
    trail: input.trail,
  }
  const entity: SchemaEntity = definition
    ? definition.build(context)
    : { '@type': input.type, '@id': id }
  for (const [property, resolved] of values) {
    if (!isEmpty(entity[property])) continue
    if (!carries(property, resolved, input.type, definition)) continue
    // Configured values are carried as set; validation reports what does not conform.
    entity[property] =
      resolved.source === 'manual' ? resolved.value : typedValue(property, resolved.value)
  }
  return { entity, level: input.level, references: definition?.references ?? {} }
}
