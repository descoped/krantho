import type { JsonLdGraph } from '../graph/types.js'
import { profileFindings } from '../profiles/check.js'
import { getProfile } from '../profiles/registry.js'
import type { ReaderProfile } from '../profiles/types.js'
import { getVocabularyProperty, getVocabularyType, isPropertyOfType } from '../vocabulary/index.js'
import { termFindings } from './check-terms.js'
import { valueFindings } from './check-value.js'
import { allNodes, asList, idOf, propertyEntries, topLevelNodes, typesOf } from './graph-nodes.js'
import type { Finding, GraphNode } from './types.js'

interface NodeContext {
  nodeId?: string | undefined
  type?: string | undefined
}

function contextOf(node: GraphNode): NodeContext {
  return { nodeId: idOf(node), type: typesOf(node).join(', ') || undefined }
}

/** Every node defined twice under one `@id`, and the definitions by `@id` */
function indexDefinitions(nodes: readonly GraphNode[]): {
  definitions: Map<string, GraphNode>
  findings: Finding[]
} {
  const definitions = new Map<string, GraphNode>()
  const findings: Finding[] = []
  for (const node of nodes) {
    const id = idOf(node)
    if (id === undefined) continue
    if (definitions.has(id)) {
      const message = `"${id}" is defined by more than one node.`
      findings.push({
        ...contextOf(node),
        severity: 'error',
        code: 'duplicate-id',
        profile: 'schema.org',
        message,
      })
      continue
    }
    definitions.set(id, node)
  }
  return { definitions, findings }
}

/** The node's types: present, known to the vocabulary, and current */
function typeFindings(node: GraphNode): Finding[] {
  const context = contextOf(node)
  const types = typesOf(node)
  if (types.length === 0) {
    const message = 'A node has no "@type".'
    return [{ ...context, severity: 'error', code: 'missing-type', profile: 'schema.org', message }]
  }
  return types.flatMap((type): Finding[] => {
    if (getVocabularyType(type)) return termFindings('Type', type, context)
    const message = `Type "${type}" is not in the Schema.org vocabulary.`
    return [{ ...context, severity: 'error', code: 'unknown-type', profile: 'schema.org', message }]
  })
}

/** One property of a node: known, current, used on a type it belongs to, values in range */
function propertyFindings(
  node: GraphNode,
  property: string,
  value: unknown,
  definitions: ReadonlyMap<string, GraphNode>,
): Finding[] {
  const context = { ...contextOf(node), property }
  if (!getVocabularyProperty(property)) {
    const message = `Property "${property}" is not in the Schema.org vocabulary.`
    return [
      { ...context, severity: 'error', code: 'unknown-property', profile: 'schema.org', message },
    ]
  }
  const findings = termFindings('Property', property, context)
  const known = typesOf(node).filter((type) => getVocabularyType(type))
  if (known.length > 0 && !known.some((type) => isPropertyOfType(property, type))) {
    const message = `Property "${property}" is not defined for ${known.join(', ')}.`
    findings.push({
      ...context,
      severity: 'warning',
      code: 'property-not-in-domain',
      profile: 'schema.org',
      message,
    })
  }
  for (const item of asList(value)) {
    findings.push(...valueFindings(item, { where: context, definitions }))
  }
  return findings
}

/** What a graph is validated against beyond the Schema.org vocabulary */
export interface ValidateGraphOptions {
  /** Reader profiles whose rules apply too, by id (`google`, `bing`, a site's own) */
  readonly profiles?: readonly string[] | undefined
}

function profilesOf(ids: readonly string[]): ReaderProfile[] {
  return ids.map((id) => {
    const profile = getProfile(id)
    if (!profile) throw new Error(`validateGraph: no reader profile "${id}" is registered.`)
    return profile
  })
}

/**
 * Validate a JSON-LD graph against the pinned Schema.org vocabulary: every
 * reference resolves within the graph to a node of a type the property
 * accepts, no `@id` is defined twice, every node has a known, current type,
 * every property is known, current and used on a type it belongs to, and
 * every value is in the property's range. Superseded and retired terms are
 * errors; pending terms are information. The rules of each requested reader
 * profile are checked on every top-level node as well (see `profileFindings`).
 */
export function validateGraph(
  graph: JsonLdGraph | GraphNode,
  options: ValidateGraphOptions = {},
): Finding[] {
  const readers = profilesOf(options.profiles ?? [])
  const root: GraphNode = { ...graph }
  const nodes = allNodes(root)
  const { definitions, findings } = indexDefinitions(nodes)
  for (const node of nodes) {
    findings.push(...typeFindings(node))
    for (const [property, value] of propertyEntries(node)) {
      findings.push(...propertyFindings(node, property, value, definitions))
    }
  }
  // Readers' rules are about the entities a page states, not their nested parts
  for (const node of topLevelNodes(root)) {
    for (const profile of readers) findings.push(...profileFindings(node, profile))
  }
  return findings
}
