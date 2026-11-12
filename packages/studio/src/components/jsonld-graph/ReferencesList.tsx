import { ArrowUpRight } from 'lucide-react'
import { type GraphReference, typeString } from '../../lib/jsonld-graph.js'

interface ReferencesListProps {
  references: readonly GraphReference[]
  onFollow?: (id: string) => void
}

/**
 * Compact reverse-reference list. Each entry shows which node points at
 * the currently selected entity and through which property. Clicking an
 * entry focuses the source entity in the tree.
 */
export function ReferencesList({ references, onFollow }: ReferencesListProps): React.ReactElement {
  if (references.length === 0) {
    return <p className="graph-references-empty">No inbound references.</p>
  }
  return (
    <ul className="graph-references-list">
      {references.map((ref, idx) => {
        const sourceId = ref.source['@id']
        const sourceType = typeString(ref.source['@type']) ?? 'Node'
        const key = `${sourceId ?? 'anon'}-${ref.property}-${idx}`
        return (
          <li key={key} className="graph-references-item">
            <button
              type="button"
              className="graph-references-link"
              onClick={() => sourceId && onFollow?.(sourceId)}
              disabled={sourceId === undefined}
            >
              <ArrowUpRight size={12} />
              <span className="graph-references-source">{sourceType}</span>
              <span className="graph-references-property">.{ref.property}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
