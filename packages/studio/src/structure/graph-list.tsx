import type { ReactElement } from 'react'
import type { GraphViewProps } from './graph-canvas.js'
import { linkLines } from './graph-model.js'
import { NodeFace } from './graph-node.js'

/**
 * The graph as a list, for a narrow screen and as the canvas's plain
 * alternative: each node a button with its type, `@id` and chips, and its
 * links in words under it.
 */
export function GraphList({ graph, selected, onSelect }: GraphViewProps): ReactElement {
  return (
    <ul className="structure-graph-list" aria-label="Graph nodes">
      {graph.nodes.map((node) => {
        const links = linkLines(graph, node.key)
        return (
          <li key={node.key} className="structure-graph-item">
            <button
              type="button"
              className="structure-node structure-node--list"
              data-kind={node.kind}
              aria-pressed={selected === node.key}
              onClick={() => onSelect(node.key)}
            >
              <NodeFace node={node} />
            </button>
            {links.length > 0 && (
              <ul className="structure-graph-links" aria-label={`Links of ${node.type}`}>
                {links.map((line) => (
                  <li key={line}>
                    <code>{line}</code>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
