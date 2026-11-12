import {
  Background,
  Controls,
  type Edge,
  getNodesBounds,
  getViewportForBounds,
  MiniMap,
  type Node,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import type { CatalogDetailResponse, CatalogType } from '../../lib/api-types.js'
import {
  classifyNodeProperties,
  countRequired,
  EDIT_KEY,
  entityCategory,
  type GraphModel,
  type GraphNode,
  typeString,
} from '../../lib/jsonld-graph.js'
import { CanvasEntityNode } from './CanvasEntityNode.js'
import './graph-canvas.css'

interface GraphCanvasProps {
  model: GraphModel
  catalogTypes: readonly CatalogType[]
  catalogDetails: ReadonlyMap<string, CatalogDetailResponse>
  selectedEk: string | null
  onSelect: (node: GraphNode) => void
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 100

const nodeTypes: NodeTypes = {
  entity: CanvasEntityNode,
}

/**
 * Canvas view of the JSON-LD graph using @xyflow/react.
 * Wraps the inner flow in ReactFlowProvider so useReactFlow works.
 */
export function GraphCanvas(props: GraphCanvasProps): React.ReactElement {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

/**
 * Inner canvas component — has access to useReactFlow for custom
 * viewport positioning (top-aligned instead of centered).
 */
function GraphCanvasInner({
  model,
  catalogTypes,
  catalogDetails,
  selectedEk,
  onSelect,
}: GraphCanvasProps): React.ReactElement {
  // Build graph layout without selectedEk — selection is handled
  // separately to preserve drag positions on selection change.
  const { initialNodes, initialEdges } = useMemo(
    () => buildFlowGraph(model, catalogTypes, catalogDetails, null),
    [model, catalogTypes, catalogDetails],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const { setViewport } = useReactFlow()
  const flowRef = useRef<HTMLDivElement>(null)

  // Rebuild nodes/edges when model changes (edit mode: add/remove entities)
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // Sync selection state on existing nodes (preserves drag positions)
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({ ...n, data: { ...n.data, selected: n.id === selectedEk } })),
    )
  }, [selectedEk, setNodes])

  // After initial render, fit nodes to top of canvas instead of center
  useEffect(() => {
    if (nodes.length === 0) return
    const timer = setTimeout(() => {
      const bounds = getNodesBounds(nodes)
      if (!flowRef.current) return
      const { width, height } = flowRef.current.getBoundingClientRect()
      const viewport = getViewportForBounds(bounds, width, height, 0.2, 1, 0.15)
      // Override y to align to top with padding
      setViewport({ x: viewport.x, y: 30, zoom: viewport.zoom }, { duration: 0 })
    }, 100)
    return () => clearTimeout(timer)
  }, [nodes, setViewport])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const graphNode = model.byEk.get(node.id)
      if (graphNode) onSelect(graphNode)
    },
    [model, onSelect],
  )

  const handleResetLayout = useCallback(() => {
    const layouted = applyDagreLayout(initialNodes, initialEdges)
    setNodes(layouted)
  }, [initialNodes, initialEdges, setNodes])

  return (
    <div className="graph-canvas-container">
      <div ref={flowRef} className="graph-canvas-flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background />
          <Controls position="bottom-left" showInteractive={false}>
            <button
              type="button"
              className="react-flow__controls-button graph-canvas-reset-btn"
              onClick={handleResetLayout}
              title="Reset layout"
            >
              ↻
            </button>
          </Controls>
          <MiniMap position="bottom-right" pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Graph → xyflow nodes/edges
// ---------------------------------------------------------------------------

function buildFlowGraph(
  model: GraphModel,
  catalogTypes: readonly CatalogType[],
  catalogDetails: ReadonlyMap<string, CatalogDetailResponse>,
  selectedEk: string | null,
): { initialNodes: Node[]; initialEdges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  for (let i = 0; i < model.nodes.length; i++) {
    const node = model.nodes[i]!
    const type = typeString(node['@type']) ?? 'Unknown'
    // Use _ek (edit key) as the stable node identity for the canvas
    const ek = node[EDIT_KEY]
    const id = typeof ek === 'string' ? ek : `__synthetic:${type}:${i}`

    const category = entityCategory(node, catalogTypes)
    const detail = catalogDetails.get(type) ?? null
    const classifications = classifyNodeProperties(node, detail)
    const { requiredSet, requiredTotal } = countRequired(classifications)

    nodes.push({
      id,
      type: 'entity',
      position: { x: 0, y: 0 },
      data: {
        type,
        id,
        category,
        requiredSet,
        requiredTotal,
        selected: id === selectedEk,
      },
    })
  }

  // Build @id → _ek mapping so edges can connect React Flow nodes by _ek
  const idToEk = new Map<string, string>()
  for (const node of model.nodes) {
    const nid = node['@id']
    const nek = node[EDIT_KEY]
    if (typeof nid === 'string' && typeof nek === 'string') {
      idToEk.set(nid, nek)
    }
  }

  for (const node of model.nodes) {
    const sourceEk = node[EDIT_KEY]
    if (typeof sourceEk !== 'string') continue

    for (const [property, value] of Object.entries(node)) {
      if (
        property === '@type' ||
        property === '@id' ||
        property === '@context' ||
        property === EDIT_KEY
      )
        continue
      const refId = extractRefId(value)
      if (refId) {
        const targetEk = idToEk.get(refId)
        if (targetEk) {
          edges.push({
            id: `${sourceEk}-${property}-${targetEk}`,
            source: sourceEk,
            target: targetEk,
            label: property,
            animated: false,
            style: { stroke: 'var(--color-border)' },
          })
        }
      }
    }
  }

  const layoutedNodes = applyDagreLayout(nodes, edges)
  return { initialNodes: layoutedNodes, initialEdges: edges }
}

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const layoutGraph = new dagre.graphlib.Graph()
  layoutGraph.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 120 })
  layoutGraph.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    layoutGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    layoutGraph.setEdge(edge.source, edge.target)
  }

  dagre.layout(layoutGraph)

  return nodes.map((node) => {
    const pos = layoutGraph.node(node.id)
    return {
      ...node,
      position: {
        x: (pos?.x ?? 0) - NODE_WIDTH / 2,
        y: (pos?.y ?? 0) - NODE_HEIGHT / 2,
      },
    }
  })
}

function extractRefId(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  return typeof obj['@id'] === 'string' ? obj['@id'] : null
}
