import type { ReferenceRule } from '../types/definition.js'
import { ref } from '../types/values.js'
import { idOf, isReference, typesOf } from '../validate/graph-nodes.js'
import type { Finding } from '../validate/types.js'
import { isSubtypeOf } from '../vocabulary/index.js'
import type { ComposedNode } from './build-entity.js'
import type { SchemaEntity } from './types.js'

/** Receives what composing a graph changed or could not do */
export type FindingSink = (finding: Finding) => void

/** The first site entity of an acceptable type, in the rule's order of preference */
function siteEntityFor(rule: ReferenceRule, nodes: readonly ComposedNode[]): string | undefined {
  for (const type of rule.types) {
    const match = nodes.find(
      (node) => node.level === 'site' && typesOf(node.entity).some((t) => isSubtypeOf(t, type)),
    )
    const id = match ? idOf(match.entity) : undefined
    if (id) return id
  }
  return undefined
}

function resolveNode(
  node: ComposedNode,
  nodes: readonly ComposedNode[],
  defined: ReadonlySet<string>,
  onFinding: FindingSink | undefined,
): SchemaEntity {
  const entity: SchemaEntity = { ...node.entity }
  for (const [property, rule] of Object.entries(node.references)) {
    const value = entity[property]
    if (!isReference(value) || defined.has(idOf(value) ?? '')) continue
    const target = rule.resolve === 'site-entity' ? siteEntityFor(rule, nodes) : undefined
    if (target) {
      entity[property] = ref(target)
      continue
    }
    delete entity[property]
    onFinding?.({
      severity: 'warning',
      code: 'unresolved-reference',
      profile: 'schema.org',
      nodeId: entity['@id'],
      type: entity['@type'],
      property,
      message: `"${property}" is left out: the site configures no ${rule.types.join(' or ')}.`,
    })
  }
  return entity
}

/**
 * Make every reference a type definition emits resolve within the graph: a
 * reference whose target is missing points at a site entity of an acceptable
 * type (`site-entity`), or is removed with a finding when the rule says
 * `omit` or nothing fits. References in configured values are left as they
 * are — validation reports them.
 */
export function resolveReferences(
  nodes: readonly ComposedNode[],
  onFinding?: FindingSink | undefined,
): SchemaEntity[] {
  const defined = new Set(nodes.map((node) => idOf(node.entity)).filter((id) => id !== undefined))
  return nodes.map((node) => resolveNode(node, nodes, defined, onFinding))
}
