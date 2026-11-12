import { resolveEffectiveTypes } from '@krantho/seo-shared'
import type { SeoConfigData, SeoConfigEntity } from '../../lib/api-types.js'
import { isRecord } from '../../lib/guards.js'
import { typeString } from '../../lib/jsonld-graph.js'

/**
 * What the graph editor starts from at the document scope: the composed
 * graph's nodes, each matched to an entity of the configuration it saves to
 * the document's `seo_config` (`doc:<collection>/<slug>`).
 */

/** A node of the graph the page emits, as `GET /api/seo/preview` returns it */
export interface EmittedNode {
  '@type'?: unknown
  '@id'?: unknown
  [key: string]: unknown
}

/** The nodes of an emitted graph: its `@graph`, or the one node it is */
export function emittedNodes(graph: unknown): EmittedNode[] {
  if (!isRecord(graph)) return []
  const nested = graph['@graph']
  if (Array.isArray(nested)) return nested.filter(isRecord)
  return [graph]
}

/** The configuration of each scope the document's entities come from; null where unset */
export interface ScopeConfigs {
  document: SeoConfigData | null
  collection: SeoConfigData | null
  site: SeoConfigData | null
}

/** The base the document's configuration starts from: its own, its collection's, or the effective types */
function baseConfig(configs: ScopeConfigs): SeoConfigData {
  if (configs.document) return configs.document
  // Only the collection's entities seed a document's own config: its field
  // mappings and page structure stay the collection's, so the document keeps
  // following them
  if (configs.collection) return { entities: configs.collection.entities }
  const types = resolveEffectiveTypes(null, null, configs.site)
  return { entities: types.map((type) => ({ '@type': type, properties: {} })) }
}

/** The unused entity of the base a node matches: by `@id`, else an entity of its type without one */
function matchIndex(
  entities: readonly SeoConfigEntity[],
  used: ReadonlySet<number>,
  type: string,
  id: string | undefined,
): number {
  const free = (index: number): boolean => !used.has(index)
  const byId = id ? entities.findIndex((e, i) => free(i) && e['@id'] === id) : -1
  if (byId >= 0) return byId
  return entities.findIndex((e, i) => free(i) && e['@type'] === type && !e['@id'])
}

/**
 * The document's configuration with one entity per emitted node, each
 * carrying the node's `@id`: so the editor can save a value on any entity,
 * the composed ones (a BreadcrumbList, the WebPage) included.
 */
export function editableConfig(
  nodes: readonly EmittedNode[],
  configs: ScopeConfigs,
): SeoConfigData {
  const base = baseConfig(configs)
  const used = new Set<number>()
  const entities: SeoConfigEntity[] = []
  for (const node of nodes) {
    const type = typeString(node['@type'])
    if (type === null) continue
    const id = typeof node['@id'] === 'string' ? node['@id'] : undefined
    const index = matchIndex(base.entities, used, type, id)
    const matched = base.entities[index]
    if (index >= 0 && matched) {
      used.add(index)
      entities.push(!matched['@id'] && id ? { ...matched, '@id': id } : matched)
    } else {
      entities.push({ '@type': type, ...(id ? { '@id': id } : {}), properties: {} })
    }
  }
  return { ...base, entities }
}

/** The Schema.org types of the emitted nodes, each once: the catalog details the editor reads */
export function emittedTypes(nodes: readonly EmittedNode[]): string[] {
  const types = nodes.flatMap((node) => {
    const type = typeString(node['@type'])
    return type === null ? [] : [type]
  })
  return [...new Set(types)]
}
