import dagre from 'dagre'
import type { PageGraph } from './graph-model.js'

/**
 * Where the canvas draws each node and link: a layered layout, left to
 * right, so the page's own entities sit beside the site entities they link to.
 */

/** A node's box, by its centre */
export interface NodeBox {
  key: string
  x: number
  y: number
}

/** A link's path and where its label sits */
export interface EdgePath {
  key: string
  property: string
  points: ReadonlyArray<{ x: number; y: number }>
  labelX: number
  labelY: number
}

export interface GraphLayout {
  width: number
  height: number
  nodes: NodeBox[]
  edges: EdgePath[]
}

export const NODE_WIDTH = 216
export const NODE_HEIGHT = 96

/** Room for a link's label: about one code-face character per 7px */
function labelSize(property: string): { width: number; height: number } {
  return { width: property.length * 7 + 12, height: 16 }
}

function buildLayoutGraph(graph: PageGraph): dagre.graphlib.Graph {
  const layout = new dagre.graphlib.Graph({ multigraph: true })
  layout.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 96, marginx: 16, marginy: 16 })
  layout.setDefaultEdgeLabel(() => ({}))
  for (const node of graph.nodes) {
    layout.setNode(node.key, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  graph.edges.forEach((edge, index) => {
    layout.setEdge(edge.from, edge.to, { ...labelSize(edge.property), labelpos: 'c' }, `e${index}`)
  })
  return layout
}

/** Lay the graph out; every node and link gets its place */
export function layoutGraph(graph: PageGraph): GraphLayout {
  const layout = buildLayoutGraph(graph)
  dagre.layout(layout)
  const nodes = graph.nodes.map((node): NodeBox => {
    const box = layout.node(node.key)
    return { key: node.key, x: box?.x ?? 0, y: box?.y ?? 0 }
  })
  const edges = graph.edges.map((edge, index): EdgePath => {
    const placed = layout.edge({ v: edge.from, w: edge.to, name: `e${index}` })
    const points = placed?.points ?? []
    const middle = points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 }
    return {
      key: `e${index}`,
      property: edge.property,
      points,
      labelX: placed?.x ?? middle.x,
      labelY: placed?.y ?? middle.y,
    }
  })
  const size = layout.graph()
  return { width: size.width ?? 0, height: size.height ?? 0, nodes, edges }
}
