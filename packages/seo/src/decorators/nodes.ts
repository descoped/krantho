import type { SchemaEntity } from '../graph/types.js'
import { isSubtypeOf } from '../vocabulary/index.js'

/** The node's types, whether `@type` is one or several */
function typesOf(node: SchemaEntity): string[] {
  const type: unknown = node['@type']
  if (typeof type === 'string') return [type]
  return Array.isArray(type) ? type.filter((t): t is string => typeof t === 'string') : []
}

/** Whether the node is of the type or one of its subtypes */
export function isA(node: SchemaEntity, type: string): boolean {
  return typesOf(node).some((own) => isSubtypeOf(own, type))
}

/** The node with the `@id` */
export function nodeById(graph: readonly SchemaEntity[], id: string): SchemaEntity | undefined {
  return graph.find((node) => node['@id'] === id)
}

/** A reference to a node */
export function ref(id: string): { '@id': string } {
  return { '@id': id }
}

/** Add a value to a property that may already hold one or several */
export function addValue(node: SchemaEntity, property: string, value: unknown): void {
  const current = node[property]
  if (current === undefined) node[property] = value
  else node[property] = [...(Array.isArray(current) ? current : [current]), value]
}
