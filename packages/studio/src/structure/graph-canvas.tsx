import { type ReactElement, useId, useMemo } from 'react'
import { type EdgePath, layoutGraph, NODE_HEIGHT, NODE_WIDTH } from './graph-layout.js'
import { type GraphNodeView, linkLines, type PageGraph } from './graph-model.js'
import { NodeFace } from './graph-node.js'

export interface GraphViewProps {
  graph: PageGraph
  selected: string | null
  onSelect: (key: string) => void
}

function pathOf(points: EdgePath['points']): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
}

/** One link: its line with an arrowhead, and its property at the middle */
function Edge({ edge, marker }: { edge: EdgePath; marker: string }): ReactElement {
  return (
    <g>
      <path
        d={pathOf(edge.points)}
        className="structure-canvas-edge"
        markerEnd={`url(#${marker})`}
      />
      <text
        x={edge.labelX}
        y={edge.labelY}
        className="structure-canvas-label"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {edge.property}
      </text>
    </g>
  )
}

/** The links, drawn behind the nodes; each labelled with the property that makes it */
function Edges(props: { edges: readonly EdgePath[]; width: number; height: number }): ReactElement {
  const marker = useId()
  return (
    <svg
      className="structure-canvas-edges"
      width={props.width}
      height={props.height}
      aria-hidden="true"
    >
      <defs>
        <marker
          id={marker}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" className="structure-canvas-arrow" />
        </marker>
      </defs>
      {props.edges.map((edge) => (
        <Edge key={edge.key} edge={edge} marker={marker} />
      ))}
    </svg>
  )
}

interface NodeButtonProps {
  node: GraphNodeView
  /** Its links as words: what the drawn lines say, for a screen reader */
  links: readonly string[]
  x: number
  y: number
  selected: boolean
  onSelect: (key: string) => void
}

function NodeButton({ node, links, x, y, selected, onSelect }: NodeButtonProps): ReactElement {
  return (
    <button
      type="button"
      className="structure-node structure-node--canvas"
      data-kind={node.kind}
      aria-pressed={selected}
      style={{
        left: x - NODE_WIDTH / 2,
        top: y - NODE_HEIGHT / 2,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }}
      onClick={() => onSelect(node.key)}
    >
      <NodeFace node={node} />
      {links.length > 0 && <span className="visually-hidden">Links: {links.join('; ')}</span>}
    </button>
  )
}

/**
 * The graph as a canvas: nodes are buttons, in the order the page serves
 * them, so Tab walks the graph and Enter selects; the links are drawn
 * behind them, each labelled with its property, and each node names its
 * links in words. Below 1200px the list shows the same graph instead.
 */
export function GraphCanvas({ graph, selected, onSelect }: GraphViewProps): ReactElement {
  const layout = useMemo(() => layoutGraph(graph), [graph])
  const byKey = new Map(graph.nodes.map((node) => [node.key, node]))
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region is reachable by keyboard
    <section className="structure-canvas" aria-label="Graph canvas" tabIndex={0}>
      <div
        className="structure-canvas-stage"
        style={{ width: layout.width, height: layout.height }}
      >
        <Edges edges={layout.edges} width={layout.width} height={layout.height} />
        {layout.nodes.map((box) => {
          const node = byKey.get(box.key)
          return node ? (
            <NodeButton
              key={box.key}
              node={node}
              links={linkLines(graph, box.key)}
              x={box.x}
              y={box.y}
              selected={selected === box.key}
              onSelect={onSelect}
            />
          ) : null
        })}
      </div>
    </section>
  )
}
