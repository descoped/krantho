import {
  type CatalogCategory,
  countRequired,
  type GraphNode,
  type PropertyClassification,
  typeString,
} from '../../lib/jsonld-graph.js'
import { CategoryBadge } from './CategoryBadge.js'

interface EntityHeaderProps {
  node: GraphNode
  category: CatalogCategory | null
  classifications: readonly PropertyClassification[]
  selected: boolean
  focused: boolean
  onSelect: () => void
  onToggleExpanded: () => void
  expanded: boolean
}

/**
 * Clickable header for an entity card. Shows the `@type` label, optional
 * `@id` chip, category badge, and a compact eligibility indicator counting
 * how many required properties are set.
 *
 * Selection and expansion are decoupled — clicking the card body selects
 * (updates the right-hand panel), while a separate disclosure button
 * toggles property-list expansion.
 */
export function EntityHeader({
  node,
  category,
  classifications,
  selected,
  focused,
  onSelect,
  onToggleExpanded,
  expanded,
}: EntityHeaderProps): React.ReactElement {
  const type = typeString(node['@type']) ?? 'Unknown'
  const id = node['@id']
  const name = getDisplayName(node)
  const { requiredSet, requiredTotal } = countRequired(classifications)

  return (
    <div
      className={[
        'graph-entity-header',
        selected ? 'graph-entity-header--selected' : '',
        focused ? 'graph-focused' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="graph-entity-expand-button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleExpanded()
        }}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse entity' : 'Expand entity'}
      >
        <span className={`graph-entity-chevron ${expanded ? 'graph-entity-chevron--open' : ''}`}>
          ▸
        </span>
      </button>

      <button type="button" className="graph-entity-header-main" onClick={onSelect}>
        <div className="graph-entity-header-row">
          <span className="graph-entity-type">{type}</span>
          {name && <span className="graph-entity-name">{name}</span>}
          <CategoryBadge category={category} />
        </div>
        <div className="graph-entity-header-meta">
          {id && <span className="graph-entity-id">{id}</span>}
          {requiredTotal > 0 && (
            <span
              className={`graph-entity-eligibility ${
                requiredSet === requiredTotal
                  ? 'graph-entity-eligibility--complete'
                  : 'graph-entity-eligibility--incomplete'
              }`}
              title={`${requiredSet} of ${requiredTotal} required properties set`}
            >
              {requiredSet}/{requiredTotal} required
            </span>
          )}
        </div>
      </button>
    </div>
  )
}

function getDisplayName(node: GraphNode): string | null {
  const candidates = ['name', 'headline', 'title']
  for (const key of candidates) {
    const value = node[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}
