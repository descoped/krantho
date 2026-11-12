import { useState } from 'react'
import type { CatalogDetailResponse, CatalogType } from '../../lib/api-types.js'
import {
  classifyNodeProperties,
  entityCategory,
  type GraphNode,
  orderedProperties,
} from '../../lib/jsonld-graph.js'
import { EntityHeader } from './EntityHeader.js'
import { PropertyRow } from './PropertyRow.js'
import './entity-card.css'

interface EntityCardProps {
  node: GraphNode
  catalogTypes: readonly CatalogType[]
  catalogDetail: CatalogDetailResponse | null
  selected: boolean
  focused: boolean
  onSelect: (node: GraphNode) => void
  onFollowReference: (referenceId: string) => void
  initiallyExpanded?: boolean
}

/**
 * Expandable entity card. Renders the `EntityHeader` (always visible) and
 * an ordered property list when expanded. Selection is driven by the
 * parent — the card reports clicks via `onSelect`. The expanded state is
 * local to the card and defaults to closed except for explicitly requested
 * open state (e.g. the primary entity starts expanded).
 */
export function EntityCard({
  node,
  catalogTypes,
  catalogDetail,
  selected,
  focused,
  onSelect,
  onFollowReference,
  initiallyExpanded = false,
}: EntityCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(initiallyExpanded)

  const category = entityCategory(node, catalogTypes)
  const classifications = classifyNodeProperties(node, catalogDetail)
  const ordered = orderedProperties(classifications)
  const hasMissingRequired = classifications.some(
    (c) => c.importance === 'required' && c.state === 'missing',
  )

  return (
    <div
      className={`graph-entity-card ${selected ? 'graph-entity-card--selected' : ''} ${hasMissingRequired ? 'graph-entity-card--missing-required' : ''}`}
      data-entity-id={node['@id'] ?? ''}
      role="treeitem"
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-expanded={expanded}
    >
      <EntityHeader
        node={node}
        category={category}
        classifications={classifications}
        selected={selected}
        focused={focused}
        onSelect={() => onSelect(node)}
        onToggleExpanded={() => setExpanded((v) => !v)}
        expanded={expanded}
      />
      {expanded && (
        <div className="graph-entity-body">
          {ordered.length === 0 ? (
            <p className="graph-entity-empty">No properties.</p>
          ) : (
            <div className="graph-property-list">
              {ordered.map((c) => (
                <PropertyRow
                  key={c.property}
                  classification={c}
                  onFollowReference={onFollowReference}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
