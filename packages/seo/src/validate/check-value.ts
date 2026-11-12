import {
  enumerationsOf,
  getVocabularyProperty,
  isDatatype,
  isEnumeration,
  isSubtypeOf,
  matchesDatatype,
  rangeAcceptsType,
} from '../vocabulary/index.js'
import { termFindings } from './check-terms.js'
import { idOf, isObject, isReference, typesOf } from './graph-nodes.js'
import type { Finding, GraphNode } from './types.js'

/** Where a value appears */
export interface ValuePlace {
  nodeId?: string | undefined
  type?: string | undefined
  property: string
}

/** The value's place, and the graph's node definitions by `@id` */
export interface ValueContext {
  where: ValuePlace
  definitions: ReadonlyMap<string, GraphNode>
}

function display(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value)
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

function expected(range: readonly string[]): string {
  return range.length <= 1
    ? (range[0] ?? '')
    : `${range.slice(0, -1).join(', ')} or ${range.at(-1)}`
}

function outOfRange(where: ValuePlace, range: readonly string[], got: string): Finding {
  return {
    ...where,
    severity: 'error',
    code: 'value-out-of-range',
    profile: 'schema.org',
    message: `"${where.property}" expects ${expected(range)}; got ${got}.`,
  }
}

/** Findings for a literal: it must match a data type, or name an enumeration member, in range */
function literalFindings(value: unknown, range: readonly string[], where: ValuePlace): Finding[] {
  if (range.some((type) => isDatatype(type) && matchesDatatype(type, value))) return []
  if (typeof value === 'string') {
    const enumerations = range.filter(isEnumeration)
    const memberOf = enumerationsOf(value)
    if (memberOf.some((member) => enumerations.some((type) => isSubtypeOf(member, type)))) {
      return termFindings('Value', value, where)
    }
    // Schema.org accepts text where a thing is expected ("some data is better than none").
    if (range.some((type) => !isDatatype(type) && !isEnumeration(type))) return []
  }
  return [outOfRange(where, range, display(value))]
}

/** Findings for a reference: its target must exist and have a type in range */
function referenceFindings(id: string, range: readonly string[], context: ValueContext): Finding[] {
  const target = context.definitions.get(id)
  const { where } = context
  if (!target) {
    const message = `"${where.property}" refers to "${id}", which no node in the graph defines.`
    return [
      { ...where, severity: 'error', code: 'unresolved-reference', profile: 'schema.org', message },
    ]
  }
  return nodeTypeFindings(target, range, where, `"${id}" (${typesOf(target).join(', ')})`)
}

function nodeTypeFindings(
  node: GraphNode,
  range: readonly string[],
  where: ValuePlace,
  got: string,
): Finding[] {
  const types = typesOf(node)
  if (types.length === 0 || types.some((type) => rangeAcceptsType(where.property, type))) return []
  return [outOfRange(where, range, got)]
}

/**
 * Findings for one value of a property: a reference must resolve to a node of
 * a type in the property's range, a nested node must have such a type, and a
 * literal must fit a data type or enumeration in range.
 */
export function valueFindings(value: unknown, context: ValueContext): Finding[] {
  if (value === null || value === undefined) return []
  const { where } = context
  const range = getVocabularyProperty(where.property)?.range ?? []
  if (range.length === 0) return []
  if (isReference(value)) return referenceFindings(idOf(value) ?? '', range, context)
  if (isObject(value)) {
    if ('@value' in value) return literalFindings(value['@value'], range, where)
    return nodeTypeFindings(value, range, where, `a ${typesOf(value).join(', ')}`)
  }
  return literalFindings(value, range, where)
}
