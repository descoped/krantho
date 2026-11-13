import { Handle, Position } from '@xyflow/react'
import { type CatalogCategory, shortenId } from '../../lib/jsonld-graph.js'
import { CategoryBadge } from './CategoryBadge.js'

/**
 * Custom xyflow node component that mirrors EntityCard styling.
 * Shows @type, optional @id, category badge, and compact eligibility meter.
 *
 * Uses Record<string, unknown> for xyflow type compatibility with
 * exactOptionalPropertyTypes. Properties are accessed with type narrowing.
 */
export function CanvasEntityNode({ data }: { data: Record<string, unknown> }): React.ReactElement {
  const type = data.type as string
  const id = data.id as string | undefined
  const category = data.category as CatalogCategory | null
  const requiredSet = data.requiredSet as number
  const requiredTotal = data.requiredTotal as number
  const selected = data.selected as boolean

  return (
    <div
      className={`canvas-entity-node ${selected ? 'canvas-entity-node--selected' : ''} ${category ? `canvas-entity-node--${category}` : ''}`}
    >
      <Handle type="target" position={Position.Top} className="canvas-handle" />

      <div className="canvas-entity-node-header">
        <span className="canvas-entity-node-type">{type}</span>
        <CategoryBadge category={category} />
      </div>

      {id && !id.startsWith('__synthetic:') && (
        <div className="canvas-entity-node-id">{shortenId(id)}</div>
      )}

      {requiredTotal > 0 && (
        <div
          className={`canvas-entity-node-meter ${requiredSet === requiredTotal ? 'canvas-entity-node-meter--complete' : ''}`}
        >
          {requiredSet}/{requiredTotal} required
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="canvas-handle" />
    </div>
  )
}
