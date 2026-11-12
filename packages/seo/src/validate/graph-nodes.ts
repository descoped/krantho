import type { GraphNode } from './types.js'

/** Whether a value is a JSON object (not an array, not null) */
export function isObject(value: unknown): value is GraphNode {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A value as a list: arrays as they are, anything else as one element */
export function asList(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [value]
}

/** The node's types; empty when it has none */
export function typesOf(node: GraphNode): readonly string[] {
  return asList(node['@type']).filter((type): type is string => typeof type === 'string')
}

/** The node's `@id`, when it has one */
export function idOf(node: GraphNode): string | undefined {
  const id = node['@id']
  return typeof id === 'string' ? id : undefined
}

/** A reference: an object holding only `@id`, pointing at a node defined elsewhere */
export function isReference(value: unknown): value is GraphNode {
  return isObject(value) && idOf(value) !== undefined && Object.keys(value).length === 1
}

/** The top-level nodes of a graph: its `@graph` entries, or the root node itself */
export function topLevelNodes(graph: GraphNode): readonly GraphNode[] {
  const nodes = '@graph' in graph ? asList(graph['@graph']) : [graph]
  return nodes.filter(isObject)
}

/** The node's properties: every key that is not a JSON-LD keyword */
export function propertyEntries(node: GraphNode): ReadonlyArray<readonly [string, unknown]> {
  return Object.entries(node).filter(([key]) => !key.startsWith('@'))
}

/**
 * Every node definition in the graph, top-level and nested, in document
 * order. References are not definitions; a value object (`@value`) is not a
 * node.
 */
export function allNodes(graph: GraphNode): readonly GraphNode[] {
  const found: GraphNode[] = []
  const visit = (value: unknown): void => {
    for (const item of asList(value)) {
      if (!isObject(item) || isReference(item) || '@value' in item) continue
      found.push(item)
      for (const [, child] of propertyEntries(item)) visit(child)
    }
  }
  visit(topLevelNodes(graph))
  return found
}
