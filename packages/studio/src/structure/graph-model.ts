import type { EmittedNode } from '../editor/data-mode/graph-config.js'
import { type EntityView, nodeViews, referencesOf } from '../editor/data-mode/provenance.js'
import type { PageSearchFeature } from '../lib/api-seo.js'
import type { ResolvedEntity, SeoConfig, SeoConfigData } from '../lib/api-types.js'
import { typeString } from '../lib/jsonld-graph.js'

/**
 * A live page's graph as Structure draws it: each node the page serves, with
 * the scope it comes from, its property count, its rich results and what they
 * lack; each link between nodes labelled with the property that makes it.
 */

/**
 * Where a node comes from: a site entity, the collection's archetype, a URL
 * pattern's override, the document's own settings, or derived — composed by
 * krantho for the page (its WebPage, its breadcrumb), set by no scope
 */
export type NodeKind = 'site' | 'collection' | 'route' | 'document' | 'derived'

export const NODE_KINDS: Readonly<Record<NodeKind, { label: string; meaning: string }>> = {
  site: { label: 'site', meaning: 'A site entity: every page states it' },
  collection: { label: 'collection', meaning: "From the collection's archetype" },
  route: { label: 'URL pattern', meaning: "From a URL pattern's override" },
  document: { label: 'document', meaning: "From this page's own SEO settings" },
  derived: { label: 'derived', meaning: 'Composed by krantho for the page: no scope sets it' },
}

export interface GraphNodeView {
  /** Stable within the graph: the `@id`, or the node's place when it has none */
  key: string
  id: string
  type: string
  kind: NodeKind
  propertyCount: number
  /** The search features of the active readers this node can appear in */
  features: PageSearchFeature[]
  /** What those features need that the node lacks, each once */
  missing: string[]
  /** Each property with its value and its source */
  view: EntityView
}

/** A link from one node to another, by the property that holds the reference */
export interface GraphEdge {
  from: string
  to: string
  property: string
}

export interface PageGraph {
  nodes: GraphNodeView[]
  edges: GraphEdge[]
}

/** The stored configurations a page's entities can come from */
export interface PageScopes {
  document: SeoConfigData | null
  collection: SeoConfigData | null
  /** Every URL pattern's configuration: a type found in one came from a route */
  routes: readonly SeoConfigData[]
}

export interface PageGraphSources {
  nodes: readonly EmittedNode[]
  resolved: readonly ResolvedEntity[]
  siteTypes: ReadonlySet<string>
  scopes: PageScopes
  /** The page's features from its findings */
  features: readonly PageSearchFeature[]
}

/** The scopes of one page, from every stored configuration */
export function pageScopes(
  configs: readonly SeoConfig[],
  collection: string,
  slug: string,
): PageScopes {
  const byId = (id: string): SeoConfigData | null =>
    configs.find((config) => config.id === id)?.config ?? null
  return {
    document: byId(`doc:${collection}/${slug}`),
    collection: byId(`collection:${collection}`),
    routes: configs.filter((config) => config.scope === 'route').map((config) => config.config),
  }
}

const hasType = (config: SeoConfigData | null, type: string): boolean =>
  config?.entities.some((entity) => entity['@type'] === type) ?? false

/**
 * A page entity's scope: the narrowest that names its type — the document's
 * own settings, then a URL pattern, then the collection — else derived
 */
function kindOf(view: EntityView, resolved: boolean, scopes: PageScopes): NodeKind {
  if (view.scope === 'site') return 'site'
  if (!resolved) return 'derived'
  if (hasType(scopes.document, view.type)) return 'document'
  if (scopes.routes.some((route) => hasType(route, view.type))) return 'route'
  if (hasType(scopes.collection, view.type)) return 'collection'
  return 'derived'
}

function featuresOf(
  features: readonly PageSearchFeature[],
  id: string,
  type: string,
): PageSearchFeature[] {
  return features.filter((f) => (f.nodeId && id ? f.nodeId === id : f.type === type))
}

function nodeView(
  node: EmittedNode,
  view: EntityView,
  index: number,
  sources: PageGraphSources,
): GraphNodeView {
  const resolved = view.id !== '' && sources.resolved.some((entity) => entity.id === view.id)
  const features = featuresOf(sources.features, view.id, view.type)
  return {
    key: view.id || `node-${index}`,
    id: view.id,
    type: typeString(node['@type']) ?? view.type,
    kind: kindOf(view, resolved, sources.scopes),
    propertyCount: view.rows.length,
    features,
    missing: [...new Set(features.flatMap((f) => f.missing))],
    view,
  }
}

/** The links of the graph: each reference from one node to another node of the page */
function edgesOf(nodes: readonly GraphNodeView[], emitted: readonly EmittedNode[]): GraphEdge[] {
  const keyOf = new Map(nodes.filter((n) => n.id).map((n) => [n.id, n.key]))
  const edges: GraphEdge[] = []
  emitted.forEach((node, index) => {
    const from = nodes[index]?.key
    if (!from) return
    for (const [property, value] of Object.entries(node)) {
      if (property.startsWith('@')) continue
      for (const ref of referencesOf(value)) {
        const to = keyOf.get(ref)
        if (to && to !== from) edges.push({ from, to, property })
      }
    }
  })
  return edges
}

/** The page's graph: its nodes in the served order, and the links between them */
export function pageGraph(sources: PageGraphSources): PageGraph {
  const views = nodeViews({
    nodes: sources.nodes,
    resolved: sources.resolved,
    siteTypes: sources.siteTypes,
  })
  const nodes = sources.nodes.flatMap((node, index) => {
    const view = views[index]
    return view ? [nodeView(node, view, index, sources)] : []
  })
  return { nodes, edges: edgesOf(nodes, sources.nodes) }
}

/** The kinds a graph's nodes have, in the legend's order: site, collection, URL pattern, document, derived */
export function legendKinds(graph: PageGraph): NodeKind[] {
  const present = new Set(graph.nodes.map((node) => node.kind))
  const always: NodeKind[] = ['site', 'collection', 'document', 'derived']
  return (Object.keys(NODE_KINDS) as NodeKind[]).filter(
    (kind) => always.includes(kind) || present.has(kind),
  )
}

/** A node's outgoing links, as words, each once: `publisher → ProfessionalService` */
export function linkLines(graph: PageGraph, key: string): string[] {
  const typeOf = new Map(graph.nodes.map((node) => [node.key, node.type]))
  const lines = graph.edges
    .filter((edge) => edge.from === key)
    .map((edge) => `${edge.property} → ${typeOf.get(edge.to) ?? edge.to}`)
  return [...new Set(lines)]
}
