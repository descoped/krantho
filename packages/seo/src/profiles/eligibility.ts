import type { JsonLdGraph } from '../graph/types.js'
import { isEmpty } from '../types/values.js'
import { idOf, topLevelNodes, typesOf } from '../validate/graph-nodes.js'
import type { GraphNode } from '../validate/types.js'
import { isPropertyOfType } from '../vocabulary/index.js'
import { getProfile, ruleFor } from './registry.js'
import type { FeatureStatus, ReaderProfile } from './types.js'

/** Whether an entity a page states is eligible for a reader's search feature */
export interface FeatureEligibility {
  readonly reader: string
  readonly feature: string
  readonly type: string
  readonly nodeId: string | undefined
  /** `active`: shown when the properties are present; `restricted`: shown only under the rule's conditions */
  readonly status: Extract<FeatureStatus, 'active' | 'restricted'>
  /** True when the feature is active and every property it needs is present */
  readonly eligible: boolean
  /** Properties (or `a | b` choices) the feature needs that the entity lacks */
  readonly missing: readonly string[]
  readonly conditions: readonly string[]
  /** The documentation the rule comes from */
  readonly source: string
}

function has(node: GraphNode, property: string): boolean {
  return !isEmpty(node[property])
}

/** What the reader's feature for the node's type still needs */
function missingFor(
  node: GraphNode,
  type: string,
  required: readonly string[],
  oneOf: ReadonlyArray<readonly string[]>,
): string[] {
  const applies = (property: string): boolean => isPropertyOfType(property, type)
  const missing = required.filter((property) => applies(property) && !has(node, property))
  for (const group of oneOf.map((g) => g.filter(applies)).filter((g) => g.length > 0)) {
    if (!group.some((property) => has(node, property))) missing.push(group.join(' | '))
  }
  return missing
}

/** One node's eligibility for a reader's feature, or null when the reader has none for its type */
function nodeEligibility(node: GraphNode, profile: ReaderProfile): FeatureEligibility | null {
  const type = typesOf(node)[0]
  if (!type) return null
  const rule = ruleFor(profile, type)
  if (!rule?.feature || (rule.status !== 'active' && rule.status !== 'restricted')) return null
  const missing = missingFor(node, type, rule.required ?? [], rule.oneOf ?? [])
  return {
    reader: profile.id,
    feature: rule.feature,
    type,
    nodeId: idOf(node),
    status: rule.status,
    eligible: rule.status === 'active' && missing.length === 0,
    missing,
    conditions: rule.conditions ?? [],
    source: rule.source,
  }
}

/**
 * The search features a page's entities can appear in, per reader: each
 * entity whose type has a reader rule for a feature the reader still shows,
 * with what it lacks. A feature a reader has retired is never listed.
 */
export function featureEligibility(
  graph: JsonLdGraph | GraphNode,
  readers: readonly string[],
): FeatureEligibility[] {
  const profiles = readers.flatMap((id) => getProfile(id) ?? [])
  const nodes = topLevelNodes({ ...graph })
  return profiles.flatMap((profile) =>
    nodes.flatMap((node) => nodeEligibility(node, profile) ?? []),
  )
}
